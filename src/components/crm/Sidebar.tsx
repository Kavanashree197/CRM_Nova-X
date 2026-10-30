"use client";
import React from "react";
import { useAuth } from "./AuthProvider";
import {
  IconDashboard, IconBriefcase, IconList, IconPlus, IconActivity,
  IconReport, IconTeam, IconSettings,
} from "./icons";

export type View =
  | "overview" | "my-cases" | "all-cases" | "create-case"
  | "activity-logs" | "reports" | "team" | "settings";

const NAV: { key: View; label: string; icon: any; roles: string[] }[] = [
  { key: "overview",      label: "Overview",            icon: IconDashboard, roles: ["Admin","Team Lead","Resource"] },
  { key: "my-cases",      label: "My Cases",            icon: IconBriefcase, roles: ["Admin","Team Lead","Resource"] },
  { key: "all-cases",     label: "All Cases",           icon: IconList,      roles: ["Admin","Team Lead","Resource"] },
  { key: "create-case",   label: "Create Case",         icon: IconPlus,      roles: ["Admin","Team Lead","Resource"] },
  { key: "activity-logs", label: "Activity Logs",      icon: IconActivity,  roles: ["Admin","Team Lead","Resource"] },
  { key: "reports",       label: "Productivity Reports",icon: IconReport,    roles: ["Admin","Team Lead","Resource"] },
  { key: "team",          label: "Team Performance",    icon: IconTeam,      roles: ["Admin","Team Lead"] },
  { key: "settings",      label: "Settings",            icon: IconSettings,  roles: ["Admin"] },
];

export default function Sidebar({ view, onNav }: { view: View; onNav: (v: View) => void }) {
  const { user } = useAuth();
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">CF</div>
        <div className="brand-name">Case<span>Flow</span></div>
      </div>
      <nav className="nav">
        <div className="nav-section">Workspace</div>
        {NAV.filter(n => n.roles.includes(user?.role || "")).map(n => {
          const Icon = n.icon;
          return (
            <div key={n.key} className={`nav-item ${view === n.key ? "active" : ""}`} onClick={() => onNav(n.key)}>
              <Icon /><span>{n.label}</span>
            </div>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        CaseFlow CRM · Round 2 POC<br/>v1.0 · {user?.role || "—"}
      </div>
    </aside>
  );
}
