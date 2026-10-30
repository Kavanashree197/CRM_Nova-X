import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet } from '../api'
import { Loading, EmptyState } from '../components/Feedback'
import { IconShield, IconRefresh } from '../components/icons'

const ENTITY_LABELS = {
  case: 'Case', assignment: 'Assignment', action: 'Action', status: 'Status',
}
const ACTION_LABELS = {
  case_created: 'Case Created', case_assigned: 'Assigned', case_reassigned: 'Reassigned',
  status_changed: 'Status Changed', priority_changed: 'Priority Changed',
  due_date_changed: 'Due Date Changed', next_action_date_changed: 'Next Action Date Changed',
  case_updated: 'Case Updated', action_added: 'Action Added',
  completion: 'Completed', case_reopened: 'Case Reopened',
}

export default function AuditHistory() {
  const nav = useNavigate()
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState({ total: 0, by_action: {} })
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ entity_type: '', action: '' })

  const load = useCallback(() => {
    setLoading(true)
    const p = { limit: 200 }
    if (filters.entity_type) p.entity_type = filters.entity_type
    if (filters.action) p.action = filters.action
    Promise.all([
      apiGet('/api/audit', p),
      apiGet('/api/audit/summary'),
    ]).then(([d, s]) => { setRows(d.audit || []); setSummary(s); })
      .finally(() => setLoading(false))
  }, [filters])
  useEffect(() => { load() }, [load])

  const setF = (k, v) => setFilters(s => ({ ...s, [k]: v }))
  const actionOpts = Object.keys(summary.by_action || {})

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Audit History</div>
          <div className="page-sub">System-level audit trail — every meaningful entity change, preserved permanently. Read-only.</div>
        </div>
        <button className="btn" onClick={load}><IconRefresh size={16} /> Refresh</button>
      </div>

      <div className="card card-pad">
        <div className="filters">
          <div className="field">
            <label className="lbl">Entity type</label>
            <select className="inp" value={filters.entity_type} onChange={e => setF('entity_type', e.target.value)}>
              <option value="">All entities</option>
              <option value="case">Case</option>
              <option value="assignment">Assignment</option>
              <option value="action">Action</option>
            </select>
          </div>
          <div className="field">
            <label className="lbl">Action</label>
            <select className="inp" value={filters.action} onChange={e => setF('action', e.target.value)}>
              <option value="">All actions</option>
              {actionOpts.map(a => <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>)}
            </select>
          </div>
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <div className="text-sm muted">Total: <b className="mono" style={{ color: 'var(--text)' }}>{summary.total}</b> entries</div>
          </div>
        </div>
      </div>

      <div className="card mt-16">
        <div className="card-head"><div className="card-title">{rows.length} audit entries</div></div>
        {loading ? <Loading label="Loading audit trail…" />
          : rows.length === 0 ? <EmptyState icon={<IconShield size={28} />} title="No audit entries yet" sub="Audit entries appear automatically when cases are created, assigned, reassigned, status-changed, completed or reopened." />
          : <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Details</th><th>By</th></tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.audit_id}>
                      <td className="mono muted">{r.created_at.replace('T', ' ').slice(0, 16)}</td>
                      <td><span className="badge st-Active">{ACTION_LABELS[r.action] || r.action}</span></td>
                      <td className="muted">{ENTITY_LABELS[r.entity_type] || r.entity_type} #{r.entity_id}</td>
                      <td>{r.details}</td>
                      <td className="muted">{r.user_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
      </div>
    </div>
  )
}
