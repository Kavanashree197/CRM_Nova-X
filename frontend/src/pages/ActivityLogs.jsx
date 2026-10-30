import React, { useEffect, useState, useRef, useCallback } from 'react'
import { apiGet } from '../api'
import { Loading, EmptyState } from '../components/Feedback'
import { IconActivity, IconRefresh } from '../components/icons'

const POLL_MS = 5000   // lightweight polling — no WebSockets, per the brief
const ACTION_TYPES = ['case_created', 'case_assigned', 'case_reassigned', 'status_changed', 'priority_updated', 'comment_added', 'next_action_scheduled', 'resolution_submitted', 'case_reopened', 'case_updated']

export default function ActivityLogs() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastId, setLastId] = useState(0)
  const [live, setLive] = useState(true)
  const [filters, setFilters] = useState({ action_type: '', user_id: '' })
  const [users, setUsers] = useState([])
  const pollRef = useRef(null)

  // Initial load
  const load = useCallback(async () => {
    setLoading(true)
    const p = { limit: 100 }
    if (filters.action_type) p.action_type = filters.action_type
    if (filters.user_id) p.user_id = filters.user_id
    const d = await apiGet('/api/activities', p)
    setItems(d.activities)
    setLastId(d.activities.length ? d.activities[0].action_id : 0)
    setLoading(false)
  }, [filters])

  useEffect(() => { load() }, [load])
  useEffect(() => { apiGet('/api/auth/users').then(d => setUsers(d.users || [])) }, [])

  // Polling for new actions since last seen id
  useEffect(() => {
    if (!live) { clearInterval(pollRef.current); return }
    pollRef.current = setInterval(async () => {
      try {
        const d = await apiGet(`/api/activities/since/${lastId}`)
        if (d.activities.length > 0) {
          setItems(prev => [...d.activities, ...prev].slice(0, 200))
          setLastId(d.latest_id)
        }
      } catch { /* ignore transient poll errors */ }
    }, POLL_MS)
    return () => clearInterval(pollRef.current)
  }, [live, lastId])

  const setF = (k, v) => setFilters(s => ({ ...s, [k]: v }))

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Activity Logs</div>
          <div className="page-sub">Every meaningful action across the system, written to the database the moment it happens. Records are immutable.</div>
        </div>
        <div className="flex items-center gap-12">
          <span className="text-sm muted"><span className="live-pulse" style={{ marginRight: 6 }} /> Auto-refresh every {POLL_MS/1000}s</span>
          <button className={`chip ${live ? 'active' : ''}`} onClick={() => setLive(v => !v)}>{live ? 'Live' : 'Paused'}</button>
          <button className="btn btn-sm" onClick={load}><IconRefresh size={14} /> Reload</button>
        </div>
      </div>

      <div className="card card-pad">
        <div className="filters">
          <div className="field">
            <label className="lbl">Action type</label>
            <select className="inp" value={filters.action_type} onChange={e => setF('action_type', e.target.value)}>
              <option value="">All actions</option>
              {ACTION_TYPES.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="lbl">User</label>
            <select className="inp" value={filters.user_id} onChange={e => setF('user_id', e.target.value)}>
              <option value="">Everyone</option>
              {users.map(u => <option key={u.user_id} value={u.user_id}>{u.name} ({u.role})</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card mt-16">
        <div className="card-head"><div className="card-title">{items.length} activities</div></div>
        <div className="card-pad">
          {loading ? <Loading label="Loading activity log…" />
            : items.length === 0 ? <EmptyState title="No activities match these filters" />
            : <div className="feed">
                {items.map(a => (
                  <div className="feed-item" key={a.action_id}>
                    <div className="feed-dot"><IconActivity size={15} /></div>
                    <div className="feed-body">
                      <div className="feed-top">
                        <span className="feed-type">{a.action_type.replace(/_/g, ' ')}</span>
                        {a.case_code && <span className="feed-case">{a.case_code}</span>}
                        <span className="muted text-xs">· {a.user_name}</span>
                      </div>
                      <div className="feed-desc">{a.description}</div>
                      {(a.previous_value || a.new_value) && (
                        <div className="feed-prev">
                          {a.previous_value ? <span className="muted">{a.previous_value}</span> : <span className="muted">—</span>}
                          <span className="muted"> → </span>
                          <b>{a.new_value || '—'}</b>
                        </div>
                      )}
                      <div className="feed-meta">{a.created_at.replace('T', ' ').slice(0, 16)}</div>
                    </div>
                  </div>
                ))}
              </div>}
        </div>
      </div>
    </div>
  )
}
