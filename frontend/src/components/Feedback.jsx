import React from 'react'

export function Loading({ label = 'Loading…' }) {
  return <div className="loading"><span className="spinner" /> <span>{label}</span></div>
}

export function EmptyState({ icon, title, sub, action }) {
  return (
    <div className="empty">
      {icon && <div className="ic">{icon}</div>}
      <div style={{ fontWeight: 600, color: 'var(--text-2)' }}>{title}</div>
      {sub && <div className="text-sm" style={{ marginTop: 4 }}>{sub}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  )
}

export function Toast({ toast }) {
  if (!toast) return null
  return (
    <div className={`toast ${toast.kind || ''}`}>
      <span>{toast.message}</span>
    </div>
  )
}
