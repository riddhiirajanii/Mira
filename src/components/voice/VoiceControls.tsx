
"use client";

import { useGeminiLive } from "@/hooks/useGeminiLive";

export default function VoiceControls() {
  const { start, stop, status, transcript, error } = useGeminiLive();
  const connected = status.startsWith("Connected");

  return (
    <section style={{ marginTop: 24, textAlign: "center" }}>
      <p>{status}</p>

      <button
        onClick={connected ? stop : start}
        style={{
          padding: "12px 24px",
          borderRadius: 999,
          border: "none",
          cursor: "pointer",
          background: connected ? "#d94f70" : "#8b5cf6",
          color: "white",
          fontSize: 16,
        }}
      >
        {connected ? "End conversation" : "🎙️ Start talking to Mira"}
      </button>

      {error && (
        <p style={{ color: "crimson", marginTop: 12 }}>{error}</p>
      )}

      {transcript && (
        <div style={{ margin: "20px auto", maxWidth: 600 }}>
          <strong>Mira says</strong>
          <p>{transcript}</p>
        </div>
      )}
    </section>
  );
}
