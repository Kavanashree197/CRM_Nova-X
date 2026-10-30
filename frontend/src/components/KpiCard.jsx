import React from 'react'
import { IconLayers, IconBriefcase, IconCheck, IconAlert, IconActivity } from './icons'

const META = {
  total:    { label: 'Total Cases',     icon: IconLayers,   bg: '#EFF6FF', fg: '#2563EB' },
  active:   { label: 'Active Cases',    icon: IconBriefcase,bg: '#EEF2FF', fg: '#4F46E5' },
  completed:{ label: 'Completed Cases', icon: IconCheck,    bg: '#ECFDF5', fg: '#047857' },
  overdue:  { label: 'Overdue Cases',   icon: IconAlert,    bg: '#FEF2F2', fg: '#B91C1C', cls: 'overdue' },
  actions:  { label: 'Actions Recorded',icon: IconActivity, bg: '#F5F3FF', fg: '#6D28D9' },
}

export default function KpiCard({ kind, value, foot }) {
  const m = META[kind]
  if (!m) return null
  const Icon = m.icon
  return (
    <div className={`card kpi ${m.cls || ''}`}>
      <div className="kpi-ic" style={{ background: m.bg, color: m.fg }}><Icon size={17} /></div>
      <div className="kpi-label">{m.label}</div>
      <div className="kpi-value mono">{value ?? 0}</div>
      {foot && <div className="kpi-foot">{foot}</div>}
    </div>
  )
}
