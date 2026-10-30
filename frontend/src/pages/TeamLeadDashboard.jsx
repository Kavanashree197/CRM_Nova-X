import React, { useEffect, useState, useCallback } from 'react'
import { apiGet } from '../api'
import { useAuth } from '../auth'
import KpiCard from '../components/KpiCard'
import { StatusBadge, PriorityBadge, ComplexityBadge, OverdueTag } from '../components/Badge'
import { Loading, EmptyState } from '../components/Feedback'
import CaseDetailDrawer from '../components/CaseDetailDrawer'
import AvailabilityControl from '../components/AvailabilityControl'
import ClosedCasesTable from '../components/ClosedCasesTable'
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { IconRefresh, IconAlert, IconClock, IconCheck, IconTeam } from '../components/icons'

const fmtDay = (d) => d.slice(5)
const tooltipStyle = { border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(16,24,40,.08)', padding: 8 }
const AVAIL_BADGE = { Available: 'st-Active', Busy: 'pri-Medium', Unavailable: 'pri-Critical' }

/**
 * Team Lead Dashboard — genuinely distinct from Admin.
 * Focus: team supervision, employee workload, case progress, follow-ups,
 * team productivity, team closed cases with closure attribution.
 *
 * All data from /api/dashboard/team (real DB records, role-scoped by Flask).
 */
export default function TeamLeadDashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    apiGet('/api/dashboard/team').then(setData).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <Loading label="Loading team dashboard…" />
  if (!data) return <EmptyState title="Couldn't load team dashboard" />
  const k = data.kpis

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Team Dashboard</div>
          <div className="page-sub">Monitor your team's workload, case progress, follow-ups and closure performance. All data from live database records.</div>
        </div>
        <button className="btn" onClick={load}><IconRefresh size={16} /> Refresh</button>
      </div>

      <AvailabilityControl />

      {/* 1. Team Workload Overview */}
      <div className="grid kpi-grid">
        <KpiCard kind="total"    value={k.team_total} />
        <KpiCard kind="active"   value={k.team_active} />
        <KpiCard kind="completed" value={k.team_closed} foot="team closures" />
        <KpiCard kind="overdue"  value={k.team_overdue} foot="needs attention" />
        <KpiCard kind="actions"  value={k.team_due_today} foot="due today" />
      </div>

      {/* 2. Employee Workload Monitoring */}
      <div className="card mt-16">
        <div className="card-head">
          <div className="card-title"><IconTeam size={15} style={{ display: 'inline', marginRight: 6 }} />Employee Workload Monitoring</div>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Active</th>
                <th>Due Today</th>
                <th>Overdue</th>
                <th>Closed</th>
                <th>Availability</th>
              </tr>
            </thead>
            <tbody>
              {(data.employees || []).length === 0
                ? <tr><td colSpan={6}><EmptyState title="No team members" /></td></tr>
                : data.employees.map(e => (
                  <tr key={e.user_id} className={e.overdue_count > 0 ? 'row-overdue' : ''}>
                    <td><b>{e.name}</b></td>
                    <td className="mono">{e.active_count}</td>
                    <td className="mono" style={{ color: e.due_today_count > 0 ? 'var(--st-pending)' : 'inherit' }}>{e.due_today_count}</td>
                    <td className="mono" style={{ color: e.overdue_count > 0 ? 'var(--overdue)' : 'inherit' }}>{e.overdue_count}</td>
                    <td className="mono" style={{ color: 'var(--st-done)' }}>{e.closed_count}</td>
                    <td>
                      <span className={`badge ${AVAIL_BADGE[e.availability || 'Available']}`}>
                        <span className="dot" style={{ background: 'currentColor' }} />{e.availability || 'Available'}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Case Progress Monitoring */}
      <div className="grid charts-grid mt-16">
        {/* Awaiting Assignment */}
        <div className="card">
          <div className="card-head"><div className="card-title"><IconAlert size={14} style={{ display: 'inline', marginRight: 4 }} />Awaiting Assignment</div><div className="card-link">{data.awaiting_cases.length}</div></div>
          <div className="card-pad">
            {data.awaiting_cases.length === 0
              ? <EmptyState title="No cases awaiting assignment" />
              : data.awaiting_cases.map(c => (
                <div key={c.case_id} className="feed-item" style={{ cursor: 'pointer' }} onClick={() => setOpenId(c.case_id)}>
                  <div className="feed-dot" style={{ background: 'var(--st-pending-bg)', color: 'var(--st-pending)' }}>!</div>
                  <div className="feed-body">
                    <div className="feed-top"><span className="feed-case">{c.case_code}</span><PriorityBadge priority={c.priority} /></div>
                    <div className="feed-desc">{c.title}</div>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Due Today */}
        <div className="card">
          <div className="card-head"><div className="card-title"><IconClock size={14} style={{ display: 'inline', marginRight: 4 }} />Due Today</div><div className="card-link">{data.due_today_cases.length}</div></div>
          <div className="card-pad">
            {data.due_today_cases.length === 0
              ? <EmptyState title="Nothing due today" />
              : data.due_today_cases.map(c => (
                <div key={c.case_id} className="feed-item" style={{ cursor: 'pointer' }} onClick={() => setOpenId(c.case_id)}>
                  <div className="feed-dot" style={{ background: 'var(--st-pending-bg)', color: 'var(--st-pending)' }}><IconClock size={13} /></div>
                  <div className="feed-body">
                    <div className="feed-top"><span className="feed-case">{c.case_code}</span><PriorityBadge priority={c.priority} /></div>
                    <div className="feed-desc">{c.title}</div>
                    <div className="feed-meta">Assignee: {c.assigned_to_name || 'Unassigned'}</div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Overdue + Upcoming */}
      <div className="grid charts-grid mt-16">
        <div className="card">
          <div className="card-head"><div className="card-title"><IconAlert size={14} style={{ display: 'inline', marginRight: 4 }} />Overdue Cases</div><div className="card-link">{data.overdue_cases.length}</div></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Case</th><th>Assignee</th><th>Due</th><th>Overdue</th></tr></thead>
              <tbody>
                {data.overdue_cases.length === 0
                  ? <tr><td colSpan={4}><EmptyState title="No overdue cases 🎉" /></td></tr>
                  : data.overdue_cases.map(c => (
                    <tr key={c.case_id} className="clickable row-overdue" onClick={() => setOpenId(c.case_id)}>
                      <td className="code">{c.case_code}<div className="muted text-xs">{c.title}</div></td>
                      <td className="muted">{c.assigned_to_name}</td>
                      <td className="overdue-text mono">{c.due_date}</td>
                      <td><OverdueTag days={c.days_overdue} /></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><div className="card-title">Upcoming (next 7 days)</div><div className="card-link">{data.upcoming_cases.length}</div></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Case</th><th>Assignee</th><th>Due</th></tr></thead>
              <tbody>
                {data.upcoming_cases.length === 0
                  ? <tr><td colSpan={3}><EmptyState title="Nothing upcoming" /></td></tr>
                  : data.upcoming_cases.map(c => (
                    <tr key={c.case_id} className="clickable" onClick={() => setOpenId(c.case_id)}>
                      <td className="code">{c.case_code}<div className="muted text-xs">{c.title}</div></td>
                      <td className="muted">{c.assigned_to_name}</td>
                      <td className="mono">{c.due_date}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 4. Team Closed Cases */}
      <div className="card mt-16">
        <div className="card-head">
          <div className="card-title"><IconCheck size={14} style={{ display: 'inline', marginRight: 4 }} />Team Closed Cases — who closed what</div>
          <div className="card-link">{data.team_closed.length} closure{data.team_closed.length === 1 ? '' : 's'}</div>
        </div>
        <ClosedCasesTable rows={data.team_closed} showAssignee={true}
                          emptyTitle="No team closed cases yet"
                          onRowClick={setOpenId} />
      </div>

      {/* 6. Team Productivity */}
      <div className="grid charts-grid mt-16">
        <div className="card">
          <div className="card-head"><div className="card-title">Cases Closed by Employee</div></div>
          <div className="card-pad" style={{ height: 280 }}>
            {(data.productivity.by_employee_closed || []).length === 0
              ? <EmptyState title="No closures yet" />
              : <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.productivity.by_employee_closed} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                    <XAxis dataKey="closed_by_name" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={{ stroke: '#E5E7EB' }} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" name="Closed" fill="#16A34A" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div className="card-title">Team Closure Trend (14 days)</div></div>
          <div className="card-pad" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.productivity.trend || []} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={{ stroke: '#E5E7EB' }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="closed" name="Closed" stroke="#16A34A" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Complexity distribution */}
      <div className="card mt-16">
        <div className="card-head"><div className="card-title">Closed Cases by Complexity</div></div>
        <div className="card-pad">
          {Object.keys(data.productivity.by_complexity || {}).length === 0
            ? <EmptyState title="No closed cases to analyze" />
            : <div className="flex gap-16" style={{ flexWrap: 'wrap' }}>
                {Object.entries(data.productivity.by_complexity).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-8">
                    <ComplexityBadge complexity={k === 'Not assessed' ? null : k} />
                    <span className="mono" style={{ fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>}
        </div>
      </div>

      {/* Recent team cases */}
      <div className="card mt-16">
        <div className="card-head"><div className="card-title">Recent Team Cases</div></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Case</th><th>Title</th><th>Priority</th><th>Status</th><th>Assignee</th></tr></thead>
            <tbody>
              {(data.recent_team_cases || []).length === 0
                ? <tr><td colSpan={5}><EmptyState title="No team cases yet" /></td></tr>
                : data.recent_team_cases.map(c => (
                  <tr key={c.case_id} className="clickable" onClick={() => setOpenId(c.case_id)}>
                    <td className="code">{c.case_code}</td>
                    <td className="title-cell">{c.title}</td>
                    <td><PriorityBadge priority={c.priority} /></td>
                    <td><StatusBadge status={c.status} /></td>
                    <td className="muted">{c.assigned_to_name || 'Unassigned'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {openId && <CaseDetailDrawer caseId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  )
}
