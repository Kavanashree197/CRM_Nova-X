import React, { useState, useCallback, createContext, useContext } from 'react'
import Sidebar from './Sidebar'
import TopNav from './TopNav'
import { Toast } from './Feedback'

const ToastCtx = createContext(null)
export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used inside Layout')
  return ctx
}

export default function Layout({ children }) {
  const [toast, setToast] = useState(null)
  let timer = null
  const push = useCallback((message, kind = 'ok') => {
    setToast({ message, kind })
    clearTimeout(timer)
    timer = setTimeout(() => setToast(null), 3200)
  }, [])

  return (
    <ToastCtx.Provider value={push}>
      <div className="app-shell">
        <Sidebar />
        <div className="main">
          <TopNav />
          <div className="main-scroll">{children}</div>
        </div>
      </div>
      <Toast toast={toast} />
    </ToastCtx.Provider>
  )
}
