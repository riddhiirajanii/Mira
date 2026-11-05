"use client";

import { useEffect, useState } from "react";
import AvatarCanvas from "../components/avatar/AvatarCanvas";
import { useGeminiLive } from "../hooks/useGeminiLive";
import { MemoryPanel } from "../components/memory/MemoryPanel";
import CustomizationDrawer from "../components/avatar/CustomizationDrawer";
import TaskConfirmationModal from "../components/tasks/TaskConfirmationModal";
import { AvatarCustomization, DEFAULT_AVATAR_CUSTOMIZATION } from "../types/avatar";

export default function Home() {
  const {
    start,
    stop,
    status,
    transcript,
    error,
    volume,
    setVolume,
    speakingLevel,
    pendingTask,
    approveTask,
    rejectTask,
  } = useGeminiLive();

  const [captionsOn, setCaptionsOn] = useState(true);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [customizationOpen, setCustomizationOpen] = useState(false);
  const [customizationSaving, setCustomizationSaving] = useState(false);

  const [customization, setCustomization] = useState<AvatarCustomization>(
    DEFAULT_AVATAR_CUSTOMIZATION
  );

  const connected = status.startsWith("Connected");

  // Load avatar appearance from Supabase on start
  useEffect(() => {
    fetch("/api/avatar-customization")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.customization) {
          setCustomization(data.customization);
        }
      })
      .catch((err) => console.warn("Failed to load avatar customization:", err));
  }, []);

  // Save customization to Supabase
  const handleSaveCustomization = async () => {
    try {
      setCustomizationSaving(true);
      await fetch("/api/avatar-customization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customization),
      });
    } catch (err) {
      console.error("Failed to save customization:", err);
    } finally {
      setCustomizationSaving(false);
    }
  };

  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: "#101426",
        color: "#ffffff",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Full-screen 3D avatar with speech sync, expressions & appearance */}
      <AvatarCanvas
        speakingLevel={speakingLevel}
        customization={customization}
      />

      {/* Soft vignette for controls readability */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
          background:
            "linear-gradient(to bottom, rgba(10,12,28,0.12), transparent 35%, transparent 55%, rgba(10,12,28,0.76))",
        }}
      />

      {/* Top Header / Branding */}
      <header
        style={{
          position: "absolute",
          zIndex: 2,
          top: "max(24px, env(safe-area-inset-top))",
          left: 0,
          right: 0,
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "-0.5px",
            textShadow: "0 2px 10px rgba(0,0,0,0.5)",
          }}
        >
          Mira
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: "#e0dff0",
            textShadow: "0 1px 6px rgba(0,0,0,0.6)",
          }}
        >
          Your talking AI companion & desktop assistant
        </div>
      </header>

      {/* Top-Right Action Badges (Memory & Wardrobe) */}
      <div
        style={{
          position: "absolute",
          top: "max(20px, env(safe-area-inset-top))",
          right: "20px",
          zIndex: 3,
          display: "flex",
          gap: "10px",
        }}
      >
        <button
          type="button"
          onClick={() => setMemoryOpen(true)}
          title="Open Memories"
          style={{
            ...topPillButton,
            backgroundColor: "rgba(139, 92, 246, 0.25)",
            border: "1px solid rgba(139, 92, 246, 0.4)",
          }}
        >
          🧠 Memories
        </button>

        <button
          type="button"
          onClick={() => setCustomizationOpen(true)}
          title="Dress Up & Customize Mira"
          style={{
            ...topPillButton,
            backgroundColor: "rgba(236, 72, 153, 0.25)",
            border: "1px solid rgba(236, 72, 153, 0.4)",
          }}
        >
          👗 Customize
        </button>
      </div>

      {/* Conversation & Controls Area */}
      <section
        style={{
          position: "absolute",
          zIndex: 2,
          bottom: "max(28px, env(safe-area-inset-bottom))",
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          padding: "0 20px",
        }}
      >
        {captionsOn && transcript && (
          <div
            aria-live="polite"
            style={{
              width: "min(900px, 90vw)",
              maxHeight: "4.8em",
              overflow: "hidden",
              padding: "0",
              boxSizing: "border-box",
              textAlign: "center",
              fontSize: "clamp(18px, 2.2vw, 26px)",
              lineHeight: 1.5,
              color: "#fff",
              whiteSpace: "pre-wrap",
              overflowWrap: "break-word",
              textShadow: `
                0 2px 4px rgba(0, 0, 0, 0.95),
                1px 1px 2px rgba(0, 0, 0, 0.95),
                -1px -1px 2px rgba(0, 0, 0, 0.95)
              `,
            }}
          >
            {transcript}
          </div>
        )}

        <div
          style={{
            color: "#e5e2f5",
            fontSize: 13,
            letterSpacing: 0.2,
            textShadow: "0 1px 4px rgba(0,0,0,0.6)",
          }}
        >
          {status === "Disconnected"
            ? "Whenever you're ready ♡"
            : status === "Connecting..."
              ? "Connecting..."
              : status === "Error"
                ? "Something went wrong"
                : status}
        </div>

        {error && (
          <div
            role="alert"
            style={{
              color: "#fecaca",
              fontSize: 13,
              textAlign: "center",
              maxWidth: 500,
              backgroundColor: "rgba(220, 38, 38, 0.3)",
              padding: "6px 14px",
              borderRadius: "8px",
            }}
          >
            {error}
          </div>
        )}

        {/* Audio and session buttons */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 18,
          }}
        >
          {/* CC Toggle */}
          <button
            type="button"
            aria-label={captionsOn ? "Hide captions" : "Show captions"}
            title={captionsOn ? "Hide captions" : "Show captions"}
            onClick={() => setCaptionsOn((val) => !val)}
            style={{
              ...secondaryButton,
              backgroundColor: captionsOn
                ? "rgba(139, 92, 246, 0.5)"
                : "rgba(27, 29, 52, 0.78)",
            }}
          >
            CC
          </button>

          {/* Main Talk Button */}
          <button
            type="button"
            aria-label={connected ? "End conversation" : "Talk to Mira"}
            onClick={connected ? stop : start}
            disabled={status === "Connecting..."}
            style={{
              width: 66,
              height: 66,
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.4)",
              background: connected
                ? "linear-gradient(145deg, #f0a6c8, #c4b5fd)"
                : "linear-gradient(145deg, #c4b5fd, #a5b4fc)",
              color: "#211a38",
              fontSize: 26,
              cursor: "pointer",
              boxShadow: "0 0 36px rgba(196,181,253,0.3)",
              transition: "transform 0.15s ease",
            }}
          >
            {connected ? "■" : "🎙"}
          </button>

          {/* Volume Control */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              aria-label="Adjust Mira's volume"
              aria-expanded={volumeOpen}
              onClick={() => setVolumeOpen((open) => !open)}
              style={secondaryButton}
            >
              {volume === 0 ? "🔇" : "🔊"}
            </button>

            {volumeOpen && (
              <div
                style={{
                  position: "absolute",
                  bottom: 58,
                  right: 0,
                  width: 220,
                  padding: 16,
                  borderRadius: 16,
                  background: "rgba(22, 24, 44, 0.96)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  backdropFilter: "blur(18px)",
                  boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 12,
                    fontSize: 13,
                    color: "#fff",
                  }}
                >
                  <label htmlFor="mira-volume">Mira's volume</label>
                  <span>{volume}%</span>
                </div>

                <input
                  id="mira-volume"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                  style={{ width: "100%", accentColor: "#c4b5fd" }}
                />

                <button
                  type="button"
                  onClick={() => setVolume(volume === 0 ? 80 : 0)}
                  style={{
                    ...secondaryButton,
                    width: "auto",
                    height: "auto",
                    padding: "8px 12px",
                    borderRadius: 10,
                    marginTop: 12,
                    fontSize: 12,
                  }}
                >
                  {volume === 0 ? "Unmute" : "Mute"}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Human-In-The-Loop Irreversible Task Confirmation Modal */}
      <TaskConfirmationModal
        pendingTask={pendingTask}
        onApprove={approveTask}
        onReject={rejectTask}
      />

      {/* Supabase Memories Slide-Over Panel */}
      <MemoryPanel
        isOpen={memoryOpen}
        onClose={() => setMemoryOpen(false)}
      />

      {/* 3D Avatar Dressing & Appearance Customization Drawer */}
      <CustomizationDrawer
        isOpen={customizationOpen}
        onClose={() => setCustomizationOpen(false)}
        customization={customization}
        onChange={setCustomization}
        onSave={handleSaveCustomization}
        saving={customizationSaving}
      />
    </main>
  );
}

const secondaryButton: React.CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: "50%",
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(27, 29, 52, 0.78)",
  color: "#fff",
  fontSize: 17,
  cursor: "pointer",
  backdropFilter: "blur(12px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const topPillButton: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "20px",
  color: "#ffffff",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
  backdropFilter: "blur(10px)",
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
};
