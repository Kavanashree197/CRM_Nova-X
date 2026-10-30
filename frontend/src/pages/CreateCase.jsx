import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../api'
import { useToast } from '../components/Layout'
import CaseDetailDrawer from '../components/CaseDetailDrawer'
import { PriorityBadge, ComplexityBadge } from '../components/Badge'
import { IconCheck } from '../components/icons'

const COMPLEXITY_OPTIONS = ['Low', 'Medium', 'High']

export default function CreateCase() {
  const nav = useNavigate()
  const toast = useToast()
  const [categories, setCategories] = useState([])
  const [saving, setSaving] = useState(false)
  const [createdId, setCreatedId] = useState(null)
  const [createdCase, setCreatedCase] = useState(null)
  const [f, setF] = useState({
    title: '', category: '', description: '',
    due_date: '', next_action_date: '', next_action: '',
    complexity: '',  // '' = auto-detect; user can override
  })
  const [err, setErr] = useState({})
  const [detected, setDetected] = useState({ category: null, priority: null, confidence: 'none' })
  const [detectedComplexity, setDetectedComplexity] = useState({ complexity: null, confidence: 'none' })
  const [detecting, setDetecting] = useState(false)
  const [userOverrodeCategory, setUserOverrodeCategory] = useState(false)
  const [userOverrodeComplexity, setUserOverrodeComplexity] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    apiGet('/api/categories').then(d => {
      const cats = d.categories || []
      setCategories(cats)
    })
  }, [])

  // Debounced category + complexity detection from the title text. Both are
  // detected in parallel — category from /api/categories/detect, complexity
  // from /api/cases/detect-complexity. Fires 400ms after the user stops typing.
  const detectFromTitle = useCallback(async (title, desc) => {
    if (!title || title.trim().length < 3) {
      setDetected({ category: null, priority: null, confidence: 'none' })
      setDetectedComplexity({ complexity: null, confidence: 'none' })
      setDetecting(false)
      return
    }
    setDetecting(true)
    try {
      // Category detection
      const catResult = await apiPost('/api/categories/detect', { title })
      setDetected(catResult)
      if (catResult.category && !userOverrodeCategory) {
        setF(s => ({ ...s, category: catResult.category }))
      }
      // Complexity detection (uses title + description)
      const cxResult = await apiPost('/api/cases/detect-complexity', { title, description: desc || '' })
      setDetectedComplexity(cxResult)
      if (cxResult.complexity && !userOverrodeComplexity) {
        setF(s => ({ ...s, complexity: cxResult.complexity }))
      }
    } catch {
      setDetected({ category: null, priority: null, confidence: 'none' })
      setDetectedComplexity({ complexity: null, confidence: 'none' })
    } finally {
      setDetecting(false)
    }
  }, [userOverrodeCategory, userOverrodeComplexity])

  const onTitleChange = (value) => {
    setF(s => ({ ...s, title: value }))
    setUserOverrodeCategory(false)
    setUserOverrodeComplexity(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => detectFromTitle(value, f.description), 400)
  }

  const onDescriptionChange = (value) => {
    setF(s => ({ ...s, description: value }))
    // Re-trigger complexity detection when description changes (it uses both)
    if (f.title.trim().length >= 3) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => detectFromTitle(f.title, value), 400)
    }
  }

  const onCategoryChange = (value) => {
    setF(s => ({ ...s, category: value }))
    setUserOverrodeCategory(true)
  }

  const onComplexityChange = (value) => {
    setF(s => ({ ...s, complexity: value }))
    setUserOverrodeComplexity(true)
  }

  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const selectedCat = categories.find(c => c.name === f.category)
  const autoPriority = detected.priority || selectedCat?.default_priority || null

  const validate = () => {
    const e = {}
    if (!f.title.trim()) e.title = 'Title is required'
    if (!f.category) e.category = 'Category is required (type a title for auto-detection or select manually)'
    if (!f.complexity) e.complexity = 'Complexity is required (type a title for auto-detection or select manually)'
    if (f.due_date && f.next_action_date && f.next_action_date > f.due_date) e.next_action_date = 'Next action date should be on or before due date'
    setErr(e)
    return Object.keys(e).length === 0
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      const body = { title: f.title, category: f.category, description: f.description,
                     due_date: f.due_date, next_action_date: f.next_action_date,
                     next_action: f.next_action, complexity: f.complexity }
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
          <div className="page-sub">Open a new customer case. Category, priority and complexity are auto-detected from the title — the backend validates the final values.</div>
        </div>
      </div>

      <form className="card card-pad" style={{ maxWidth: 820 }} onSubmit={submit}>
        <div className="form-grid">
          <div className="field full">
            <label className="lbl">Case title <span style={{ color: 'var(--overdue)' }}>*</span></label>
            <input className={`inp ${err.title ? 'err' : ''}`} placeholder="e.g. Payment deducted but order not confirmed"
              value={f.title} onChange={e => onTitleChange(e.target.value)} />
            {err.title && <div className="field-error">{err.title}</div>}
            {detecting && <div className="text-xs muted" style={{ marginTop: 4 }}><span className="spinner" style={{ width: 10, height: 10, marginRight: 4 }} />Detecting category &amp; complexity…</div>}
            {!detecting && detected.category && detected.confidence === 'high' && !userOverrodeCategory && (
              <div className="text-xs" style={{ marginTop: 4, color: 'var(--st-done)' }}>✓ Category auto-detected: <b>{detected.category}</b></div>
            )}
            {!detecting && detected.confidence === 'none' && f.title.trim().length >= 3 && !userOverrodeCategory && (
              <div className="text-xs muted" style={{ marginTop: 4 }}>Category not detected — select manually below.</div>
            )}
          </div>
          <div className="field">
            <label className="lbl">
              Category
              {detected.category && !userOverrodeCategory && detected.confidence !== 'none' && (
                <span className="text-xs muted" style={{ fontWeight: 400, marginLeft: 6 }}>(auto-detected)</span>
              )}
              {userOverrodeCategory && (
                <span className="text-xs muted" style={{ fontWeight: 400, marginLeft: 6 }}>(manual)</span>
              )}
            </label>
            <select className={`inp ${err.category ? 'err' : ''}`} value={f.category} onChange={e => onCategoryChange(e.target.value)}>
              <option value="">— Select category —</option>
              {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            {err.category && <div className="field-error">{err.category}</div>}
          </div>
          <div className="field">
            <label className="lbl">Priority <span className="muted" style={{ fontWeight: 400 }}>(auto from category)</span></label>
            <div style={{ paddingTop: 9 }}>
              {autoPriority
                ? <PriorityBadge priority={autoPriority} />
                : <span className="muted text-sm">Type a title to auto-detect.</span>}
            </div>
          </div>
          <div className="field">
            <label className="lbl">
              Complexity
              {detectedComplexity.complexity && !userOverrodeComplexity && detectedComplexity.confidence !== 'none' && (
                <span className="text-xs muted" style={{ fontWeight: 400, marginLeft: 6 }}>(auto-detected)</span>
              )}
              {userOverrodeComplexity && (
                <span className="text-xs muted" style={{ fontWeight: 400, marginLeft: 6 }}>(manual)</span>
              )}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingTop: 4 }}>
              {f.complexity
                ? <ComplexityBadge complexity={f.complexity} />
                : <span className="muted text-sm">{f.title.trim().length >= 3 ? 'Complexity not detected — select manually.' : 'Type a title to auto-detect.'}</span>}
              <select className="inp btn-sm" style={{ width: 'auto', height: 30, fontSize: 12 }}
                value={f.complexity} onChange={e => onComplexityChange(e.target.value)}>
                <option value="">— override —</option>
                {COMPLEXITY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {err.complexity && <div className="field-error">{err.complexity}</div>}
          </div>
          <div className="field">
            <label className="lbl">Assigned to <span className="muted" style={{ fontWeight: 400 }}>(automatic)</span></label>
            <div style={{ paddingTop: 9, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="badge st-Active"><span className="dot" style={{ background: 'currentColor' }} />Automatically Assigned</span>
              <span className="muted text-sm">System assigns by workload &amp; complexity.</span>
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
              value={f.description} onChange={e => onDescriptionChange(e.target.value)} />
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
                : (<span>Status: <b>Awaiting Assignment</b> — no Available Resource found.</span>)}
            </div>
            <div style={{ marginTop: 6 }}><span className="tag-link" onClick={() => setCreatedId(null)}>View case details →</span></div>
          </div>
        )}
      </form>

      {createdId && <CaseDetailDrawer caseId={createdId} onClose={() => setCreatedId(null)} onChanged={() => {}} />}
    </div>
  )
}
