import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'

const DEMO_CREDS = [
  { role: 'Admin',      email: 'admin@crm.io',  pw: 'admin123' },
  { role: 'Team Lead',  email: 'lead@crm.io',   pw: 'lead123' },
  { role: 'Resource',   email: 'rahul@crm.io',  pw: 'rahul123' },
]

export default function Login() {
  const { login, loading } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('admin@crm.io')
  const [pw, setPw] = useState('admin123')
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      await login(email, pw)
      nav('/')
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Login failed')
    }
  }

  const quick = (c) => { setEmail(c.email); setPw(c.pw) }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
        </div>
        <div className="login-title">CRM</div>
        <div className="login-sub">Case Management & Productivity</div>
        {err && <div style={{ background: 'var(--st-reopened-bg)', color: 'var(--st-reopened)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12, border: '1px solid #FECACA' }}>{err}</div>}
        <div className="field" style={{ marginBottom: 12 }}>
          <label className="lbl">Email</label>
          <input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@crm.io" />
        </div>
        <div className="field" style={{ marginBottom: 16 }}>
          <label className="lbl">Password</label>
          <input className="inp" type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" />
        </div>
        <button className="btn btn-primary" style={{ width: '100%', height: 40 }} disabled={loading}>
          {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Sign in'}
        </button>
        <div className="login-cred">
          <b>Demo accounts</b> — click to fill:
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {DEMO_CREDS.map(c => (
              <div key={c.email} className="tag-link" onClick={() => quick(c)}>
                {c.role}: <b>{c.email}</b> / {c.pw}
              </div>
            ))}
          </div>
        </div>
      </form>
    </div>
  )
}
