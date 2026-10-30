import React from 'react'
import { StatusBadge, PriorityBadge, ComplexityBadge } from './Badge'
import { EmptyState } from './Feedback'

/**
 * Reusable table for closed cases. Used on:
 *   - My Cases (Resource) -> "My Closed Cases" (own closures)
 *   - Overview/Team Performance (Team Lead) -> "Team Closed Cases"
 *   - Overview (Admin) -> "Organization Closed Cases"
 *
 * Props:
 *   rows: array of {case_id, case_code, title, category, priority, complexity,
 *                   created_at, closed_at, status, assigned_to_name, closed_by_name}
 *   showAssignee: bool — show the "Assigned to" column (Team Lead / Admin views)
 *   loading: bool
 *   emptyTitle: string
 *   onRowClick: (case_id) => void  (optional — open the case drawer)
 */
export default function ClosedCasesTable({ rows, showAssignee = false, loading, emptyTitle, onRowClick }) {
  if (loading) return <div className="loading"><span className="spinner" /> Loading closed cases…</div>
  if (!rows || rows.length === 0) {
    return <EmptyState title={emptyTitle || 'No closed cases yet'}
                       sub="Closed cases appear here once a case is marked Completed with a resolution note." />
  }
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Case</th>
            <th>Title</th>
            <th>Category</th>
            <th>Priority</th>
            <th>Complexity</th>
            <th>Created</th>
            {showAssignee && <th>Assigned to</th>}
            <th>Closed by</th>
            <th>Closed date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(c => (
            <tr key={c.case_id} className="clickable"
                onClick={() => onRowClick ? onRowClick(c.case_id) : null}>
              <td className="code">{c.case_code}</td>
              <td className="title-cell">{c.title}</td>
              <td className="muted">{c.category}</td>
              <td><PriorityBadge priority={c.priority} /></td>
              <td><ComplexityBadge complexity={c.complexity} /></td>
              <td className="mono muted">{(c.created_at || '').slice(0, 10)}</td>
              {showAssignee && <td className="muted">{c.assigned_to_name}</td>}
              <td className="muted">{c.closed_by_name}</td>
              <td className="mono muted">{(c.closed_at || '').replace('T', ' ').slice(0, 16)}</td>
              <td><StatusBadge status={c.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
