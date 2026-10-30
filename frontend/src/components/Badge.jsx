import React from 'react'

export function StatusBadge({ status }) {
  if (!status) return null
  return <span className={`badge st-${status}`}><span className="dot" style={{ background: 'currentColor' }} />{status}</span>
}

export function PriorityBadge({ priority }) {
  if (!priority) return null
  return <span className={`badge pri-${priority}`}>{priority}</span>
}

export function OverdueTag({ days }) {
  return <span className="badge overdue-tag">{days} day{days === 1 ? '' : 's'} overdue</span>
}

// Complexity badge for closed cases. NULL/undefined -> "Not assessed" (grey).
// Low -> grey/green, Medium -> amber/blue, High -> red — matches the project's
// existing professional colour system.
export function ComplexityBadge({ complexity }) {
  const value = complexity || 'Not assessed'
  const cls = complexity === 'Low' ? 'pri-Low'
            : complexity === 'Medium' ? 'pri-Medium'
            : complexity === 'High' ? 'pri-High'
            : 'pri-Low'
  return <span className={`badge ${cls}`}>{value}</span>
}

