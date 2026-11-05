"use client";

import React, { useEffect, useState } from "react";
import { Memory, MemoryCategory } from "../../types/memory";

interface MemoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MemoryPanel({ isOpen, onClose }: MemoryPanelProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFact, setNewFact] = useState("");
  const [newCategory, setNewCategory] = useState<MemoryCategory>("personal");
  const [newImportance, setNewImportance] = useState(3);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchMemories = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/memories");
      const data = await res.json();
      if (data.ok && Array.isArray(data.memories)) {
        setMemories(data.memories);
      }
    } catch (err) {
      console.error("Failed to load memories:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMemories();
    }
  }, [isOpen]);

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFact.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fact: newFact.trim(),
          category: newCategory,
          importance: newImportance,
        }),
      });

      const data = await res.json();
      if (data.ok && data.memory) {
        setMemories((prev) => [data.memory, ...prev]);
        setNewFact("");
      }
    } catch (err) {
      console.error("Failed to add memory:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      setMemories((prev) => prev.filter((m) => m.id !== id));
      await fetch(`/api/memories?id=${id}`, { method: "DELETE" });
    } catch (err) {
      console.error("Failed to delete memory:", err);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        backgroundColor: "rgba(10, 12, 28, 0.7)",
        backdropFilter: "blur(6px)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          height: "100%",
          backgroundColor: "#16192b",
          borderLeft: "1px solid rgba(255, 255, 255, 0.12)",
          padding: "24px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
          color: "#ffffff",
          fontFamily: "Inter, system-ui, sans-serif",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "600" }}>🧠 Mira's Memory</h2>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#9ca3af" }}>
              Things Mira remembers across your conversations (stored in Supabase)
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
              padding: "4px 8px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Add Memory Form */}
        <form
          onSubmit={handleAddMemory}
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "12px",
            padding: "14px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: "600", color: "#c4b5fd" }}>
            Add New Memory / Fact
          </div>
          <input
            type="text"
            value={newFact}
            onChange={(e) => setNewFact(e.target.value)}
            placeholder="e.g. My favorite programming language is TypeScript"
            style={{
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              backgroundColor: "rgba(0, 0, 0, 0.3)",
              color: "#ffffff",
              fontSize: "13px",
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: "8px" }}>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: "6px",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                backgroundColor: "#1f2438",
                color: "#e2e8f0",
                fontSize: "12px",
              }}
            >
              <option value="personal">Personal Fact</option>
              <option value="preference">Preference</option>
              <option value="work">Work & Tasks</option>
              <option value="topic">Topic of Interest</option>
              <option value="general">General</option>
            </select>

            <button
              type="submit"
              disabled={!newFact.trim() || isSubmitting}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: "#8b5cf6",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {isSubmitting ? "Saving..." : "Remember"}
            </button>
          </div>
        </form>

        {/* Memory List */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#d1d5db" }}>
            Active Knowledge ({memories.length})
          </div>

          {loading ? (
            <div style={{ color: "#9ca3af", fontSize: "13px" }}>Loading memories...</div>
          ) : memories.length === 0 ? (
            <div style={{ color: "#6b7280", fontSize: "13px" }}>
              No memories recorded yet. Start talking to Mira or add one above!
            </div>
          ) : (
            memories.map((m) => (
              <div
                key={m.id}
                style={{
                  padding: "12px 14px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "10px",
                }}
              >
                <div>
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      backgroundColor: "rgba(139, 92, 246, 0.2)",
                      color: "#c4b5fd",
                      marginBottom: "6px",
                      fontWeight: 600,
                    }}
                  >
                    {m.category}
                  </span>
                  <p style={{ margin: 0, fontSize: "13px", color: "#e5e7eb", lineHeight: 1.4 }}>
                    {m.fact}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteMemory(m.id)}
                  title="Forget memory"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#ef4444",
                    cursor: "pointer",
                    fontSize: "14px",
                    padding: "4px",
                  }}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
