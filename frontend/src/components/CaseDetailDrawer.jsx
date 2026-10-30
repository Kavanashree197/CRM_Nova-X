import React, { useEffect, useState } from 'react'
import { apiGet, apiPut, apiPost } from '../api'
import { useAuth } from '../auth'
import { useToast } from './Layout'
import { StatusBadge, PriorityBadge } from './Badge'
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
  const canEdit = user && (user.role === 'Admin' || user.role === 'Team Lead' || (data && data.case && data.case.assigned_to === user.user_id))

  // Load case + history + users
  const load = () => {
    setLoading(true)
    Promise.all([
      apiGet(`/api/cases/${caseId}/history`),
      apiGet('/api/auth/users'),
    ]).then(([h, u]) => {
      setData(h)
      setUsers(u.users || [])
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
        {tab === 'history' && <History actions={data.actions} assignments={data.assignments} />}
        {tab === 'edit' && (canEdit
          ? <EditForm c={c} users={users} onSaved={(msg) => { toast(msg || 'Case updated'); load(); onChanged && onChanged() }} onError={m => toast(m, 'err')} />
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
  return (
    <div>
      <dl className="kv">
        <dt>Category</dt><dd>{c.category}</dd>
        <dt>Created by</dt><dd>{c.created_by_name}</dd>
        <dt>Assigned to</dt><dd>{c.assigned_to_name || 'Unassigned'}</dd>
        <dt>Due date</dt><dd className={c.is_overdue ? 'overdue-text' : ''}>{c.due_date || '—'} {c.is_overdue && <span className="text-xs">(overdue)</span>}</dd>
        <dt>Next action</dt><dd>{c.next_action || '—'}</dd>
        <dt>Next action date</dt><dd className="mono">{c.next_action_date || '—'}</dd>
        <dt>Completion date</dt><dd className="mono">{c.completion_date || '—'}</dd>
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

function History({ actions, assignments }) {
  if (!actions || actions.length === 0) return <EmptyState title="No actions recorded yet" />
  // Combine actions into a single chronological timeline (newest first)
  const items = actions.slice().reverse()
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
  }[t] || t)
}

function EditForm({ c, users, onSaved, onError }) {
  const [f, setF] = useState({
    title: c.title, category: c.category, description: c.description || '',
    priority: c.priority, status: c.status, assigned_to: c.assigned_to || '',
    due_date: c.due_date || '', next_action_date: c.next_action_date || '',
    next_action: c.next_action || '', resolution_note: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

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
    if (f.priority !== c.priority) body.priority = f.priority
    if (f.status !== c.status) { body.status = f.status; if (f.status === 'Completed') body.resolution_note = f.resolution_note }
    if ((f.assigned_to || null) !== (c.assigned_to || null)) body.assigned_to = f.assigned_to ? Number(f.assigned_to) : null
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
            {CATEGORIES.map(x => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="lbl">Priority</label>
          <select className="inp" value={f.priority} onChange={e => set('priority', e.target.value)}>
            {PRIORITIES.map(x => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="lbl">Status</label>
          <select className="inp" value={f.status} onChange={e => set('status', e.target.value)}>
            {STATUSES.map(x => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="lbl">Assigned to</label>
          <select className="inp" value={f.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
            <option value="">Unassigned</option>
            {users.filter(u => u.role === 'Resource').map(u => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
          </select>
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
    action_type: 'comment_added', description: '',
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
          <option value="comment_added">Comment / Update</option>
          <option value="next_action_scheduled">Schedule Next Action</option>
          <option value="customer_contact">Customer Contacted</option>
          <option value="escalation">Escalation</option>
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
