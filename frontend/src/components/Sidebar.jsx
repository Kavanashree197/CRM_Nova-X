import React from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth'
import {
  IconDashboard, IconBriefcase, IconList, IconPlus, IconActivity,
  IconReport, IconTeam, IconSettings, IconShield, IconHistory,
} from './icons'

const NAV = [
  { to: '/', label: 'Overview', icon: IconDashboard, roles: ['Admin', 'Team Lead', 'Resource'] },
  // "My Cases" is the personal workload view — only Resources are assigned cases
  // (the assignment engine never assigns to Admins or Team Leads), so this nav
  // item is hidden for them. Admin + Team Lead see organization/team-wide cases
  // through "All Cases".
  { to: '/my-cases', label: 'My Cases', icon: IconBriefcase, roles: ['Resource'] },
  { to: '/all-cases', label: 'All Cases', icon: IconList, roles: ['Admin', 'Team Lead', 'Resource'] },
  { to: '/create-case', label: 'Create Case', icon: IconPlus, roles: ['Admin', 'Team Lead', 'Resource'] },
  { to: '/activity-logs', label: 'Activity Logs', icon: IconActivity, roles: ['Admin', 'Team Lead', 'Resource'] },
  { to: '/audit', label: 'Audit History', icon: IconHistory, roles: ['Admin', 'Team Lead', 'Resource'] },
  { to: '/reports', label: 'Productivity Reports', icon: IconReport, roles: ['Admin', 'Team Lead', 'Resource'] },
  { to: '/team', label: 'Team Performance', icon: IconTeam, roles: ['Admin', 'Team Lead'] },
  { to: '/trust', label: 'Trust & Fairness', icon: IconShield, roles: ['Admin', 'Team Lead', 'Resource'] },
  { to: '/settings', label: 'Settings', icon: IconSettings, roles: ['Admin'] },
]

export default function Sidebar() {
  const { user } = useAuth()
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
        </div>
        <div className="brand-name">CRM</div>
      </div>
      <nav className="nav">
        <div className="nav-section">Workspace</div>
        {NAV.filter(n => n.roles.includes(user?.role)).map(n => {
          const Icon = n.icon
          return (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <Icon /><span>{n.label}</span>
            </NavLink>
          )
        })}
      </nav>
      <div className="sidebar-foot">
        CRM · PS-02 Case Management<br/>v1.0 · {user?.role || '—'}
      </div>
    </aside>
  )
}
