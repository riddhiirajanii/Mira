import { FunctionDeclaration, Type } from "@google/genai";

export type TaskSafetyTier = "SAFE" | "IRREVERSIBLE";

export interface DesktopToolDefinition {
  name: string;
  description: string;
  safetyTier: TaskSafetyTier;
  riskWarning?: string;
  declaration: FunctionDeclaration;
}

export const DESKTOP_TOOLS: Record<string, DesktopToolDefinition> = {
  open_url: {
    name: "open_url",
    description: "Opens a website URL in the user's default browser.",
    safetyTier: "SAFE",
    declaration: {
      name: "open_url",
      description: "Opens a website URL in the user's default web browser.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          url: {
            type: Type.STRING,
            description: "The complete web URL to open (e.g., https://google.com).",
          },
        },
        required: ["url"],
      },
    },
  },

  launch_application: {
    name: "launch_application",
    description: "Launches a desktop application like Notepad, Calculator, or Explorer.",
    safetyTier: "SAFE",
    declaration: {
      name: "launch_application",
      description: "Opens a standard desktop application on the user's computer.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          appName: {
            type: Type.STRING,
            description: "The application name or command (e.g., notepad, calc, explorer).",
          },
        },
        required: ["appName"],
      },
    },
  },

  get_system_time_info: {
    name: "get_system_time_info",
    description: "Retrieves current desktop local time, date, and timezone.",
    safetyTier: "SAFE",
    declaration: {
      name: "get_system_time_info",
      description: "Gets the current system time, date, and timezone info.",
      parameters: {
        type: Type.OBJECT,
        properties: {},
      },
    },
  },

  create_desktop_note: {
    name: "create_desktop_note",
    description: "Creates and saves a text note to the user's companion notes folder.",
    safetyTier: "SAFE",
    declaration: {
      name: "create_desktop_note",
      description: "Saves a quick text note to the companion workspace notes.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: "Title of the note.",
          },
          content: {
            type: Type.STRING,
            description: "The text content of the note.",
          },
        },
        required: ["title", "content"],
      },
    },
  },

  read_local_file: {
    name: "read_local_file",
    description: "Reads the text contents of a file.",
    safetyTier: "SAFE",
    declaration: {
      name: "read_local_file",
      description: "Reads the text contents of a file in the workspace.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          filePath: {
            type: Type.STRING,
            description: "Relative or absolute path to the file.",
          },
        },
        required: ["filePath"],
      },
    },
  },

  delete_file: {
    name: "delete_file",
    description: "Permanently deletes a file from the disk.",
    safetyTier: "IRREVERSIBLE",
    riskWarning:
      "Permanent file deletion cannot be undone. Once deleted, this file is lost.",
    declaration: {
      name: "delete_file",
      description:
        "Permanently deletes a file from disk. Requires human confirmation.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          filePath: {
            type: Type.STRING,
            description: "The path of the file to permanently delete.",
          },
          reason: {
            type: Type.STRING,
            description: "Reason or context for deleting this file.",
          },
        },
        required: ["filePath"],
      },
    },
  },

  run_terminal_command: {
    name: "run_terminal_command",
    description: "Executes a shell or PowerShell command on the host computer.",
    safetyTier: "IRREVERSIBLE",
    riskWarning:
      "Running shell commands may alter system configuration or delete directories.",
    declaration: {
      name: "run_terminal_command",
      description:
        "Executes a shell command on the host computer. Requires human confirmation.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          command: {
            type: Type.STRING,
            description: "The shell command string to execute.",
          },
        },
        required: ["command"],
      },
    },
  },

  overwrite_file: {
    name: "overwrite_file",
    description: "Replaces the entire contents of an existing file.",
    safetyTier: "IRREVERSIBLE",
    riskWarning:
      "Overwriting replaces all previous content in this file without recovery.",
    declaration: {
      name: "overwrite_file",
      description:
        "Overwrites an existing file on disk. Requires human confirmation.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          filePath: {
            type: Type.STRING,
            description: "Path of the file to overwrite.",
          },
          content: {
            type: Type.STRING,
            description: "The new content to write.",
          },
        },
        required: ["filePath", "content"],
      },
    },
  },
};

/**
 * Checks whether a tool call is classified as irreversible/destructive.
 */
export function isIrreversibleTask(toolName: string): boolean {
  return DESKTOP_TOOLS[toolName]?.safetyTier === "IRREVERSIBLE";
}

/**
 * Formats tool declarations for Gemini API tools config.
 */
export function getGeminiDesktopToolDeclarations(): FunctionDeclaration[] {
  return Object.values(DESKTOP_TOOLS).map((t) => t.declaration);
}
