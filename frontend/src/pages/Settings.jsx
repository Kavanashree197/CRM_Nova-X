import React, { useEffect, useState, useCallback } from 'react'
import { apiGet, apiPost } from '../api'
import { useAuth } from '../auth'
import { useToast } from '../components/Layout'
import { Loading, EmptyState } from '../components/Feedback'
import { IconPlus, IconUser } from '../components/icons'

const ROLES = ['Admin', 'Team Lead', 'Resource']

export default function Settings() {
  const { user } = useAuth()
  const toast = useToast()
  const [users, setUsers] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'Resource' })

  const load = useCallback(() => {
    apiGet('/api/auth/users').then(d => setUsers(d.users || [])).catch(() => setUsers([]))
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

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-sub">Manage users and roles. Admin-only area.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}><IconPlus size={16} /> New user</button>
      </div>

      <div className="card card-pad" style={{ maxWidth: 640, marginBottom: 16 }}>
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
        <div className="card-head"><div className="card-title">Users ({users?.length || 0})</div></div>
        {!users ? <Loading label="Loading users…" />
          : users.length === 0 ? <EmptyState title="No users" />
          : <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th></tr></thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.user_id}>
                      <td><div className="flex items-center gap-8"><div className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>{u.name?.[0]}</div><b>{u.name}</b>{u.user_id === user.user_id && <span className="text-xs muted">(you)</span>}</div></td>
                      <td className="muted">{u.email}</td>
                      <td><span className={`role-pill ${u.role === 'Admin' ? 'admin' : u.role === 'Team Lead' ? 'lead' : ''}`}>{u.role}</span></td>
                      <td>{u.active ? <span className="badge st-Active"><span className="dot" style={{ background: 'currentColor' }} />Active</span> : <span className="badge pri-Low">Inactive</span>}</td>
                      <td className="mono muted">{u.created_at ? u.created_at.slice(0, 10) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
      </div>
    </div>
  )
}
