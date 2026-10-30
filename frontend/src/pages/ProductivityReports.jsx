import React, { useEffect, useState, useCallback } from 'react'
import { apiGet } from '../api'
import { useAuth } from '../auth'
import { Loading, EmptyState } from '../components/Feedback'
import CaseDetailDrawer from '../components/CaseDetailDrawer'
import { ComplexityBadge } from '../components/Badge'
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

const GRAN = [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']]

export default function ProductivityReports() {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [filters, setFilters] = useState({
    user_id: user?.user_id || '',
    start_date: '',
    end_date: '',
    granularity: 'daily',
  })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)

  useEffect(() => {
    apiGet('/api/auth/users').then(d => {
      setUsers(d.users || [])
      if (!filters.user_id && user) setFilters(s => ({ ...s, user_id: user.user_id }))
    })
  }, [user]) // eslint-disable-line

  const load = useCallback(() => {
    if (!filters.user_id) return
    setLoading(true)
    const p = {}
    Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v })
    apiGet('/api/reports/productivity', p).then(setData).finally(() => setLoading(false))
  }, [filters])

  useEffect(() => { load() }, [load])

  const setF = (k, v) => setFilters(s => ({ ...s, [k]: v }))
  const canPickOthers = user && (user.role === 'Admin' || user.role === 'Team Lead')

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Productivity Reports</div>
          <div className="page-sub">Individual productivity — workload, actions, completion and complexity, not closure count alone.</div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="filters">
          <div className="field">
            <label className="lbl">Resource</label>
            <select className="inp" value={filters.user_id} onChange={e => setF('user_id', e.target.value)} disabled={!canPickOthers}>
              {canPickOthers
                ? users.filter(u => u.role === 'Resource').map(u => <option key={u.user_id} value={u.user_id}>{u.name}</option>)
                : <option value={user?.user_id}>{user?.name} (me)</option>}
            </select>
          </div>
          <div className="field">
            <label className="lbl">Start date</label>
            <input type="date" className="inp" value={filters.start_date} onChange={e => setF('start_date', e.target.value)} />
          </div>
          <div className="field">
            <label className="lbl">End date</label>
            <input type="date" className="inp" value={filters.end_date} onChange={e => setF('end_date', e.target.value)} />
          </div>
          <div className="field">
            <label className="lbl">Granularity</label>
            <select className="inp" value={filters.granularity} onChange={e => setF('granularity', e.target.value)}>
              {GRAN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading ? <Loading label="Computing report…" />
        : !data ? <EmptyState title="No data" />
        : <ProductivityView data={data} onCaseClick={setOpenId} />}

      {openId && <CaseDetailDrawer caseId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  )
}

function ProductivityView({ data, onCaseClick }) {
  const s = data.summary
  const cards = [
    { label: 'Cases Created',     v: s.cases_created },
    { label: 'Cases Assigned',    v: s.cases_assigned },
    { label: 'Cases Actioned',     v: s.cases_actioned },
    { label: 'Cases Completed',   v: s.cases_completed },
    { label: 'Active Cases',       v: s.active_cases },
    { label: 'Overdue Cases',      v: s.overdue_cases },
    { label: 'Total Actions',      v: s.total_actions },
    { label: 'Avg Completion (days)', v: s.avg_completion_days },
  ]
  return (
    <div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {cards.map(c => (
          <div key={c.label} className="card card-pad">
            <div className="kpi-label">{c.label}</div>
            <div className="kpi-value mono" style={{ fontSize: 22 }}>{c.v}</div>
          </div>
        ))}
      </div>

      <div className="card mt-16">
        <div className="card-head"><div className="card-title">Activity Trend — {data.range.granularity}</div><div className="card-link">{data.user.name}</div></div>
        <div className="card-pad" style={{ height: 280 }}>
          {data.trend.length === 0
            ? <EmptyState title="No actions in this range" />
            : <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.trend} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={{ stroke: '#E5E7EB' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="actions" name="Actions" fill="#2563EB" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>}
        </div>
      </div>

      <div className="grid charts-grid mt-16">
        <CaseList title={`Cases completed (${data.completed_cases.length})`} cases={data.completed_cases} onCaseClick={onCaseClick} kind="completed" empty="No completed cases in this range." />
        <CaseList title={`Cases actioned (${data.actioned_cases.length})`} cases={data.actioned_cases} onCaseClick={onCaseClick} kind="actioned" empty="No actioned cases in this range." />
      </div>

      {/* Case complexity statistics (PS-02) */}
      {data.complexity_stats && (
        <div className="card mt-16">
          <div className="card-head"><div className="card-title">Case Complexity Distribution</div><div className="card-link">{data.user.name}</div></div>
          <div className="card-pad">
            <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <ComplexityStat label="Low" count={(data.complexity_stats.all_cases || {}).Low || 0} closed={(data.complexity_stats.closed_cases || {}).Low || 0} />
              <ComplexityStat label="Medium" count={(data.complexity_stats.all_cases || {}).Medium || 0} closed={(data.complexity_stats.closed_cases || {}).Medium || 0} />
              <ComplexityStat label="High" count={(data.complexity_stats.all_cases || {}).High || 0} closed={(data.complexity_stats.closed_cases || {}).High || 0} />
              <ComplexityStat label="Not assessed" count={(data.complexity_stats.all_cases || {})['Not assessed'] || 0} closed={(data.complexity_stats.closed_cases || {})['Not assessed'] || 0} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ComplexityStat({ label, count, closed }) {
  return (
    <div style={{ textAlign: 'center', padding: 8 }}>
      <div style={{ marginBottom: 6 }}><ComplexityBadge complexity={label === 'Not assessed' ? null : label} /></div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>{count}</div>
      <div className="text-xs muted">total cases</div>
      <div className="mono text-sm" style={{ color: 'var(--st-done)', marginTop: 4 }}>{closed} closed</div>
    </div>
  )
}

function CaseList({ title, cases, onCaseClick, kind, empty }) {
  return (
    <div className="card">
      <div className="card-head"><div className="card-title">{title}</div></div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Case</th><th>Title</th><th>Priority</th><th>Complexity</th>{kind === 'completed' && <th>Completed</th>}<th>Status</th></tr></thead>
          <tbody>
            {cases.length === 0
              ? <tr><td colSpan={6}><EmptyState title={empty} /></td></tr>
              : cases.map(c => (
                <tr key={c.case_id} className="clickable" onClick={() => onCaseClick(c.case_id)}>
                  <td className="code">{c.case_code}</td>
                  <td className="title-cell"><div>{c.title}</div><div className="muted text-xs">{c.category}</div></td>
                  <td>{c.priority}</td>
                  <td><ComplexityBadge complexity={c.complexity} /></td>
                  {kind === 'completed' && <td className="mono">{c.completion_date}</td>}
                  <td>{c.status}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const tooltipStyle = { border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(16,24,40,.08)', padding: 8 }
