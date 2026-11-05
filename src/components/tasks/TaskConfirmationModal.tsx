"use client";

import React from "react";

export interface PendingTaskApproval {
  id: string;
  toolName: string;
  args: Record<string, any>;
  riskWarning?: string;
}

interface TaskConfirmationModalProps {
  pendingTask: PendingTaskApproval | null;
  onApprove: (task: PendingTaskApproval) => void;
  onReject: (task: PendingTaskApproval) => void;
}

export default function TaskConfirmationModal({
  pendingTask,
  onApprove,
  onReject,
}: TaskConfirmationModalProps) {
  if (!pendingTask) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        backgroundColor: "rgba(5, 7, 18, 0.82)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          background: "linear-gradient(145deg, #1f1b2e, #141221)",
          border: "1px solid rgba(239, 68, 68, 0.4)",
          borderRadius: "16px",
          padding: "24px",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6), 0 0 25px rgba(239, 68, 68, 0.2)",
          color: "#f3f4f6",
          fontFamily: "Inter, system-ui, sans-serif",
          animation: "scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              color: "#ef4444",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
            }}
          >
            ⚠️
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "600", color: "#ffffff" }}>
              Irreversible Action Approval
            </h3>
            <span style={{ fontSize: "12px", color: "#f87171" }}>
              Mira is requesting permission to execute a destructive task
            </span>
          </div>
        </div>

        <div
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.35)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "10px",
            padding: "14px",
            marginBottom: "16px",
          }}
        >
          <div style={{ fontSize: "13px", color: "#9ca3af", marginBottom: "6px" }}>
            Action: <strong style={{ color: "#f3f4f6" }}>{pendingTask.toolName}</strong>
          </div>

          <div style={{ fontSize: "12px", color: "#d1d5db", wordBreak: "break-all" }}>
            <span style={{ color: "#9ca3af" }}>Parameters: </span>
            <pre
              style={{
                margin: "8px 0 0",
                padding: "8px",
                backgroundColor: "rgba(0, 0, 0, 0.4)",
                borderRadius: "6px",
                fontFamily: "monospace",
                fontSize: "11px",
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                color: "#fde047",
              }}
            >
              {JSON.stringify(pendingTask.args, null, 2)}
            </pre>
          </div>
        </div>

        {pendingTask.riskWarning && (
          <p
            style={{
              margin: "0 0 20px",
              fontSize: "13px",
              color: "#fca5a5",
              lineHeight: 1.4,
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              padding: "10px 12px",
              borderRadius: "8px",
              borderLeft: "3px solid #ef4444",
            }}
          >
            {pendingTask.riskWarning}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button
            onClick={() => onReject(pendingTask)}
            style={{
              padding: "10px 18px",
              borderRadius: "8px",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              color: "#e5e7eb",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
          >
            Reject & Cancel
          </button>

          <button
            onClick={() => onApprove(pendingTask)}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "#dc2626",
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(220, 38, 38, 0.35)",
              transition: "background 0.15s",
            }}
          >
            Approve & Execute
          </button>
        </div>
      </div>
    </div>
  );
}
