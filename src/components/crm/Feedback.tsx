"use client";
import React, { useState, useCallback, createContext, useContext } from "react";

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="loading"><span className="spinner" /> <span>{label}</span></div>;
}
export function EmptyState({ icon, title, sub, action }: any) {
  return (
    <div className="empty">
      {icon && <div className="ic">{icon}</div>}
      <div style={{ fontWeight: 600, color: "var(--text-2)" }}>{title}</div>
      {sub && <div className="text-sm" style={{ marginTop: 4 }}>{sub}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

const ToastCtx = createContext<(msg: string, kind?: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<any>(null);
  let timer: any = null;
  const push = useCallback((message: string, kind = "ok") => {
    setToast({ message, kind });
    clearTimeout(timer);
    timer = setTimeout(() => setToast(null), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {toast && <div className={`toast ${toast.kind || ""}`}><span>{toast.message}</span></div>}
    </ToastCtx.Provider>
  );
}
