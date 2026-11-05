import { NextResponse } from "next/server";
import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { isIrreversibleTask, DESKTOP_TOOLS } from "../../../../lib/tasks/safety";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const { toolName, args = {}, userConfirmed = false } = body;

    const toolDef = DESKTOP_TOOLS[toolName];
    if (!toolDef) {
      return NextResponse.json(
        { ok: false, error: `Unknown tool: ${toolName}` },
        { status: 400 }
      );
    }

    // MANDATORY HUMAN-IN-THE-LOOP CHECK FOR IRREVERSIBLE ACTIONS
    if (isIrreversibleTask(toolName) && !userConfirmed) {
      return NextResponse.json(
        {
          ok: false,
          requiresConfirmation: true,
          safetyTier: "IRREVERSIBLE",
          warning: toolDef.riskWarning,
          error: "Action requires explicit user confirmation before executing.",
        },
        { status: 403 }
      );
    }

    // Execute requested desktop task
    switch (toolName) {
      case "open_url": {
        const { url } = args;
        if (!url || typeof url !== "string") {
          return NextResponse.json({ ok: false, error: "Missing or invalid URL" });
        }
        // Windows command to open URL in default browser
        const cmd = process.platform === "win32" ? `start "" "${url}"` : `open "${url}"`;
        exec(cmd);
        return NextResponse.json({ ok: true, message: `Opened URL: ${url}` });
      }

      case "launch_application": {
        const { appName } = args;
        const safeApps: Record<string, string> = {
          notepad: "notepad",
          calc: "calc",
          calculator: "calc",
          explorer: "explorer .",
        };
        const appCmd = safeApps[appName?.toLowerCase()?.trim()] || `start ${appName}`;
        exec(appCmd);
        return NextResponse.json({ ok: true, message: `Launched ${appName}` });
      }

      case "get_system_time_info": {
        const now = new Date();
        return NextResponse.json({
          ok: true,
          time: now.toLocaleTimeString(),
          date: now.toLocaleDateString(),
          iso: now.toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      }

      case "create_desktop_note": {
        const { title, content } = args;
        const notesDir = path.resolve(process.cwd(), "companion-notes");
        await fs.mkdir(notesDir, { recursive: true });
        const safeFilename = `${title.replace(/[^a-zA-Z0-9_-]/g, "_")}.txt`;
        const notePath = path.join(notesDir, safeFilename);
        await fs.writeFile(notePath, content, "utf8");
        return NextResponse.json({
          ok: true,
          message: `Note saved to companion-notes/${safeFilename}`,
        });
      }

      case "read_local_file": {
        const { filePath } = args;
        const resolved = path.resolve(process.cwd(), filePath);
        const data = await fs.readFile(resolved, "utf8");
        return NextResponse.json({ ok: true, content: data.slice(0, 4000) });
      }

      case "delete_file": {
        const { filePath } = args;
        const resolved = path.resolve(process.cwd(), filePath);
        await fs.unlink(resolved);
        return NextResponse.json({
          ok: true,
          message: `Permanently deleted file: ${filePath}`,
        });
      }

      case "run_terminal_command": {
        const { command } = args;
        return new Promise<Response>((resolve) => {
          exec(command, { timeout: 15000 }, (err, stdout, stderr) => {
            if (err) {
              resolve(
                NextResponse.json({
                  ok: false,
                  error: err.message,
                  stderr,
                })
              );
            } else {
              resolve(
                NextResponse.json({
                  ok: true,
                  stdout: stdout.slice(0, 3000),
                })
              );
            }
          });
        });
      }

      case "overwrite_file": {
        const { filePath, content } = args;
        const resolved = path.resolve(process.cwd(), filePath);
        await fs.writeFile(resolved, content, "utf8");
        return NextResponse.json({
          ok: true,
          message: `Successfully overwrote file: ${filePath}`,
        });
      }

      default:
        return NextResponse.json({ ok: false, error: "Unimplemented tool" });
    }
  } catch (error: any) {
    console.error("Task execution failed:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Execution error" },
      { status: 500 }
    );
  }
}
