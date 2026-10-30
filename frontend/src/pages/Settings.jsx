import React, { useEffect, useState, useCallback } from 'react'
import { apiGet, apiPost, apiPut } from '../api'
import { useAuth } from '../auth'
import { useToast } from '../components/Layout'
import { Loading, EmptyState } from '../components/Feedback'
import { IconPlus } from '../components/icons'

const ROLES = ['Admin', 'Team Lead', 'Resource']
const AVAIL_BADGE = {
  Available: 'st-Active',
  Busy: 'pri-Medium',
  Unavailable: 'pri-Critical',
}

export default function Settings() {
  const { user } = useAuth()
  const toast = useToast()
  const [users, setUsers] = useState(null)
  const [skillCatalog, setSkillCatalog] = useState([])   // [{skill_id, name, aliases}]
  const [showUserForm, setShowUserForm] = useState(false)
  const [showSkillForm, setShowSkillForm] = useState(false)
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'Resource' })
  const [newSkill, setNewSkill] = useState({ name: '', aliases: '' })

  const load = useCallback(() => {
    apiGet('/api/auth/users').then(d => setUsers(d.users || [])).catch(() => setUsers([]))
    apiGet('/api/skills').then(d => setSkillCatalog(d.skills || []))
  }, [])
  useEffect(() => { load() }, [load])

  const submit = async (e) => {
    e.preventDefault()
    if (!f.name || !f.email || !f.password) { toast('All fields are required', 'err'); return }
    try {
      await apiPost('/api/auth/users', f)
      toast('User created')
      setF({ name: '', email: '', password: '', role: 'Resource' })
      setShowUserForm(false)
      load()
    } catch (e2) { toast(e2.response?.data?.error || 'Failed to create user', 'err') }
  }

  const createSkill = async (e) => {
    e.preventDefault()
    if (!newSkill.name) { toast('Skill name is required', 'err'); return }
    try {
      await apiPost('/api/skills', newSkill)
      toast(`Skill '${newSkill.name}' added to catalog`)
      setNewSkill({ name: '', aliases: '' })
      setShowSkillForm(false)
      load()
    } catch (e2) { toast(e2.response?.data?.error || 'Failed to create skill', 'err') }
  }

  // Toggle a skill in a user's skill set, then PUT to backend (list of names)
  const toggleSkill = async (u, skillName) => {
    const current = Array.isArray(u.skills) ? u.skills : []
    const next = current.includes(skillName)
      ? current.filter(s => s !== skillName)
      : [...current, skillName]
    try {
      await apiPut(`/api/auth/users/${u.user_id}`, { skills: next })
      toast(`Skills updated for ${u.name}`)
      load()
    } catch (e) { toast(e.response?.data?.error || 'Failed to update skills', 'err') }
  }


  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-sub">Manage users, the dynamic skill catalog, and view availability. Availability is self-service — each person updates their own status from My Cases. Admin cannot change another user's availability.</div>
        </div>
        <div className="flex gap-8">
          <button className="btn" onClick={() => setShowSkillForm(s => !s)}><IconPlus size={16} /> New skill</button>
          <button className="btn btn-primary" onClick={() => setShowUserForm(s => !s)}><IconPlus size={16} /> New user</button>
        </div>
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

      {showSkillForm && (
        <form className="card card-pad" style={{ maxWidth: 640, marginBottom: 16 }} onSubmit={createSkill}>
          <div className="section-title" style={{ marginTop: 0 }}>Add a new skill to the catalog</div>
          <div className="text-sm muted" style={{ marginBottom: 10 }}>
            Skills are normalized. Aliases (CSV) are matched case-insensitively — e.g. adding alias <code>AI</code> resolves to <b>Artificial Intelligence</b> if it exists.
          </div>
          <div className="form-grid">
            <div className="field"><label className="lbl">Skill name</label><input className="inp" value={newSkill.name} onChange={e => setNewSkill(s => ({ ...s, name: e.target.value }))} placeholder="e.g. Kubernetes" /></div>
            <div className="field"><label className="lbl">Aliases (comma-separated)</label><input className="inp" value={newSkill.aliases} onChange={e => setNewSkill(s => ({ ...s, aliases: e.target.value }))} placeholder="e.g. k8s" /></div>
          </div>
          <div className="flex gap-8" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" type="submit">Add skill</button>
            <button type="button" className="btn" onClick={() => setShowSkillForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      {showUserForm && (
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
            <button type="button" className="btn" onClick={() => setShowUserForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="card-head">
          <div className="card-title">Skill catalog ({skillCatalog.length})</div>
          <div className="card-link">Click a skill chip on a user to add/remove</div>
        </div>
        {!skillCatalog.length ? <div className="loading">No skills yet</div>
          : <div className="card-pad" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {skillCatalog.map(s => (
                <span key={s.skill_id} className="chip active" style={{ fontSize: 12 }} title={s.aliases ? `aliases: ${s.aliases}` : ''}>
                  {s.name}{s.aliases ? <span className="muted" style={{ marginLeft: 6 }}>({s.aliases})</span> : null}
                </span>
              ))}
            </div>}
      </div>

      <div className="card mt-16">
        <div className="card-head">
          <div className="card-title">Users ({users?.length || 0}) — skills &amp; availability</div>
          <div className="card-link">Assignment is automatic</div>
        </div>
        {!users ? <Loading label="Loading users…" />
          : users.length === 0 ? <EmptyState title="No users" />
          : <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Name</th><th>Role</th><th>Skills (click to toggle)</th><th>Availability</th><th>Status</th></tr></thead>
                <tbody>
                  {users.map(u => {
                    const userSkills = Array.isArray(u.skills) ? u.skills : []
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
                            ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 380 }}>
                                {skillCatalog.map(s => {
                                  const on = userSkills.includes(s.name)
                                  return (
                                    <span key={s.skill_id}
                                      className={`chip ${on ? 'active' : ''}`}
                                      style={{ fontSize: 11, padding: '3px 8px' }}
                                      onClick={() => toggleSkill(u, s.name)}
                                      title={on ? `Click to remove ${s.name} from ${u.name}` : `Click to add ${s.name} to ${u.name}`}>
                                      {s.name}{on ? ' ✓' : ''}
                                    </span>
                                  )
                                })}
                              </div>
                            : <span className="muted text-xs">— (not a Resource)</span>}
                        </td>
                        <td>
                          {/* Read-only availability badge. Admin cannot change
                              another user's availability — it's self-service. */}
                          <span className={`badge ${AVAIL_BADGE[u.availability || 'Available']}`}>
                            <span className="dot" style={{ background: 'currentColor' }} />
                            {u.availability || 'Available'}
                          </span>
                          {u.user_id === user.user_id && u.role !== 'Admin' && (
                            <div className="text-xs muted" style={{ marginTop: 4 }}>Use My Cases to change your own</div>
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
