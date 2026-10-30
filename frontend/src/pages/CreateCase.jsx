import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../api'
import { useToast } from '../components/Layout'
import CaseDetailDrawer from '../components/CaseDetailDrawer'
import { PriorityBadge } from '../components/Badge'
import { IconCheck } from '../components/icons'

export default function CreateCase() {
  const nav = useNavigate()
  const toast = useToast()
  const [categories, setCategories] = useState([])  // [{name, default_priority}]
  const [saving, setSaving] = useState(false)
  const [createdId, setCreatedId] = useState(null)
  const [createdCase, setCreatedCase] = useState(null)
  const [f, setF] = useState({
    title: '', category: '', description: '',
    due_date: '', next_action_date: '', next_action: '',
  })
  const [err, setErr] = useState({})

  useEffect(() => {
    apiGet('/api/categories').then(d => {
      const cats = d.categories || []
      setCategories(cats)
      if (cats.length && !f.category) setF(s => ({ ...s, category: cats[0].name }))
    })
  }, []) // eslint-disable-line

  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  // Priority is derived from the selected category's default_priority —
  // the backend is the source of truth; the client never sends a priority.
  const selectedCat = categories.find(c => c.name === f.category)
  const autoPriority = selectedCat?.default_priority || null

  const validate = () => {
    const e = {}
    if (!f.title.trim()) e.title = 'Title is required'
    if (f.due_date && f.next_action_date && f.next_action_date > f.due_date) e.next_action_date = 'Next action date should be on or before due date'
    setErr(e)
    return Object.keys(e).length === 0
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      // priority AND assigned_to are intentionally NOT sent — the backend
      // derives priority from the category and assigns the case automatically
      // via the assignment engine (skills + workload + availability).
      const body = { title: f.title, category: f.category, description: f.description,
                     due_date: f.due_date, next_action_date: f.next_action_date,
                     next_action: f.next_action }
      const d = await apiPost('/api/cases', body)
      toast('Case created and automatically assigned')
      setCreatedId(d.case.case_id)
      setCreatedCase(d.case)
    } catch (e2) {
      toast(e2.response?.data?.error || 'Failed to create case', 'err')
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Create Case</div>
          <div className="page-sub">Open a new customer case. Creation is logged to the activity feed automatically.</div>
        </div>
      </div>

      <form className="card card-pad" style={{ maxWidth: 820 }} onSubmit={submit}>
        <div className="form-grid">
          <div className="field full">
            <label className="lbl">Case title <span style={{ color: 'var(--overdue)' }}>*</span></label>
            <input className={`inp ${err.title ? 'err' : ''}`} placeholder="e.g. Customer cannot access billing dashboard"
              value={f.title} onChange={e => set('title', e.target.value)} />
            {err.title && <div className="field-error">{err.title}</div>}
          </div>
          <div className="field">
            <label className="lbl">Category</label>
            <select className="inp" value={f.category} onChange={e => set('category', e.target.value)}>
              {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="lbl">Priority <span className="muted" style={{ fontWeight: 400 }}>(auto from category)</span></label>
            <div style={{ paddingTop: 9 }}>
              {autoPriority
                ? <PriorityBadge priority={autoPriority} />
                : <span className="muted text-sm">Select a category to determine priority.</span>}
            </div>
          </div>
          <div className="field">
            <label className="lbl">Assigned to <span className="muted" style={{ fontWeight: 400 }}>(automatic)</span></label>
            <div style={{ paddingTop: 9, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="badge st-Active"><span className="dot" style={{ background: 'currentColor' }} />Automatically Assigned</span>
              <span className="muted text-sm">System picks the best-suited employee by skills, workload &amp; availability.</span>
            </div>
          </div>
          <div className="field">
            <label className="lbl">Due date</label>
            <input type="date" className="inp" value={f.due_date} onChange={e => set('due_date', e.target.value)} />
          </div>
          <div className="field">
            <label className="lbl">Next action date</label>
            <input type="date" className={`inp ${err.next_action_date ? 'err' : ''}`} value={f.next_action_date} onChange={e => set('next_action_date', e.target.value)} />
            {err.next_action_date && <div className="field-error">{err.next_action_date}</div>}
          </div>
          <div className="field full">
            <label className="lbl">Next action</label>
            <input className="inp" placeholder="e.g. Reproduce the issue locally" value={f.next_action} onChange={e => set('next_action', e.target.value)} />
          </div>
          <div className="field full">
            <label className="lbl">Description</label>
            <textarea className="inp" placeholder="Describe the customer issue, any context, and reproduction steps…"
              value={f.description} onChange={e => set('description', e.target.value)} />
          </div>
        </div>
        <div className="flex gap-8" style={{ marginTop: 18 }}>
          <button className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <IconCheck size={16} />} Create case
          </button>
          <button type="button" className="btn" onClick={() => nav('/all-cases')}>Cancel</button>
        </div>
        {createdId && createdCase && (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'var(--st-done-bg)', border: '1px solid #A7F3D0', color: 'var(--st-done)' }}>
            <div><b>Case {createdCase.case_code} created.</b></div>
            <div style={{ marginTop: 4, fontSize: 13 }}>
              {createdCase.assigned_to_name
                ? (<span>Automatically assigned to <b>{createdCase.assigned_to_name}</b> · Status: {createdCase.assignment_status} · Priority: {createdCase.priority}</span>)
                : (<span>Status: <b>Awaiting Assignment</b> — no eligible employee with matching skills is currently available.</span>)}
            </div>
            <div style={{ marginTop: 6 }}><span className="tag-link" onClick={() => setCreatedId(null)}>View case details →</span></div>
          </div>
        )}
      </form>

      {createdId && <CaseDetailDrawer caseId={createdId} onClose={() => setCreatedId(null)} onChanged={() => {}} />}
    </div>
  )
}
