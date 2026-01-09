"use client";

import { useEffect, useState } from "react";
import { monitoring } from "../lib/monitoring";

export function MonitoringDashboard() {
  const [isOpen, setIsOpen] = useState(false);
  const [stats, setStats] = useState<ReturnType<typeof monitoring.getStats>>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      setStats(monitoring.getStats());
    }, 1000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const handleExport = () => {
    const data = monitoring.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `monitoring-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getHealthStatus = () => {
    if (!stats) return { color: "#666", label: "No Data", emoji: "⚪" };

    const { errorRate, slowRate, averageResponseTime } = stats;
    const errorPct = parseFloat(errorRate);
    const slowPct = parseFloat(slowRate);

    if (errorPct > 10 || averageResponseTime > 3000) {
      return { color: "#ef4444", label: "Poor", emoji: "🔴" };
    }
    if (errorPct > 5 || slowPct > 20 || averageResponseTime > 1500) {
      return { color: "#f59e0b", label: "Warning", emoji: "🟡" };
    }
    return { color: "#4ade80", label: "Healthy", emoji: "🟢" };
  };

  const health = getHealthStatus();

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          width: "60px",
          height: "60px",
          borderRadius: "50%",
          backgroundColor: "#1f1f1f",
          border: `2px solid ${health.color}`,
          color: "#e5e5e5",
          fontSize: "24px",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        title="Open Performance Monitor"
      >
        {health.emoji}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        width: "400px",
        maxHeight: "600px",
        backgroundColor: "#0a0a0a",
        border: "1px solid #333",
        borderRadius: "12px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid #333",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "#1a1a1a",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "20px" }}>{health.emoji}</span>
          <div>
            <div style={{ color: "#e5e5e5", fontWeight: 600, fontSize: "14px" }}>
              Performance Monitor
            </div>
            <div style={{ color: health.color, fontSize: "12px" }}>{health.label}</div>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            backgroundColor: "transparent",
            border: "none",
            color: "#999",
            fontSize: "20px",
            cursor: "pointer",
            padding: "4px 8px",
          }}
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div
        style={{
          padding: "16px",
          overflowY: "auto",
          flex: 1,
        }}
      >
        {!stats ? (
          <div style={{ color: "#999", textAlign: "center", padding: "20px" }}>
            No performance data yet. Data will appear as you use the app.
          </div>
        ) : (
          <>
            {/* Key Metrics */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  backgroundColor: "#1a1a1a",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #333",
                }}
              >
                <div style={{ color: "#999", fontSize: "11px", marginBottom: "4px" }}>
                  AVG RESPONSE
                </div>
                <div style={{ color: "#e5e5e5", fontSize: "20px", fontWeight: 600 }}>
                  {stats.averageResponseTime}ms
                </div>
              </div>

              <div
                style={{
                  backgroundColor: "#1a1a1a",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #333",
                }}
              >
                <div style={{ color: "#999", fontSize: "11px", marginBottom: "4px" }}>
                  ERROR RATE
                </div>
                <div
                  style={{
                    color: parseFloat(stats.errorRate) > 5 ? "#ef4444" : "#4ade80",
                    fontSize: "20px",
                    fontWeight: 600,
                  }}
                >
                  {stats.errorRate}%
                </div>
              </div>

              <div
                style={{
                  backgroundColor: "#1a1a1a",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #333",
                }}
              >
                <div style={{ color: "#999", fontSize: "11px", marginBottom: "4px" }}>
                  TOTAL CALLS
                </div>
                <div style={{ color: "#e5e5e5", fontSize: "20px", fontWeight: 600 }}>
                  {stats.totalCalls}
                </div>
              </div>

              <div
                style={{
                  backgroundColor: "#1a1a1a",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #333",
                }}
              >
                <div style={{ color: "#999", fontSize: "11px", marginBottom: "4px" }}>
                  SLOW CALLS
                </div>
                <div
                  style={{
                    color: parseFloat(stats.slowRate) > 20 ? "#f59e0b" : "#4ade80",
                    fontSize: "20px",
                    fontWeight: 600,
                  }}
                >
                  {stats.slowCount}
                </div>
              </div>
            </div>

            {/* Response Time Range */}
            <div
              style={{
                backgroundColor: "#1a1a1a",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #333",
                marginBottom: "16px",
              }}
            >
              <div style={{ color: "#999", fontSize: "11px", marginBottom: "8px" }}>
                RESPONSE TIME RANGE
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  color: "#e5e5e5",
                  fontSize: "12px",
                }}
              >
                <span>
                  Min: <strong>{stats.minResponseTime}ms</strong>
                </span>
                <span>
                  Max: <strong>{stats.maxResponseTime}ms</strong>
                </span>
              </div>
            </div>

            {/* Recent Errors */}
            {stats.recentErrors.length > 0 && (
              <div
                style={{
                  backgroundColor: "#1a1a1a",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #333",
                  marginBottom: "16px",
                }}
              >
                <div style={{ color: "#ef4444", fontSize: "12px", fontWeight: 600, marginBottom: "8px" }}>
                  RECENT ERRORS ({stats.recentErrors.length})
                </div>
                <div style={{ maxHeight: "150px", overflowY: "auto" }}>
                  {stats.recentErrors.map((error, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: "11px",
                        color: "#999",
                        padding: "4px 0",
                        borderBottom: i < stats.recentErrors.length - 1 ? "1px solid #2a2a2a" : "none",
                      }}
                    >
                      <div style={{ color: "#ef4444", marginBottom: "2px" }}>{error.message}</div>
                      {error.context && (
                        <div style={{ fontSize: "10px" }}>Context: {error.context}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Calls */}
            <div
              style={{
                backgroundColor: "#1a1a1a",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #333",
              }}
            >
              <div style={{ color: "#999", fontSize: "12px", fontWeight: 600, marginBottom: "8px" }}>
                RECENT API CALLS
              </div>
              <div style={{ maxHeight: "150px", overflowY: "auto" }}>
                {stats.recentMetrics.map((metric, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: "11px",
                      color: metric.status >= 400 ? "#ef4444" : "#4ade80",
                      padding: "4px 0",
                      borderBottom: i < stats.recentMetrics.length - 1 ? "1px solid #2a2a2a" : "none",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#e5e5e5" }}>
                        {metric.endpoint.split("/").pop()?.slice(0, 20) || "API Call"}
                      </span>
                      <span>{metric.duration}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer Actions */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid #333",
          display: "flex",
          gap: "8px",
          backgroundColor: "#1a1a1a",
        }}
      >
        <button
          onClick={handleExport}
          style={{
            flex: 1,
            padding: "8px 12px",
            backgroundColor: "#2a2a2a",
            color: "#e5e5e5",
            border: "1px solid #444",
            borderRadius: "6px",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          Export Data
        </button>
        <button
          onClick={() => {
            monitoring.clear();
            setStats(null);
          }}
          style={{
            flex: 1,
            padding: "8px 12px",
            backgroundColor: "#2a2a2a",
            color: "#ef4444",
            border: "1px solid #444",
            borderRadius: "6px",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          Clear Data
        </button>
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          style={{
            padding: "8px 12px",
            backgroundColor: autoRefresh ? "#4ade80" : "#2a2a2a",
            color: autoRefresh ? "#000" : "#e5e5e5",
            border: "1px solid #444",
            borderRadius: "6px",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          {autoRefresh ? "⏸" : "▶"}
        </button>
      </div>
    </div>
  );
}
