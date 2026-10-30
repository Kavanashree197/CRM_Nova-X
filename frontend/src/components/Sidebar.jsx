import React from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth'
import {
  IconDashboard, IconBriefcase, IconList, IconPlus, IconActivity,
  IconReport, IconTeam, IconSettings,
} from './icons'

const NAV = [
  { to: '/', label: 'Overview', icon: IconDashboard, roles: ['Admin', 'Team Lead', 'Resource'] },
  { to: '/my-cases', label: 'My Cases', icon: IconBriefcase, roles: ['Admin', 'Team Lead', 'Resource'] },
  { to: '/all-cases', label: 'All Cases', icon: IconList, roles: ['Admin', 'Team Lead', 'Resource'] },
  { to: '/create-case', label: 'Create Case', icon: IconPlus, roles: ['Admin', 'Team Lead', 'Resource'] },
  { to: '/activity-logs', label: 'Activity Logs', icon: IconActivity, roles: ['Admin', 'Team Lead', 'Resource'] },
  { to: '/reports', label: 'Productivity Reports', icon: IconReport, roles: ['Admin', 'Team Lead', 'Resource'] },
  { to: '/team', label: 'Team Performance', icon: IconTeam, roles: ['Admin', 'Team Lead'] },
  { to: '/settings', label: 'Settings', icon: IconSettings, roles: ['Admin'] },
]

export default function Sidebar() {
  const { user } = useAuth()
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">CF</div>
        <div className="brand-name">Case<span>Flow</span></div>
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
        CaseFlow CRM · Round 2 POC<br/>v1.0 · {user?.role || '—'}
      </div>
    </aside>
  )
}
