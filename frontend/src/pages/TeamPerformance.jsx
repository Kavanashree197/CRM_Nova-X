import React, { useEffect, useState, useCallback } from 'react'
import { apiGet } from '../api'
import { Loading, EmptyState } from '../components/Feedback'
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

const STATUS_COLORS = { New: '#4F46E5', Active: '#2563EB', Pending: '#B45309', Completed: '#047857', Reopened: '#B91C1C' }
const CAT_COLORS = ['#2563EB', '#047857', '#B45309', '#7C3AED', '#DC2626', '#0891B2', '#4F46E5', '#65A30D']
const GRAN = [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']]
const STATUSES = ['New', 'Active', 'Pending', 'Completed', 'Reopened']
const CATEGORIES = ['Billing', 'Technical Support', 'Account Access', 'Onboarding', 'Feature Request', 'Bug Report', 'Data Migration', 'Compliance']

export default function TeamPerformance() {
  const [filters, setFilters] = useState({ start_date: '', end_date: '', granularity: 'daily', status: '', category: '' })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const p = {}
    Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v })
    apiGet('/api/reports/team', p).then(setData).finally(() => setLoading(false))
  }, [filters])

  useEffect(() => { load() }, [load])
  const setF = (k, v) => setFilters(s => ({ ...s, [k]: v }))

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Team Performance</div>
          <div className="page-sub">Workload, completion, actions and overdue counts across the whole team — never closure count alone.</div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="filters">
          <div className="field"><label className="lbl">Start date</label><input type="date" className="inp" value={filters.start_date} onChange={e => setF('start_date', e.target.value)} /></div>
          <div className="field"><label className="lbl">End date</label><input type="date" className="inp" value={filters.end_date} onChange={e => setF('end_date', e.target.value)} /></div>
          <div className="field"><label className="lbl">Status</label><select className="inp" value={filters.status} onChange={e => setF('status', e.target.value)}><option value="">All</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
          <div className="field"><label className="lbl">Category</label><select className="inp" value={filters.category} onChange={e => setF('category', e.target.value)}><option value="">All</option>{CATEGORIES.map(s => <option key={s}>{s}</option>)}</select></div>
          <div className="field"><label className="lbl">Granularity</label><select className="inp" value={filters.granularity} onChange={e => setF('granularity', e.target.value)}>{GRAN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        </div>
      </div>

      {loading ? <Loading label="Building team report…" />
        : !data ? <EmptyState title="No data" />
        : <TeamView data={data} />}

    </div>
  )
}

function TeamView({ data }) {
  const statusData = Object.entries(data.status_breakdown).map(([name, v]) => ({ name, value: v, color: STATUS_COLORS[name] }))
  const catData = Object.entries(data.category_breakdown).map(([name, v], i) => ({ name, value: v, color: CAT_COLORS[i % CAT_COLORS.length] }))

  return (
    <div>
      {/* Resource-wise table */}
      <div className="card mt-16">
        <div className="card-head"><div className="card-title">Resource-wise Productivity</div></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Resource</th><th>Created</th><th>Assigned</th><th>Completed</th><th>Active</th><th>Overdue</th><th>Actions</th></tr></thead>
            <tbody>
              {data.resources.length === 0
                ? <tr><td colSpan={7}><EmptyState title="No resources" /></td></tr>
                : data.resources.map(r => (
                  <tr key={r.user_id}>
                    <td><b>{r.name}</b></td>
                    <td className="mono">{r.cases_created}</td>
                    <td className="mono">{r.cases_assigned}</td>
                    <td className="mono" style={{ color: 'var(--st-done)' }}>{r.cases_completed}</td>
                    <td className="mono">{r.active_count}</td>
                    <td className="mono" style={{ color: r.overdue_count > 0 ? 'var(--overdue)' : 'inherit' }}>{r.overdue_count}</td>
                    <td className="mono">{r.total_actions}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts */}
      <div className="grid charts-grid mt-16">
        <div className="card">
          <div className="card-head"><div className="card-title">Completed vs Active vs Overdue by Resource</div></div>
          <div className="card-pad" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.resources} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={{ stroke: '#E5E7EB' }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="cases_completed" name="Completed" fill="#047857" radius={[3,3,0,0]} />
                <Bar dataKey="active_count" name="Active" fill="#2563EB" radius={[3,3,0,0]} />
                <Bar dataKey="overdue_count" name="Overdue" fill="#DC2626" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div className="card-title">Team Activity Trend</div><div className="card-link">{data.range.granularity}</div></div>
          <div className="card-pad" style={{ height: 300 }}>
            {data.trend.length === 0
              ? <EmptyState title="No activity in range" />
              : <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.trend} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={{ stroke: '#E5E7EB' }} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="actions" name="Actions" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>}
          </div>
        </div>
      </div>

      <div className="grid charts-grid mt-16">
        <div className="card">
          <div className="card-head"><div className="card-title">Status Breakdown</div></div>
          <div className="card-pad" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} paddingAngle={2}>
                  {statusData.map((s, i) => <Cell key={i} fill={s.color} stroke="#fff" strokeWidth={2} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div className="card-title">Category Breakdown</div></div>
          <div className="card-pad" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={catData} layout="vertical" margin={{ top: 6, right: 20, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#1F2937' }} width={110} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" name="Cases" fill="#2563EB" radius={[0,3,3,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

const tooltipStyle = { border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(16,24,40,.08)', padding: 8 }
