"use client";
import React from "react";
export function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  return <span className={`badge st-${status}`}><span className="dot" style={{ background: "currentColor" }} />{status}</span>;
}
export function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority) return null;
  return <span className={`badge pri-${priority}`}>{priority}</span>;
}
export function OverdueTag({ days }: { days: number }) {
  return <span className="badge overdue-tag">{days} day{days === 1 ? "" : "s"} overdue</span>;
}
