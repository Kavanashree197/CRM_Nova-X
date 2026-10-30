import React, { useEffect, useState, useCallback } from 'react'
import { apiGet } from '../api'
import { useAuth } from '../auth'
import CaseTable from '../components/CaseTable'
import CaseDetailDrawer from '../components/CaseDetailDrawer'
import { Loading } from '../components/Feedback'
import { useNavigate } from 'react-router-dom'
import { IconPlus } from '../components/icons'

const today = () => new Date().toISOString().slice(0, 10)

export default function MyCases() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [cases, setCases] = useState(null)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    apiGet('/api/cases', { assigned_to: user?.user_id })
      .then(d => setCases(d.cases)).finally(() => setLoading(false))
  }, [user])

  useEffect(() => { if (user) load() }, [user, load])

  if (!user) return null
  const dueToday     = (cases || []).filter(c => c.due_date === today() && c.status !== 'Completed')
  const overdue      = (cases || []).filter(c => c.is_overdue)
  const upcoming     = (cases || []).filter(c => c.due_date && c.due_date > today() && c.status !== 'Completed')
  const updated      = [...(cases || [])].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">My Cases</div>
          <div className="page-sub">Your assigned workload. Click any case to record an action, add a comment, or update its status.</div>
        </div>
        <button className="btn btn-primary" onClick={() => nav('/create-case')}><IconPlus size={16} /> New case</button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <MiniStat label="Assigned to me" value={cases?.length ?? '—'} />
        <MiniStat label="Due today" value={dueToday.length} tone="amber" />
        <MiniStat label="Overdue" value={overdue.length} tone="red" />
        <MiniStat label="Upcoming" value={upcoming.length} tone="blue" />
      </div>

      <Section title="Due today" cases={dueToday} onRow={setOpenId} loading={loading && !cases} empty="Nothing due today." />
      <Section title="Overdue cases" cases={overdue} onRow={setOpenId} loading={loading && !cases} empty="No overdue cases." overdue />
      <Section title="Upcoming" cases={upcoming} onRow={setOpenId} loading={loading && !cases} empty="No upcoming cases." />
      <Section title="Recently updated" cases={updated.slice(0, 6)} onRow={setOpenId} loading={loading && !cases} empty="No cases yet." />

      {openId && <CaseDetailDrawer caseId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  )
}

function MiniStat({ label, value, tone }) {
  const color = tone === 'red' ? 'var(--overdue)' : tone === 'amber' ? 'var(--st-pending)' : tone === 'blue' ? 'var(--accent)' : 'var(--text)'
  return (
    <div className="card card-pad">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value mono" style={{ color }}>{value}</div>
    </div>
  )
}

function Section({ title, cases, onRow, loading, empty, overdue }) {
  return (
    <div className="card mt-16">
      <div className="card-head"><div className="card-title">{title}</div><div className="card-link">{cases.length}</div></div>
      <CaseTable cases={cases} loading={loading} emptyTitle={empty} onRowClick={onRow} compact />
    </div>
  )
}
