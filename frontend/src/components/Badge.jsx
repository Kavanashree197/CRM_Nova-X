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
