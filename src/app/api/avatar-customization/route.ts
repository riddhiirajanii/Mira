import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase/client";
import { DEFAULT_AVATAR_CUSTOMIZATION, AvatarCustomization } from "../../../types/avatar";

export const runtime = "nodejs";

let localCustomization = { ...DEFAULT_AVATAR_CUSTOMIZATION };

function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(
    url &&
      key &&
      !url.includes("https://jisvkaelmixpmntfozeb.supabase.co") &&
      !key.includes("sb_publishable_uTFXaOi0rC9tFa6OlEAs9A_-4N0dHhA")
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "default_user";

    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from("avatar_customizations")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (!error && data) {
        return NextResponse.json({
          ok: true,
          customization: {
            skinTone: data.skin_tone,
            eyeColor: data.eye_color,
            outfitColor: data.outfit_color,
            showOuterSuit: data.show_outer_suit,
          },
        });
      }
    }

    return NextResponse.json({ ok: true, customization: localCustomization });
  } catch (error) {
    console.error("GET /api/avatar-customization failed:", error);
    return NextResponse.json({ ok: true, customization: localCustomization });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      skinTone = localCustomization.skinTone,
      eyeColor = localCustomization.eyeColor,
      outfitColor = localCustomization.outfitColor,
      showOuterSuit = localCustomization.showOuterSuit,
      userId = "default_user",
    } = body;

    localCustomization = {
      skinTone,
      eyeColor,
      outfitColor,
      showOuterSuit,
    };

    if (isSupabaseConfigured()) {
      await supabase.from("avatar_customizations").upsert({
        user_id: userId,
        skin_tone: skinTone,
        eye_color: eyeColor,
        outfit_color: outfitColor,
        show_outer_suit: showOuterSuit,
        updated_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ ok: true, customization: localCustomization });
  } catch (error) {
    console.error("POST /api/avatar-customization failed:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to save customization" },
      { status: 500 }
    );
  }
}
