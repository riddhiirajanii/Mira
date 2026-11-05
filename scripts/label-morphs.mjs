import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import fs from "node:fs/promises";
import sharp from "sharp";

dotenv.config({ path: ".env.local" });

const INPUT_FILE =
  process.env.MORPH_INPUT_FILE || "mira-Object_9-morph-comparisons.json";
const OUTPUT_FILE =
  process.env.MORPH_OUTPUT_FILE || "mira-Object_9-labeled.json";

// Make sure this id is valid for your API key. A wrong id fails every batch with a 404.
const MODEL = process.env.GEMINI_VISION_MODEL || "gemini-3.8-flash";

// Smaller batches = bigger tiles = better labels. 8 is a good default.
const BATCH_SIZE = Number(process.env.MORPH_BATCH_SIZE || 8);

// MORPH_LIMIT=0 processes every target. The default of 10 is only a smoke test.
const LIMIT = Number(process.env.MORPH_LIMIT || 10);

// Minimum gap between API calls. Raiase it if you still see 429s (free tier: try 12000).
const MIN_INTERVAL_MS = Number(process.env.MORPH_MIN_INTERVAL_MS || 6000);

const MAX_ATTEMPTS = 6;

// Tile layout: two square views (neutral | morphed), zoomed on the changed region.
const VIEW = 300;
const HEADER_HEIGHT = 34;
const CAPTION_HEIGHT = 20;
const TILE_WIDTH = VIEW * 2 + 6;
const TILE_HEIGHT = HEADER_HEIGHT + CAPTION_HEIGHT + VIEW + 2;
const TILE_GAP = 12;
const COLUMNS = 2;

// Pixel-diff settings (sum of abs RGB difference per pixel).
const DIFF_THRESHOLD = 45;
const MIN_CHANGED_PIXELS = 30;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let lastCall = 0;
async function pace() {
  const wait = lastCall + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
}

function parseImage(dataUrl) {
  const match = dataUrl?.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/
  );
  if (!match) return null;
  return { mimeType: match[1], data: Buffer.from(match[2], "base64") };
}

function isSuccessful(target) {
  return (
    typeof target?.description === "string" &&
    target.description.trim().length > 0 &&
    !target.error
  );
}

const getErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const isRetryable = (error) =>
  /\b(429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|temporar/i.test(
    getErrorMessage(error)
  );

// A per-day quota will not recover by waiting a few seconds.
const isDailyQuota = (error) =>
  /PerDay|per day|daily/i.test(getErrorMessage(error));

// Gemini errors usually say how long to wait, e.g. "retryDelay":"32s"
function serverRetryDelayMs(error) {
  const m = getErrorMessage(error).match(
    /retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s|retry in (\d+(?:\.\d+)?)s/i
  );
  const seconds = m ? Number(m[1] ?? m[2]) : NaN;
  return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : null;
}

async function generateWithRetry(ai, request, batchLabel) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await pace();
      return await ai.models.generateContent(request);
    } catch (error) {
      if (
        isDailyQuota(error) ||
        !isRetryable(error) ||
        attempt === MAX_ATTEMPTS
      ) {
        throw error;
      }

      const delay =
        (serverRetryDelayMs(error) ??
          Math.min(5000 * 2 ** (attempt - 1), 90000)) +
        Math.floor(Math.random() * 1500);

      console.warn(
        `${batchLabel}: retrying in ${Math.ceil(delay / 1000)}s ` +
          `(${attempt}/${MAX_ATTEMPTS - 1})`
      );
      await sleep(delay);
    }
  }
  throw new Error("Retry loop ended unexpectedly.");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Compare neutral vs morphed pixels, find where the face changed,
 * and return a square crop around that region plus simple stats.
 */
async function analyzeDiff(neutralBuf, morphBuf) {
  const a = await sharp(neutralBuf)
    .rotate()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = a.info;

  const b = await sharp(morphBuf)
    .rotate()
    .removeAlpha()
    .resize(width, height, { fit: "fill" })
    .raw()
    .toBuffer();

  let minX = width, minY = height, maxX = -1, maxY = -1;
  let count = 0, sumX = 0, sumY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const d =
        Math.abs(a.data[i] - b[i]) +
        Math.abs(a.data[i + 1] - b[i + 1]) +
        Math.abs(a.data[i + 2] - b[i + 2]);

      if (d > DIFF_THRESHOLD) {
        count++;
        sumX += x;
        sumY += y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const shortSide = Math.min(width, height);

  if (count < MIN_CHANGED_PIXELS) {
    // Nothing visibly changed: show the middle of the frame.
    const side = shortSide;
    return {
      width,
      height,
      crop: {
        left: Math.floor((width - side) / 2),
        top: Math.floor((height - side) / 2),
        width: side,
        height: side,
      },
      stats: { visible: false, changedFraction: 0, center: null },
    };
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const boxSide = Math.max(maxX - minX, maxY - minY) * 1.6;
  const side = Math.round(clamp(boxSide, shortSide * 0.3, shortSide));

  return {
    width,
    height,
    crop: {
      left: Math.round(clamp(cx - side / 2, 0, width - side)),
      top: Math.round(clamp(cy - side / 2, 0, height - side)),
      width: side,
      height: side,
    },
    stats: {
      visible: true,
      changedFraction: +(count / (width * height)).toFixed(5),
      // 0..1 within the screenshot; x is measured from the VIEWER's left
      center: {
        x: +(sumX / count / width).toFixed(2),
        y: +(sumY / count / height).toFixed(2),
      },
    },
  };
}

async function cropView(buf, width, height, crop) {
  const resized = await sharp(buf)
    .rotate()
    .removeAlpha()
    .resize(width, height, { fit: "fill" })
    .toBuffer();

  return sharp(resized)
    .extract(crop)
    .resize(VIEW, VIEW, { fit: "contain", background: "#f0f0f0" })
    .png()
    .toBuffer();
}

async function createContactSheet(batch, neutralReference) {
  const rows = Math.ceil(batch.length / COLUMNS);
  const sheetWidth = COLUMNS * TILE_WIDTH + (COLUMNS + 1) * TILE_GAP;
  const sheetHeight = rows * TILE_HEIGHT + (rows + 1) * TILE_GAP;

  const composites = [];
  const diffs = new Map();

  for (let i = 0; i < batch.length; i++) {
    const target = batch[i];
    const neutral = parseImage(target.neutralScreenshot || neutralReference);
    const morphed = parseImage(target.screenshot);

    if (!neutral || !morphed) {
      throw new Error(`Morph ${target.index}: missing or invalid screenshot`);
    }

    const { width, height, crop, stats } = await analyzeDiff(
      neutral.data,
      morphed.data
    );
    diffs.set(target.index, stats);

    const neutralPng = await cropView(neutral.data, width, height, crop);
    const morphedPng = await cropView(morphed.data, width, height, crop);

    const x = TILE_GAP + (i % COLUMNS) * (TILE_WIDTH + TILE_GAP);
    const y = TILE_GAP + Math.floor(i / COLUMNS) * (TILE_HEIGHT + TILE_GAP);

    const header = Buffer.from(`
      <svg width="${TILE_WIDTH}" height="${HEADER_HEIGHT}">
        <rect width="100%" height="100%" fill="#252525"/>
        <text x="10" y="23" font-size="17" font-family="Arial, sans-serif" fill="white">
          ${escapeXml(`Morph ${target.index}`)}
        </text>
      </svg>`);

    const captions = Buffer.from(`
      <svg width="${TILE_WIDTH}" height="${CAPTION_HEIGHT}">
        <text x="5" y="15" font-size="12" font-family="Arial, sans-serif" fill="#222">NEUTRAL</text>
        <text x="${VIEW + 6}" y="15" font-size="12" font-family="Arial, sans-serif" fill="#222">MORPHED</text>
      </svg>`);

    const viewTop = y + HEADER_HEIGHT + CAPTION_HEIGHT;

    composites.push(
      { input: header, left: x, top: y },
      { input: captions, left: x, top: y + HEADER_HEIGHT },
      { input: neutralPng, left: x + 2, top: viewTop },
      { input: morphedPng, left: x + VIEW + 4, top: viewTop }
    );
  }

  const sheet = await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 3,
      background: "#ffffff",
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return { sheet, diffs };
}

function extractJson(text) {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  return JSON.parse(cleaned);
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    morphs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.INTEGER },
          visible_change: { type: Type.STRING },
          features: { type: Type.ARRAY, items: { type: Type.STRING } },
          possible_function: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          needs_human_review: { type: Type.BOOLEAN },
        },
        required: [
          "index",
          "visible_change",
          "features",
          "possible_function",
          "confidence",
          "needs_human_review",
        ],
      },
    },
  },
  required: ["morphs"],
};

// Do not write base64 screenshots back into the output file.
const slim = ({ screenshot, neutralScreenshot, ...rest }) => rest;

async function saveOutput(source, results) {
  const output = {
    mesh: source.mesh,
    totalTargetsInSource: source.totalTargets ?? source.targets.length,
    analyzedCount: results.filter(isSuccessful).length,
    attemptedCount: results.filter((t) => t.status).length,
    model: MODEL,
    comparisonMethod: `${BATCH_SIZE}_morph_diffcrop_contact_sheet`,
    generatedAt: new Date().toISOString(),
    targets: results.map(slim),
  };
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY was not loaded. Check .env.local.");
  }

  const source = JSON.parse(await fs.readFile(INPUT_FILE, "utf8"));
  if (!Array.isArray(source.targets) || !source.targets.length) {
    throw new Error(`No targets found in ${INPUT_FILE}`);
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  let previous = [];
  try {
    const existing = JSON.parse(await fs.readFile(OUTPUT_FILE, "utf8"));
    if (Array.isArray(existing.targets)) previous = existing.targets;
  } catch {
    // Start a new output file if none exists.
  }

  const keyOf = (t) => `${t.mesh}:${t.index}`;
  const previousByKey = new Map(previous.map((t) => [keyOf(t), t]));

  const results = source.targets.map((t) => {
    const old = previousByKey.get(keyOf(t));
    return old ? { ...t, ...old } : { ...t };
  });
  const resultIndex = new Map(results.map((t, i) => [keyOf(t), i]));

  const selected = LIMIT > 0 ? source.targets.slice(0, LIMIT) : source.targets;

  // Filter FIRST, then batch, so reruns never send half-empty or empty batches.
  const pendingAll = selected.filter(
    (t) => !isSuccessful(previousByKey.get(keyOf(t)))
  );

  const batches = [];
  for (let i = 0; i < pendingAll.length; i += BATCH_SIZE) {
    batches.push(pendingAll.slice(i, i + BATCH_SIZE));
  }

  console.log(`Model: ${MODEL}`);
  console.log(`Targets in file: ${source.targets.length}`);
  console.log(
    `Selected: ${selected.length}` +
      (LIMIT > 0 ? ` (MORPH_LIMIT=${LIMIT}; set MORPH_LIMIT=0 for all)` : "")
  );
  console.log(`Still to label: ${pendingAll.length} in ${batches.length} batches`);

  if (!batches.length) {
    console.log("Nothing to do.");
    return;
  }

  for (let b = 0; b < batches.length; b++) {
    const pending = batches[b];
    const label = `Batch ${b + 1}/${batches.length}`;
    console.log(`${label}: rendering ${pending.length} comparisons...`);

    let stopAll = false;

    try {
      const { sheet, diffs } = await createContactSheet(
        pending,
        source.neutralReference
      );

      await fs.writeFile(
        `morph-contact-sheet-${String(b + 1).padStart(2, "0")}.png`,
        sheet
      );

      const targetMetadata = pending.map((t) => ({
        index: t.index,
        strength: t.strength ?? 1,
        pixel_change_detected: diffs.get(t.index).visible,
        change_center_in_frame: diffs.get(t.index).center,
        changed_fraction_of_frame: diffs.get(t.index).changedFraction,
      }));

      const response = await generateWithRetry(
        ai,
        {
          model: MODEL,
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `
You are documenting facial blendshapes for a 3D avatar.

The image is a contact sheet. Each tile is labeled "Morph N" and shows
NEUTRAL (left) and MORPHED (right). Both views are cropped and zoomed to the
SAME region, the area that changed, so compare them directly.

Notes:
- Left and right are from the VIEWER's perspective. The character's own left
  is on the viewer's right. State which convention you use in each description.
- change_center_in_frame is where the change sits in the full, uncropped
  screenshot (x: 0 = viewer's left, y: 0 = top). Use it to decide the region.
- If pixel_change_detected is false, the morph has no visible effect from this
  camera angle: say so with low confidence.
- Do not assume standard ARKit naming. Use "unknown" when a function cannot be inferred.

Tile metadata, in reading order (left to right, top to bottom):
${JSON.stringify(targetMetadata, null, 2)}

Return one entry for every supplied index, using only those indices.
Keep visible_change concise and visually grounded.
Valid features: mouth, eyes, brows, cheeks, jaw, nose, head, other.
                  `.trim(),
                },
                {
                  inlineData: {
                    mimeType: "image/png",
                    data: sheet.toString("base64"),
                  },
                },
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.1,
          },
        },
        label
      );

      if (!response.text) throw new Error("Gemini returned an empty response.");

      const parsed = extractJson(response.text);
      if (!Array.isArray(parsed.morphs)) {
        throw new Error("Gemini response did not contain a morphs array.");
      }

      const returned = new Map(parsed.morphs.map((m) => [Number(m.index), m]));

      for (const target of pending) {
        const r = returned.get(Number(target.index));
        const i = resultIndex.get(keyOf(target));
        if (i === undefined) continue;

        if (!r) {
          results[i] = {
            ...target,
            description: "",
            status: "needs_review",
            error: "Gemini omitted this morph from the batch response.",
          };
          continue;
        }

        const updated = {
          ...target,
          description: r.visible_change ?? "",
          features: Array.isArray(r.features) ? r.features : [],
          possibleFunction: r.possible_function ?? "unknown",
          confidence:
            typeof r.confidence === "number" ? clamp(r.confidence, 0, 1) : 0,
          pixelDiff: diffs.get(target.index),
          status: "needs_review",
          needsHumanReview: r.needs_human_review !== false,
        };
        delete updated.error;
        results[i] = updated;
      }

      console.log(`${label}: received ${returned.size} morph labels.`);
    } catch (error) {
      const message = getErrorMessage(error);
      console.error(`${label} failed: ${message}`);

      if (isDailyQuota(error)) {
        // Do not mark these as failed. They stay pending for tomorrow's run.
        console.error(
          "Daily quota exhausted. Progress is saved; rerun later or switch API key/model."
        );
        stopAll = true;
      } else {
        for (const target of pending) {
          const i = resultIndex.get(keyOf(target));
          if (i !== undefined) {
            results[i] = {
              ...target,
              description: "",
              status: "needs_review",
              error: message,
            };
          }
        }
      }
    }

    await saveOutput(source, results);
    if (stopAll) break;
  }

  console.log(`\nSaved results to ${OUTPUT_FILE}`);
  console.log(
    `Successfully labeled: ${results.filter(isSuccessful).length}/${source.targets.length}`
  );
  console.log("Open morph-contact-sheet-XX.png to sanity-check what Gemini saw.");
}

main().catch((error) => {
  console.error("\nScript stopped:", getErrorMessage(error));
  process.exitCode = 1;
});
