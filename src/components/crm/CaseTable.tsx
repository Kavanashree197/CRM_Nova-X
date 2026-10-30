"use client";
import React from "react";
import { StatusBadge, PriorityBadge } from "./Badge";

const today = () => new Date().toISOString().slice(0, 10);

export default function CaseTable({ cases, loading, emptyTitle, onRowClick, compact }: any) {
  if (loading) return <div className="loading"><span className="spinner" /> Loading cases…</div>;
  if (!cases || cases.length === 0) {
    return <div className="empty"><div style={{ fontWeight: 600, color: "var(--text-2)" }}>{emptyTitle || "No cases found"}</div><div className="text-sm" style={{ marginTop: 4 }}>Try adjusting your filters.</div></div>;
  }
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Case</th><th>Title</th>
            {!compact && <th>Category</th>}
            <th>Priority</th><th>Status</th><th>Assignee</th>
            {!compact && <th>Due</th>}
            {!compact && <th>Next Action</th>}
          </tr>
        </thead>
        <tbody>
          {cases.map((c: any) => {
            const overdue = c.is_overdue || (c.due_date && c.status !== "Completed" && c.due_date < today());
            return (
              <tr key={c.case_id} className={`clickable ${overdue ? "row-overdue" : ""}`} onClick={() => onRowClick ? onRowClick(c) : null}>
                <td className="code">{c.case_code}</td>
                <td className="title-cell">
                  <div>{c.title}</div>
                  {overdue && <div className="text-xs overdue-text" style={{ marginTop: 3 }}>Overdue</div>}
                </td>
                {!compact && <td className="muted">{c.category}</td>}
                <td><PriorityBadge priority={c.priority} /></td>
                <td><StatusBadge status={c.status} /></td>
                <td className="muted">{c.assigned_to_name || "Unassigned"}</td>
                {!compact && <td className={overdue ? "overdue-text mono" : "mono"}>{c.due_date || "—"}</td>}
                {!compact && <td className="muted mono">{c.next_action_date || "—"}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
