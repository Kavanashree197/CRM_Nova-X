import React, { useEffect, useState, useCallback } from 'react'
import { apiGet, apiPut, apiDelete } from '../api'
import { useAuth } from '../auth'
import { useToast } from './Layout'

/**
 * Self-service "My Skills" card. The authenticated employee can:
 *   - view the skills currently on their profile
 *   - add an existing skill from the catalog (dropdown)
 *   - add a brand-new skill (typed; auto-created in the catalog)
 *   - remove a skill from their own profile
 *
 * All writes go to /api/skills/me (PUT add, DELETE remove). The backend
 * derives the user_id from the JWT — a request can never target another
 * user's profile. Newly added skills are immediately considered by the
 * automatic assignment engine on the next case creation.
 *
 * Shown for Resource role (employees who get cases assigned). Hidden for
 * Admin (no cases) and Team Lead (no cases) — they manage skills via
 * Settings instead.
 */
export default function MySkillsControl() {
  const { user } = useAuth()
  const toast = useToast()
  const [mySkills, setMySkills] = useState([])
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState('')
  const [custom, setCustom] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [me, cat] = await Promise.all([
        apiGet('/api/skills/me'),
        apiGet('/api/skills'),
      ])
      setMySkills(me.skills || [])
      setCatalog((cat.skills || []).map(s => s.name))
    } catch (e) {
      toast(e.response?.data?.error || 'Failed to load skills', 'err')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line

  useEffect(() => { if (user?.role === 'Resource') load() }, [user, load])

  // Only Resources are assigned cases, so only they need this self-service card.
  if (!user || user.role !== 'Resource') return null

  const availableToAdd = catalog.filter(s => !mySkills.includes(s))

  const addExisting = async () => {
    if (!selected) { toast('Pick a skill from the list first', 'err'); return }
    setSaving(true)
    try {
      const d = await apiPut('/api/skills/me', { name: selected })
      setMySkills(d.skills || [])
      setSelected('')
      toast(`Added "${d.added}" to your skills` + (d.new_skill_created ? ' (new skill created in catalog)' : ''))
    } catch (e) {
      toast(e.response?.data?.error || 'Failed to add skill', 'err')
    } finally { setSaving(false) }
  }

  const addCustom = async (e) => {
    e.preventDefault()
    const name = custom.trim()
    if (!name) { toast('Type a skill name first', 'err'); return }
    setSaving(true)
    try {
      const d = await apiPut('/api/skills/me', { name })
      setMySkills(d.skills || [])
      setCustom('')
      toast(`Added "${d.added}" to your skills` + (d.new_skill_created ? ' (new skill created in catalog)' : ''))
    } catch (e) {
      toast(e.response?.data?.error || 'Failed to add skill', 'err')
    } finally { setSaving(false) }
  }

  const remove = async (name) => {
    setSaving(true)
    try {
      const d = await apiDelete(`/api/skills/me/${encodeURIComponent(name)}`)
      setMySkills(d.skills || [])
      toast(`Removed "${d.removed}" from your skills`)
    } catch (e) {
      toast(e.response?.data?.error || 'Failed to remove skill', 'err')
    } finally { setSaving(false) }
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 16, maxWidth: 820 }}>
      <div className="flex gap-12 items-center" style={{ marginBottom: 14 }}>
        <div className="kpi-ic" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', width: 40, height: 40 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>My Skills</div>
          <div className="text-sm muted">Add skills you've learned — the automatic assignment engine picks them up for future cases that require them.</div>
        </div>
      </div>

      {/* Current skills (chips with remove) */}
      <div className="section-title" style={{ marginTop: 0 }}>Your current skills</div>
      {loading ? <div className="loading"><span className="spinner" style={{ width: 14, height: 14 }} /> Loading…</div>
        : mySkills.length === 0
          ? <div className="text-sm muted" style={{ padding: '6px 0' }}>No skills registered yet. Add your first one below.</div>
          : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
              {mySkills.map(s => (
                <span key={s} className="chip active" style={{ fontSize: 12 }}>
                  {s}
                  <span className="muted" style={{ marginLeft: 6, cursor: saving ? 'wait' : 'pointer' }}
                        title={`Remove ${s} from your profile`}
                        onClick={() => !saving && remove(s)}>✕</span>
                </span>
              ))}
            </div>}

      {/* Add from catalog + add custom */}
      <div className="divider" style={{ margin: '12px 0' }} />
      <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="field">
          <label className="lbl">Add an existing skill</label>
          <div className="flex gap-8">
            <select className="inp" value={selected} onChange={e => setSelected(e.target.value)}
                    disabled={saving || availableToAdd.length === 0} style={{ flex: 1 }}>
              <option value="">{availableToAdd.length ? '— pick —' : '(all catalog skills already added)'}</option>
              {availableToAdd.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={addExisting} disabled={saving || !selected}>Add</button>
          </div>
        </div>
        <form className="field" onSubmit={addCustom}>
          <label className="lbl">Add a new skill</label>
          <div className="flex gap-8">
            <input className="inp" value={custom} onChange={e => setCustom(e.target.value)}
                   placeholder="e.g. Kubernetes" disabled={saving} style={{ flex: 1 }} />
            <button className="btn btn-sm" type="submit" disabled={saving || !custom.trim()}>Add</button>
          </div>
        </form>
      </div>
    </div>
  )
}
