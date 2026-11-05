"use client";

import React, { useState } from "react";
import { AvatarCustomization } from "../../types/avatar";

interface CustomizationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  customization: AvatarCustomization;
  onChange: (updated: AvatarCustomization) => void;
  onSave: () => void;
  saving?: boolean;
}

const SKIN_TONES = [
  { label: "Fair Porcelain", value: "#ffd8c4" },
  { label: "Warm Natural", value: "#f5c3a6" },
  { label: "Sun-Kissed Olive", value: "#dca682" },
  { label: "Deep Tan", value: "#9c6d48" },
  { label: "Rich Espresso", value: "#5c3d28" },
];

const EYE_COLORS = [
  { label: "Azure Blue", value: "#3b82f6" },
  { label: "Emerald Green", value: "#10b981" },
  { label: "Amethyst Violet", value: "#8b5cf6" },
  { label: "Warm Amber", value: "#d97706" },
  { label: "Deep Charcoal", value: "#374151" },
];

const OUTFIT_COLORS = [
  { label: "Cyber Slate", value: "#1e293b" },
  { label: "Royal Indigo", value: "#3730a3" },
  { label: "Cyber Crimson", value: "#991b1b" },
  { label: "Emerald Guard", value: "#065f46" },
  { label: "Deep Violet", value: "#581c87" },
  { label: "Dark Titanium", value: "#0f172a" },
];

export default function CustomizationDrawer({
  isOpen,
  onClose,
  customization,
  onChange,
  onSave,
  saving = false,
}: CustomizationDrawerProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        backgroundColor: "rgba(10, 12, 28, 0.65)",
        backdropFilter: "blur(6px)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "440px",
          height: "100%",
          backgroundColor: "#151829",
          borderLeft: "1px solid rgba(255, 255, 255, 0.12)",
          padding: "24px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: "22px",
          color: "#ffffff",
          fontFamily: "Inter, system-ui, sans-serif",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "600" }}>👗 Customize Mira</h2>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#9ca3af" }}>
              Dress up Mira and customize her appearance to your preference
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#9ca3af",
              fontSize: "20px",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* 1. Outfits & Wardrobe Section */}
        <section
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "14px",
            padding: "16px",
          }}
        >
          <div style={{ fontSize: "13px", fontWeight: "600", color: "#c4b5fd", marginBottom: "12px" }}>
            Wardrobe & Dressing
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "12px", color: "#d1d5db", display: "block", marginBottom: "8px" }}>
              Outer Suit Layer
            </label>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={() => onChange({ ...customization, showOuterSuit: true })}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  border: customization.showOuterSuit
                    ? "2px solid #8b5cf6"
                    : "1px solid rgba(255, 255, 255, 0.1)",
                  backgroundColor: customization.showOuterSuit
                    ? "rgba(139, 92, 246, 0.25)"
                    : "rgba(0, 0, 0, 0.25)",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                🚀 Sci-Fi Suit
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...customization, showOuterSuit: false })}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  border: !customization.showOuterSuit
                    ? "2px solid #8b5cf6"
                    : "1px solid rgba(255, 255, 255, 0.1)",
                  backgroundColor: !customization.showOuterSuit
                    ? "rgba(139, 92, 246, 0.25)"
                    : "rgba(0, 0, 0, 0.25)",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                🏃 Minimal / Casual
              </button>
            </div>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "#d1d5db", display: "block", marginBottom: "8px" }}>
              Outfit Fabric Color
            </label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {OUTFIT_COLORS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => onChange({ ...customization, outfitColor: item.value })}
                  title={item.label}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    backgroundColor: item.value,
                    border:
                      customization.outfitColor === item.value
                        ? "3px solid #ffffff"
                        : "2px solid rgba(255, 255, 255, 0.2)",
                    cursor: "pointer",
                    boxShadow:
                      customization.outfitColor === item.value
                        ? "0 0 10px rgba(255, 255, 255, 0.5)"
                        : "none",
                  }}
                />
              ))}
            </div>
          </div>
        </section>

        {/* 2. Skin Tone Section */}
        <section
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "14px",
            padding: "16px",
          }}
        >
          <div style={{ fontSize: "13px", fontWeight: "600", color: "#c4b5fd", marginBottom: "12px" }}>
            Skin Tone & Complexion
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {SKIN_TONES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => onChange({ ...customization, skinTone: item.value })}
                title={item.label}
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  backgroundColor: item.value,
                  border:
                    customization.skinTone === item.value
                      ? "3px solid #8b5cf6"
                      : "2px solid rgba(255, 255, 255, 0.2)",
                  cursor: "pointer",
                  boxShadow:
                    customization.skinTone === item.value
                      ? "0 0 10px rgba(139, 92, 246, 0.6)"
                      : "none",
                }}
              />
            ))}
          </div>
        </section>

        {/* 3. Eye Iris Color Section */}
        <section
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "14px",
            padding: "16px",
          }}
        >
          <div style={{ fontSize: "13px", fontWeight: "600", color: "#c4b5fd", marginBottom: "12px" }}>
            Eye Iris Color
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {EYE_COLORS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => onChange({ ...customization, eyeColor: item.value })}
                title={item.label}
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  backgroundColor: item.value,
                  border:
                    customization.eyeColor === item.value
                      ? "3px solid #ffffff"
                      : "2px solid rgba(255, 255, 255, 0.2)",
                  cursor: "pointer",
                  boxShadow:
                    customization.eyeColor === item.value
                      ? "0 0 10px rgba(255, 255, 255, 0.5)"
                      : "none",
                }}
              />
            ))}
          </div>
        </section>

        {/* Save Changes Button */}
        <div style={{ marginTop: "auto", paddingTop: "12px" }}>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "10px",
              border: "none",
              backgroundColor: "#8b5cf6",
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 6px 16px rgba(139, 92, 246, 0.35)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {saving ? "Saving to Supabase..." : "✨ Save Look to Supabase"}
          </button>
        </div>
      </div>
    </div>
  );
}
