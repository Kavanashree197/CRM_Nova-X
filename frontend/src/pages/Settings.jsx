import React, { useEffect, useState, useCallback } from 'react'
import { apiGet, apiPost, apiPut } from '../api'
import { useAuth } from '../auth'
import { useToast } from '../components/Layout'
import { Loading, EmptyState } from '../components/Feedback'
import { IconPlus } from '../components/icons'

const ROLES = ['Admin', 'Team Lead', 'Resource']
const AVAILABILITY = ['Available', 'Busy', 'Unavailable']
// Skills are the same set as the category list (the engine matches a Resource's
// skills against the case category). Loaded from /api/categories.
const AVAIL_BADGE = {
  Available: 'st-Active',
  Busy: 'pri-Medium',
  Unavailable: 'pri-Critical',
}

export default function Settings() {
  const { user } = useAuth()
  const toast = useToast()
  const [users, setUsers] = useState(null)
  const [categories, setCategories] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'Resource' })

  const load = useCallback(() => {
    apiGet('/api/auth/users').then(d => setUsers(d.users || [])).catch(() => setUsers([]))
    apiGet('/api/categories').then(d => setCategories((d.categories || []).map(c => c.name)))
  }, [])
  useEffect(() => { load() }, [load])

  const submit = async (e) => {
    e.preventDefault()
    if (!f.name || !f.email || !f.password) { toast('All fields are required', 'err'); return }
    try {
      await apiPost('/api/auth/users', f)
      toast('User created')
      setF({ name: '', email: '', password: '', role: 'Resource' })
      setShowForm(false)
      load()
    } catch (e2) { toast(e2.response?.data?.error || 'Failed to create user', 'err') }
  }

  // Toggle a skill in a user's skill list, then PUT to backend
  const toggleSkill = async (u, skill) => {
    const current = (u.skills || '').split(',').map(s => s.trim()).filter(Boolean)
    const next = current.includes(skill) ? current.filter(s => s !== skill) : [...current, skill]
    const skillsCsv = next.join(',')
    try {
      await apiPut(`/api/auth/users/${u.user_id}`, { skills: skillsCsv })
      toast(`Skills updated for ${u.name}`)
      load()
    } catch (e) { toast(e.response?.data?.error || 'Failed to update skills', 'err') }
  }

  const setAvailability = async (u, avail) => {
    try {
      await apiPut(`/api/auth/users/${u.user_id}`, { availability: avail })
      toast(`${u.name} is now ${avail}` + (avail === 'Unavailable' ? ' — active cases re-queued for reassignment.' : ''))
      load()
    } catch (e) { toast(e.response?.data?.error || 'Failed to update availability', 'err') }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-sub">Manage users, skills and availability. Assignment is automatic — Admins do not assign cases manually.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}><IconPlus size={16} /> New user</button>
      </div>

      <div className="card card-pad" style={{ maxWidth: 720, marginBottom: 16 }}>
        <div className="flex gap-12 items-center">
          <div className="avatar" style={{ width: 40, height: 40 }}>{user?.name?.[0]}</div>
          <div>
            <div style={{ fontWeight: 600 }}>{user?.name}</div>
            <div className="text-sm muted">{user?.email}</div>
          </div>
          <div className="role-pill admin" style={{ marginLeft: 'auto' }}>{user?.role}</div>
        </div>
      </div>

      {showForm && (
        <form className="card card-pad" style={{ maxWidth: 640, marginBottom: 16 }} onSubmit={submit}>
          <div className="section-title" style={{ marginTop: 0 }}>Create new user</div>
          <div className="form-grid">
            <div className="field full"><label className="lbl">Name</label><input className="inp" value={f.name} onChange={e => setF(s => ({ ...s, name: e.target.value }))} placeholder="Full name" /></div>
            <div className="field"><label className="lbl">Email</label><input className="inp" type="email" value={f.email} onChange={e => setF(s => ({ ...s, email: e.target.value }))} placeholder="name@crm.io" /></div>
            <div className="field"><label className="lbl">Password</label><input className="inp" value={f.password} onChange={e => setF(s => ({ ...s, password: e.target.value }))} placeholder="Initial password" /></div>
            <div className="field"><label className="lbl">Role</label><select className="inp" value={f.role} onChange={e => setF(s => ({ ...s, role: e.target.value }))}>{ROLES.map(r => <option key={r}>{r}</option>)}</select></div>
          </div>
          <div className="flex gap-8" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" type="submit">Create user</button>
            <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="card-head">
          <div className="card-title">Users ({users?.length || 0}) — skills &amp; availability</div>
          <div className="card-link">Assignment is automatic</div>
        </div>
        {!users ? <Loading label="Loading users…" />
          : users.length === 0 ? <EmptyState title="No users" />
          : <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Name</th><th>Role</th><th>Skills (categories)</th><th>Availability</th><th>Status</th></tr></thead>
                <tbody>
                  {users.map(u => {
                    const userSkills = (u.skills || '').split(',').map(s => s.trim()).filter(Boolean)
                    return (
                      <tr key={u.user_id}>
                        <td>
                          <div className="flex items-center gap-8">
                            <div className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>{u.name?.[0]}</div>
                            <b>{u.name}</b>
                            {u.user_id === user.user_id && <span className="text-xs muted">(you)</span>}
                          </div>
                          <div className="muted text-xs">{u.email}</div>
                        </td>
                        <td><span className={`role-pill ${u.role === 'Admin' ? 'admin' : u.role === 'Team Lead' ? 'lead' : ''}`}>{u.role}</span></td>
                        <td>
                          {u.role === 'Resource'
                            ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 320 }}>
                                {categories.map(cat => {
                                  const on = userSkills.includes(cat)
                                  return (
                                    <span key={cat}
                                      className={`chip ${on ? 'active' : ''}`}
                                      style={{ fontSize: 11, padding: '3px 8px' }}
                                      onClick={() => toggleSkill(u, cat)}
                                      title={on ? `Click to remove ${cat}` : `Click to add ${cat}`}>
                                      {cat}{on ? ' ✓' : ''}
                                    </span>
                                  )
                                })}
                              </div>
                            : <span className="muted text-xs">— (not a Resource)</span>}
                        </td>
                        <td>
                          {u.role === 'Resource'
                            ? <select className="inp" style={{ height: 32, fontSize: 12, width: 130 }}
                                value={u.availability || 'Available'}
                                onChange={e => setAvailability(u, e.target.value)}>
                                {AVAILABILITY.map(a => <option key={a}>{a}</option>)}
                              </select>
                            : <span className="muted text-xs">—</span>}
                          {u.availability && u.availability !== 'Available' && u.role === 'Resource' && (
                            <div style={{ marginTop: 4 }}><span className={`badge ${AVAIL_BADGE[u.availability]}`}>{u.availability}</span></div>
                          )}
                        </td>
                        <td>{u.active ? <span className="badge st-Active"><span className="dot" style={{ background: 'currentColor' }} />Active</span> : <span className="badge pri-Low">Inactive</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>}
      </div>
    </div>
  )
}
