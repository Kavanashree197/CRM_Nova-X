import React, { useEffect, useState } from 'react'
import { apiGet, apiPut, apiPost } from '../api'
import { useAuth } from '../auth'
import { useToast } from './Layout'
import { StatusBadge, PriorityBadge, ComplexityBadge } from './Badge'
import { Loading, EmptyState } from './Feedback'
import { IconClose, IconCheck, IconRefresh } from './icons'

const CATEGORIES = ['Billing', 'Technical Support', 'Account Access', 'Onboarding', 'Feature Request', 'Bug Report', 'Data Migration', 'Compliance']
const STATUSES = ['New', 'Active', 'Pending', 'Completed', 'Reopened']
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']

function fmt(ts) {
  if (!ts) return '—'
  return ts.replace('T', ' ').slice(0, 16)
}

export default function CaseDetailDrawer({ caseId, onClose, onChanged }) {
  const { user } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [categories, setCategories] = useState([])
  const canEdit = user && (user.role === 'Admin' || user.role === 'Team Lead' || (data && data.case && data.case.assigned_to === user.user_id))

  // Load case + history + users + categories
  const load = () => {
    setLoading(true)
    Promise.all([
      apiGet(`/api/cases/${caseId}/history`),
      apiGet('/api/auth/users'),
      apiGet('/api/categories'),
    ]).then(([h, u, cat]) => {
      setData(h)
      setUsers(u.users || [])
      setCategories(cat.categories || [])
    }).catch(() => toast('Failed to load case', 'err'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [caseId]) // eslint-disable-line

  if (loading) return <DrawerShell onClose={onClose}><Loading label="Loading case…" /></DrawerShell>
  if (!data || !data.case) return <DrawerShell onClose={onClose}><EmptyState title="Case not found" /></DrawerShell>
  const c = data.case

  return (
    <DrawerShell onClose={onClose}>
      <div className="drawer-head">
        <div>
          <div className="flex items-center gap-8">
            <span className="code mono" style={{ fontWeight: 700, color: 'var(--accent)' }}>{c.case_code}</span>
            <StatusBadge status={c.status} />
            <PriorityBadge priority={c.priority} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 6 }}>{c.title}</div>
        </div>
        <button className="icon-btn" onClick={onClose}><IconClose size={18} /></button>
      </div>

      <div className="drawer-tabs">
        {['overview', 'history', 'edit', 'action'].map(t => (
          <div key={t} className={`drawer-tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}>
            {t === 'action' ? 'Record Action' : t[0].toUpperCase() + t.slice(1)}
          </div>
        ))}
      </div>

      <div className="drawer-body">
        {tab === 'overview' && <Overview c={c} assignments={data.assignments} />}
        {tab === 'history' && <History actions={data.actions} assignments={data.assignments} status_history={data.status_history} />}
        {tab === 'edit' && (canEdit
          ? <EditForm c={c} categories={categories} onSaved={(msg) => { toast(msg || 'Case updated'); load(); onChanged && onChanged() }} onError={m => toast(m, 'err')} />
          : <EmptyState title="You can't edit this case" sub="Only the assignee, Team Lead or Admin can edit." />)}
        {tab === 'action' && (canEdit
          ? <ActionForm c={c} users={users} onSaved={(msg) => { toast(msg || 'Action recorded'); load(); onChanged && onChanged() }} onError={m => toast(m, 'err')} />
          : <EmptyState title="You can't record actions" sub="Only the assignee, Team Lead or Admin can record actions." />)}
      </div>
    </DrawerShell>
  )
}

function DrawerShell({ onClose, children }) {
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">{children}</div>
    </>
  )
}

function Overview({ c, assignments }) {
  // The latest assignment row carries the method + reason (automatic engine).
  const latest = assignments && assignments.length ? assignments[assignments.length - 1] : null
  return (
    <div>
      <dl className="kv">
        <dt>Category</dt><dd>{c.category}</dd>
        <dt>Created by</dt><dd>{c.created_by_name}</dd>
        <dt>Assigned to</dt><dd>{c.assigned_to_name || 'Awaiting Assignment'}</dd>
        <dt>Assignment status</dt><dd>
          {c.assignment_status === 'Assigned'
            ? <span className="badge st-Active"><span className="dot" style={{ background: 'currentColor' }} />{c.assignment_status}</span>
            : <span className="badge pri-Medium">{c.assignment_status || 'Awaiting Assignment'}</span>}
        </dd>
        <dt>Assignment method</dt><dd>{latest?.assignment_method || 'Automatic'}</dd>
        <dt>Assignment reason</dt><dd style={{ maxWidth: 420 }}>{latest?.assignment_reason || '—'}</dd>
        <dt>Assignment date</dt><dd className="mono">{latest?.assigned_at ? fmt(latest.assigned_at) : '—'}</dd>
        <dt>Due date</dt><dd className={c.is_overdue ? 'overdue-text' : ''}>{c.due_date || '—'} {c.is_overdue && <span className="text-xs">(overdue)</span>}</dd>
        <dt>Next action</dt><dd>{c.next_action || '—'}</dd>
        <dt>Next action date</dt><dd className="mono">{c.next_action_date || '—'}</dd>
        <dt>Completion date</dt><dd className="mono">{c.completion_date || '—'}</dd>
        <dt>Closed by</dt><dd>{c.closed_by_name || '—'} {c.closed_by_user_id && c.assigned_to && c.closed_by_user_id !== c.assigned_to && <span className="text-xs muted">(differs from assignee)</span>}</dd>
        <dt>Closed at</dt><dd className="mono">{c.closed_at ? fmt(c.closed_at) : '—'}</dd>
        <dt>Complexity</dt><dd><ComplexityBadge complexity={c.complexity} /></dd>
        <dt>Created</dt><dd className="mono">{fmt(c.created_at)}</dd>
        <dt>Last updated</dt><dd className="mono">{fmt(c.updated_at)}</dd>
      </dl>
      <div className="section-title">Description</div>
      <div className="text-sm" style={{ color: 'var(--text-2)', lineHeight: 1.6 }}>{c.description || 'No description provided.'}</div>
      {c.resolution_note && (
        <>
          <div className="section-title">Resolution Note</div>
          <div className="text-sm" style={{ background: 'var(--st-done-bg)', padding: 12, borderRadius: 8, color: 'var(--st-done)', lineHeight: 1.6, border: '1px solid #A7F3D0' }}>
            {c.resolution_note}
          </div>
        </>
      )}
      <div className="section-title">Assignment History ({assignments.length})</div>
      {assignments.map(a => (
        <div key={a.assignment_id} className="text-sm" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
          <div><b>{a.assigned_to_name}</b> <span className="muted">assigned by {a.assigned_by_name}</span></div>
          <div className="text-xs muted">{fmt(a.assigned_at)} · {a.note}</div>
        </div>
      ))}
    </div>
  )
}

function History({ actions, assignments, status_history }) {
  const hasActions = actions && actions.length > 0
  const hasStatus = status_history && status_history.length > 0
  if (!hasActions && !hasStatus) return <EmptyState title="No actions recorded yet" sub="Actions and status changes appear here as they happen." />
  // Combine actions into a single chronological timeline (newest first)
  const items = hasActions ? actions.slice().reverse() : []
  return (
    <div>
      <div className="text-sm muted" style={{ marginBottom: 12 }}>
        Immutable activity log — {actions.length} action{actions.length === 1 ? '' : 's'}.
        Records cannot be edited or deleted.
      </div>
      <div className="timeline">
        {items.map((a, idx) => (
          <div key={a.action_id} className={`tl-item ${idx === 0 ? 'first' : ''}`}>
            <div className="tl-time">{fmt(a.created_at)} · {a.user_name}</div>
            <div className="tl-title">{prettyType(a.action_type)}</div>
            <div className="tl-desc">{a.description}</div>
            {(a.previous_value || a.new_value) && (
              <div className="tl-prev">
                {a.previous_value ? <span className="muted">{a.previous_value}</span> : <span className="muted">—</span>}
                <span className="muted"> → </span>
                <b>{a.new_value || '—'}</b>
              </div>
            )}
          </div>
        ))}
      </div>
      {hasStatus && (
        <>
          <div className="section-title" style={{ marginTop: 18 }}>Status transitions</div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>From</th><th>To</th><th>By</th><th>When</th><th>Note</th></tr></thead>
              <tbody>
                {status_history.map(h => (
                  <tr key={h.history_id}>
                    <td className="muted">{h.from_status || '—'}</td>
                    <td><span className={`badge st-${h.to_status}`}>{h.to_status}</span></td>
                    <td className="muted">{h.changed_by_name || '—'}</td>
                    <td className="mono muted">{fmt(h.changed_at)}</td>
                    <td className="muted text-sm">{h.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function prettyType(t) {
  return ({
    case_created: 'Case Created',
    case_assigned: 'Assigned',
    case_reassigned: 'Reassigned',
    status_changed: 'Status Changed',
    priority_updated: 'Priority Updated',
    case_updated: 'Case Updated',
    comment_added: 'Comment Added',
    next_action_scheduled: 'Next Action Scheduled',
    resolution_submitted: 'Resolution Submitted',
    case_reopened: 'Case Reopened',
    contacted: 'Contacted',
    investigation_started: 'Investigation Started',
    information_requested: 'Information Requested',
    follow_up_scheduled: 'Follow-up Scheduled',
    internal_discussion: 'Internal Discussion',
    issue_resolved: 'Issue Resolved',
  }[t] || t.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase()))
}

function EditForm({ c, categories, onSaved, onError }) {
  const [f, setF] = useState({
    title: c.title, category: c.category, description: c.description || '',
    status: c.status,
    due_date: c.due_date || '', next_action_date: c.next_action_date || '',
    next_action: c.next_action || '', resolution_note: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  // Priority is derived from the selected category's default_priority —
  // read-only in the UI, ignored by the backend. The backend recomputes
  // priority automatically when category changes.
  const selectedCat = (categories || []).find(cat => cat.name === f.category)
  const autoPriority = selectedCat?.default_priority || c.priority

  const save = async () => {
    if (f.status === 'Completed' && !f.resolution_note && c.status !== 'Completed') {
      onError('A resolution note is required to mark a case Completed')
      return
    }
    setSaving(true)
    // Only send changed fields
    const body = {}
    if (f.title !== c.title) body.title = f.title
    if (f.category !== c.category) body.category = f.category
    if (f.description !== (c.description || '')) body.description = f.description
    // priority is intentionally NOT sent — backend derives it from category
    if (f.status !== c.status) { body.status = f.status; if (f.status === 'Completed') body.resolution_note = f.resolution_note }
    // assigned_to is intentionally NOT sent — backend rejects manual assignment (403).
    // Changing the category triggers an automatic re-assignment on the backend.
    if (f.due_date !== (c.due_date || '')) body.due_date = f.due_date || null
    if (f.next_action_date !== (c.next_action_date || '')) body.next_action_date = f.next_action_date || null
    if (f.next_action !== (c.next_action || '')) body.next_action = f.next_action
    if (Object.keys(body).length === 0) { onSaved('No changes to save'); setSaving(false); return }
    try {
      await apiPut(`/api/cases/${c.case_id}`, body)
      onSaved('Case updated and action logged')
    } catch (e) {
      onError(e.response?.data?.error || 'Update failed')
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div className="form-grid">
        <div className="field full">
          <label className="lbl">Title</label>
          <input className="inp" value={f.title} onChange={e => set('title', e.target.value)} />
        </div>
        <div className="field">
          <label className="lbl">Category</label>
          <select className="inp" value={f.category} onChange={e => set('category', e.target.value)}>
            {(categories || []).map(cat => <option key={cat.name} value={cat.name}>{cat.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="lbl">Priority <span className="muted" style={{ fontWeight: 400 }}>(auto)</span></label>
          <div style={{ paddingTop: 9 }}><PriorityBadge priority={autoPriority} /></div>
        </div>
        <div className="field">
          <label className="lbl">Status</label>
          <select className="inp" value={f.status} onChange={e => set('status', e.target.value)}>
            {STATUSES.map(x => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="lbl">Assigned to <span className="muted" style={{ fontWeight: 400 }}>(automatic)</span></label>
          <div style={{ paddingTop: 9 }}>
            {c.assigned_to_name
              ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="badge st-Active"><span className="dot" style={{ background: 'currentColor' }} />{c.assigned_to_name}</span>
                  <span className="muted text-xs">Assignment method: {c.assignment_status === 'Assigned' ? 'Automatic' : '—'}</span>
                </div>
              : <span className="muted text-sm">Awaiting Assignment</span>}
            <div className="muted text-xs" style={{ marginTop: 6, maxWidth: 320 }}>
              Assignment is automatic and based on skills, workload &amp; availability. Changing the category re-runs the engine and may reassign the case.
            </div>
          </div>
        </div>
        <div className="field">
          <label className="lbl">Due date</label>
          <input type="date" className="inp" value={f.due_date} onChange={e => set('due_date', e.target.value)} />
        </div>
        <div className="field">
          <label className="lbl">Next action date</label>
          <input type="date" className="inp" value={f.next_action_date} onChange={e => set('next_action_date', e.target.value)} />
        </div>
        <div className="field full">
          <label className="lbl">Next action</label>
          <input className="inp" value={f.next_action} onChange={e => set('next_action', e.target.value)} />
        </div>
        <div className="field full">
          <label className="lbl">Description</label>
          <textarea className="inp" value={f.description} onChange={e => set('description', e.target.value)} />
        </div>
        {f.status === 'Completed' && c.status !== 'Completed' && (
          <div className="field full">
            <label className="lbl">Resolution note <span style={{ color: 'var(--overdue)' }}>*</span></label>
            <textarea className="inp" placeholder="Describe how the case was resolved…"
              value={f.resolution_note} onChange={e => set('resolution_note', e.target.value)} />
          </div>
        )}
      </div>
      <div className="flex gap-8" style={{ marginTop: 16 }}>
        <button className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <IconCheck size={16} />} Save changes
        </button>
      </div>
    </div>
  )
}

function ActionForm({ c, users, onSaved, onError }) {
  const [f, setF] = useState({
    action_type: 'contacted', description: '',
    next_action_date: '', next_action: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const submit = async () => {
    if (!f.description.trim() && !f.next_action_date) { onError('Add a comment or a next action'); return }
    setSaving(true)
    try {
      await apiPost(`/api/cases/${c.case_id}/actions`, f)
      set({ description: '', next_action_date: '', next_action: '' })
      onSaved('Action recorded in the activity log')
    } catch (e) {
      onError(e.response?.data?.error || 'Failed to record action')
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div className="text-sm muted" style={{ marginBottom: 14, background: 'var(--surface-2)', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}>
        Quick action for <b style={{ color: 'var(--accent)' }}>{c.case_code}</b>. Every entry is timestamped and
        permanently written to the activity log.
      </div>
      <div className="field full" style={{ marginBottom: 12 }}>
        <label className="lbl">Action type</label>
        <select className="inp" value={f.action_type} onChange={e => set('action_type', e.target.value)}>
          <option value="contacted">Contacted</option>
          <option value="investigation_started">Investigation Started</option>
          <option value="information_requested">Information Requested</option>
          <option value="follow_up_scheduled">Follow-up Scheduled</option>
          <option value="internal_discussion">Internal Discussion</option>
          <option value="issue_resolved">Issue Resolved</option>
          <option value="comment_added">Other / Comment</option>
        </select>
      </div>
      <div className="field full" style={{ marginBottom: 12 }}>
        <label className="lbl">Description</label>
        <textarea className="inp" placeholder="What did you do? e.g. 'Called customer, confirmed the refund was processed.'"
          value={f.description} onChange={e => set('description', e.target.value)} />
      </div>
      <div className="divider" />
      <div className="section-title" style={{ marginTop: 12 }}>Optional — schedule next action</div>
      <div className="form-grid">
        <div className="field">
          <label className="lbl">Next action date</label>
          <input type="date" className="inp" value={f.next_action_date} onChange={e => set('next_action_date', e.target.value)} />
        </div>
        <div className="field">
          <label className="lbl">Next action</label>
          <input className="inp" placeholder="e.g. Follow up call" value={f.next_action} onChange={e => set('next_action', e.target.value)} />
        </div>
      </div>
      <div className="flex gap-8" style={{ marginTop: 16 }}>
        <button className="btn btn-primary" disabled={saving} onClick={submit}>
          {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <IconCheck size={16} />} Record action
        </button>
      </div>
    </div>
  )
}
