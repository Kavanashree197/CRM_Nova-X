import React, { useState } from 'react'
import { apiPut } from '../api'
import { useAuth } from '../auth'
import { useToast } from './Layout'

const OPTIONS = [
  { value: 'Available',  badge: 'st-Active',   label: 'Available' },
  { value: 'Busy',       badge: 'pri-Medium',  label: 'Busy' },
  { value: 'Unavailable', badge: 'pri-Critical', label: 'Unavailable' },
]

/**
 * Self-service availability control. Renders for the authenticated
 * Resource or Team Lead (Admins don't take cases, so the control is
 * hidden for them). Posts to PUT /api/auth/me/availability — the
 * backend derives the user_id from the JWT, so a request can never
 * target another user.
 */
export default function AvailabilityControl() {
  const { user, setUser } = useAuth()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  if (!user || user.role === 'Admin') return null
  const current = user.availability || 'Available'

  const change = async (value) => {
    setSaving(true)
    try {
      const d = await apiPut('/api/auth/me/availability', { availability: value })
      setUser({ ...user, availability: value })
      toast(`Your status is now ${value}` + (value === 'Unavailable' ? ' — your active cases have been re-queued for reassignment.' : ''))
    } catch (e) {
      toast(e.response?.data?.error || 'Failed to update availability', 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 16, maxWidth: 720 }}>
      <div className="flex gap-12 items-center">
        <div className="kpi-ic" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', width: 40, height: 40 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>My availability</div>
          <div className="text-sm muted">Setting this controls whether new cases are automatically assigned to you.</div>
        </div>
        <div className="flex gap-8">
          {OPTIONS.map(o => (
            <button key={o.value}
              className={`chip ${current === o.value ? 'active' : ''}`}
              disabled={saving}
              onClick={() => change(o.value)}
              style={{ cursor: saving ? 'wait' : 'pointer' }}>
              <span className="dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor' }} />
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
