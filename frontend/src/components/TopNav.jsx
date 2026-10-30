import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { IconSearch, IconBell, IconLogout, IconUser } from './icons'

export default function TopNav() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); inputRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = (e) => {
    e.preventDefault()
    if (q.trim()) navigate(`/all-cases?q=${encodeURIComponent(q.trim())}`)
  }

  const initials = (user?.name || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()
  const roleClass = user?.role === 'Admin' ? 'admin' : user?.role === 'Team Lead' ? 'lead' : ''

  return (
    <header className="topnav">
      <form className="search" onSubmit={submit}>
        <span className="ic"><IconSearch size={16} /></span>
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search cases by title or code…  (Ctrl+K)" />
      </form>
      <div className="topnav-right">
        <button className="icon-btn" title="Notifications"><IconBell size={18} /><span className="notif-dot" /></button>
        <div className="profile" onClick={() => navigate('/settings')} title="Account settings">
          <div className="avatar">{initials}</div>
          <div className="profile-meta">
            <div className="profile-name">{user?.name}</div>
            <div className="text-xs muted">{user?.email}</div>
          </div>
          <span className={`role-pill ${roleClass}`}>{user?.role}</span>
        </div>
        <button className="icon-btn" title="Sign out" onClick={() => { logout(); navigate('/login') }}>
          <IconLogout size={18} />
        </button>
      </div>
    </header>
  )
}
