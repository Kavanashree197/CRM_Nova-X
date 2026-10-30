import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { apiPost, apiGet } from './api'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('crm_user')
    return raw ? JSON.parse(raw) : null
  })
  const [loading, setLoading] = useState(false)

  const login = useCallback(async (email, password) => {
    setLoading(true)
    try {
      const data = await apiPost('/api/auth/login', { email, password })
      localStorage.setItem('crm_token', data.token)
      localStorage.setItem('crm_user', JSON.stringify(data.user))
      setUser(data.user)
      return data.user
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('crm_token')
    localStorage.removeItem('crm_user')
    setUser(null)
  }, [])

  // Re-validate the token once on boot.
  useEffect(() => {
    const token = localStorage.getItem('crm_token')
    if (token && !user) {
      apiGet('/api/auth/me').then(r => setUser(r.user)).catch(() => logout())
    }
  }, []) // eslint-disable-line

  return (
    <AuthCtx.Provider value={{ user, login, logout, loading, setUser }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
