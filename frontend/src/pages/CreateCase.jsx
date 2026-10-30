import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../api'
import { useToast } from '../components/Layout'
import CaseDetailDrawer from '../components/CaseDetailDrawer'
import { IconCheck } from '../components/icons'

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']

export default function CreateCase() {
  const nav = useNavigate()
  const toast = useToast()
  const [users, setUsers] = useState([])
  const [categories, setCategories] = useState([])
  const [saving, setSaving] = useState(false)
  const [createdId, setCreatedId] = useState(null)
  const [f, setF] = useState({
    title: '', category: '', description: '', priority: 'Medium',
    assigned_to: '', due_date: '', next_action_date: '', next_action: '',
  })
  const [err, setErr] = useState({})

  useEffect(() => {
    apiGet('/api/auth/users').then(d => setUsers(d.users || []))
    apiGet('/api/categories').then(d => {
      const cats = (d.categories || []).map(c => c.name)
      setCategories(cats)
      if (cats.length && !f.category) setF(s => ({ ...s, category: cats[0] }))
    })
  }, []) // eslint-disable-line

  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

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
      const body = { ...f }
      if (body.assigned_to) body.assigned_to = Number(body.assigned_to)
      const d = await apiPost('/api/cases', body)
      toast('Case created and logged to activity feed')
      setCreatedId(d.case.case_id)
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
              {categories.map(x => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="lbl">Priority</label>
            <select className="inp" value={f.priority} onChange={e => set('priority', e.target.value)}>
              {PRIORITIES.map(x => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="lbl">Assign to resource</label>
            <select className="inp" value={f.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
              <option value="">Leave unassigned</option>
              {users.filter(u => u.role === 'Resource').map(u => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
            </select>
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
        {createdId && (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'var(--st-done-bg)', border: '1px solid #A7F3D0', color: 'var(--st-done)' }}>
            Case created successfully. <span className="tag-link" onClick={() => setCreatedId(null)}>View it →</span>
          </div>
        )}
      </form>

      {createdId && <CaseDetailDrawer caseId={createdId} onClose={() => setCreatedId(null)} onChanged={() => {}} />}
    </div>
  )
}
