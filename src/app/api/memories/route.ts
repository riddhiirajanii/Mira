import { NextResponse } from "next/server";
import { getMemories, saveMemory, deleteMemory } from "../../../lib/memory";
import { MemoryCategory } from "../../../types/memory";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "default_user";

    const memories = await getMemories(userId);
    return NextResponse.json({ ok: true, memories });
  } catch (error) {
    console.error("GET /api/memories failed:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch memories" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fact, category = "general", importance = 3, userId = "default_user" } = body;

    if (!fact || typeof fact !== "string") {
      return NextResponse.json(
        { ok: false, error: "A valid 'fact' string is required" },
        { status: 400 }
      );
    }

    const memory = await saveMemory(
      fact,
      category as MemoryCategory,
      Number(importance),
      userId
    );

    return NextResponse.json({ ok: true, memory });
  } catch (error) {
    console.error("POST /api/memories failed:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to create memory" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Memory 'id' is required" },
        { status: 400 }
      );
    }

    const success = await deleteMemory(id);
    return NextResponse.json({ ok: success });
  } catch (error) {
    console.error("DELETE /api/memories failed:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to delete memory" },
      { status: 500 }
    );
  }
}
