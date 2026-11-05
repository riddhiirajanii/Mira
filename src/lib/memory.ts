import { supabase } from "./supabase/client";
import { Memory, MemoryCategory } from "../types/memory";

// In-memory fallback if Supabase credentials are not yet configured
let localMemoryStore: Memory[] = [
  {
    id: "mem-default-1",
    userId: "default_user",
    category: "personal",
    fact: "Mira is your AI companion and friendly talking assistant.",
    importance: 5,
    createdAt: new Date().toISOString(),
  },
  {
    id: "mem-default-2",
    userId: "default_user",
    category: "preference",
    fact: "Enjoys warm, natural, and thoughtful conversations.",
    importance: 4,
    createdAt: new Date().toISOString(),
  },
];

function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(
    url &&
      key &&
      !url.includes("your-project.supabase.co") &&
      !key.includes("your-anon-key")
  );
}

/**
 * Retrieve all memories for a user, sorted by importance and creation date.
 */
export async function getMemories(userId = "default_user"): Promise<Memory[]> {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from("memories")
        .select("*")
        .eq("user_id", userId)
        .order("importance", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("[Memory] Supabase fetch error, using local fallback:", error.message);
        return localMemoryStore;
      }

      if (data && data.length > 0) {
        return data.map((row) => ({
          id: row.id,
          userId: row.user_id,
          category: row.category as MemoryCategory,
          fact: row.fact,
          importance: row.importance ?? 3,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
      }
    } catch (err) {
      console.warn("[Memory] Network error talking to Supabase:", err);
    }
  }

  return localMemoryStore;
}

/**
 * Save a new memory entry.
 */
export async function saveMemory(
  fact: string,
  category: MemoryCategory = "general",
  importance = 3,
  userId = "default_user"
): Promise<Memory> {
  const newMemory: Memory = {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId,
    category,
    fact: fact.trim(),
    importance,
    createdAt: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from("memories")
        .insert({
          user_id: userId,
          category,
          fact: newMemory.fact,
          importance,
        })
        .select()
        .single();

      if (!error && data) {
        return {
          id: data.id,
          userId: data.user_id,
          category: data.category as MemoryCategory,
          fact: data.fact,
          importance: data.importance,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
      }
      console.warn("[Memory] Supabase insert warning:", error?.message);
    } catch (err) {
      console.warn("[Memory] Supabase insert exception:", err);
    }
  }

  localMemoryStore.unshift(newMemory);
  return newMemory;
}

/**
 * Delete a memory by its ID.
 */
export async function deleteMemory(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabase.from("memories").delete().eq("id", id);
      if (!error) return true;
      console.warn("[Memory] Supabase delete error:", error.message);
    } catch (err) {
      console.warn("[Memory] Supabase delete exception:", err);
    }
  }

  const initialLength = localMemoryStore.length;
  localMemoryStore = localMemoryStore.filter((m) => m.id !== id);
  return localMemoryStore.length < initialLength;
}

/**
 * Format memories as a bulleted text block suitable for Gemini system instructions.
 */
export function formatMemoriesForPrompt(memories: Memory[]): string {
  if (!memories.length) return "No prior memories recorded yet.";

  return memories
    .map(
      (m) =>
        `- [${m.category.toUpperCase()}] ${m.fact} (Importance: ${m.importance}/5)`
    )
    .join("\n");
}
