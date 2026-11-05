import { GoogleGenAI, Modality } from "@google/genai";
import { NextResponse } from "next/server";
import { getMemories, formatMemoriesForPrompt } from "../../../lib/memory";
import { getGeminiDesktopToolDeclarations } from "../../../lib/tasks/safety";

export const runtime = "nodejs";

export async function POST() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is missing from .env.local" },
      { status: 500 }
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Fetch user memories from Supabase or fallback
    const memories = await getMemories("default_user");
    const memoriesBlock = formatMemoriesForPrompt(memories);

    // Desktop tool declarations
    const desktopTools = getGeminiDesktopToolDeclarations();

    const systemPrompt = `You are Mira, an intelligent, empathetic, and lifelike 3D AI companion and personal talking assistant.
You speak naturally, warmly, and concisely. Keep responses conversational and direct since they are spoken aloud.

WHAT YOU REMEMBER ABOUT THE USER:
${memoriesBlock}

CAPABILITIES & DESKTOP TASKS:
You have access to tools to help the user perform desktop tasks, including:
- open_url: Open any website in the user's web browser.
- launch_application: Open desktop apps like notepad, calc, or explorer.
- get_system_time_info: Check the current time and date.
- create_desktop_note: Write down quick thoughts or reminders.
- read_local_file: Read files.
- delete_file: Permanently delete a file (IRREVERSIBLE).
- run_terminal_command: Run a shell command (IRREVERSIBLE).
- overwrite_file: Overwrite existing file content (IRREVERSIBLE).

CRITICAL SAFETY PROTOCOL FOR IRREVERSIBLE TASKS:
When asked to perform an IRREVERSIBLE or destructive action (deleting files, executing shell commands, or overwriting files), call the corresponding tool immediately. The companion UI will automatically pause and display an interactive safety confirmation modal on the user's screen.
Verbally inform the user: "I've queued this task, but since it's irreversible, please approve it on your screen to proceed."
Never attempt destructive tasks without invoking the proper tool.`;

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: "models/gemini-3.8-live",
          config: {
            responseModalities: [Modality.AUDIO],
            sessionResumption: {},
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
            tools: [{ functionDeclarations: desktopTools }],
          },
        },
      },
    });

    return NextResponse.json({
      token: token.name,
    });
  } catch (error) {
    console.error("Live token creation failed:", error);

    return NextResponse.json(
      { error: "Could not create a Gemini Live token" },
      { status: 500 }
    );
  }
}
