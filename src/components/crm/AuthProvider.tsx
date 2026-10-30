"use client";
import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { apiPost, apiGet } from "./api";

type CRMUser = { user_id: number; name: string; email: string; role: string; active: boolean; created_at: string };

const AuthCtx = createContext<{
  user: CRMUser | null;
  login: (email: string, password: string) => Promise<CRMUser>;
  logout: () => void;
  loading: boolean;
} | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CRMUser | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem("crm_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const d = await apiPost("/api/auth/login", { email, password });
      localStorage.setItem("crm_token", d.token);
      localStorage.setItem("crm_user", JSON.stringify(d.user));
      setUser(d.user);
      return d.user;
    } finally { setLoading(false); }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("crm_token");
    localStorage.removeItem("crm_user");
    setUser(null);
  }, []);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener("crm-logout", onLogout);
    return () => window.removeEventListener("crm-logout", onLogout);
  }, []);

  return <AuthCtx.Provider value={{ user, login, logout, loading }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
