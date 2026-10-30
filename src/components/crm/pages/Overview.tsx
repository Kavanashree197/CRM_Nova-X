"use client";
import React, { useEffect, useState, useCallback } from "react";
import { apiGet } from "../api";
import { useAuth } from "../AuthProvider";
import KpiCard from "../KpiCard";
import { StatusBadge, PriorityBadge, OverdueTag } from "../Badge";
import { Loading, EmptyState } from "../Feedback";
import CaseDetailDrawer from "../CaseDetailDrawer";
import { ResponsiveContainer, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { IconActivity, IconRefresh } from "../icons";

const STATUS_COLORS: Record<string,string> = { New:"#4F46E5", Active:"#2563EB", Pending:"#B45309", Completed:"#047857", Reopened:"#B91C1C" };
const fmtDay = (d:string) => d.slice(5);
const tooltipStyle = { border:"1px solid #E5E7EB", borderRadius:8, fontSize:12, boxShadow:"0 4px 12px rgba(16,24,40,.08)", padding:8 };

export default function Overview({ onOpenCase, onNav }: { onOpenCase:(id:number)=>void; onNav:(v:any)=>void }) {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const load = useCallback(() => { setLoading(true); apiGet("/api/dashboard/summary").then(setData).finally(()=>setLoading(false)); }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading label="Loading dashboard…" />;
  if (!data) return <EmptyState title="Couldn't load dashboard" />;
  const k = data.kpis;
  const statusData = Object.entries(data.status_distribution).map(([name,v]:any) => ({ name, value: v, color: STATUS_COLORS[name] }));
  const openCase = (id:number) => { setOpenId(id); onOpenCase(id); };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Overview</div>
          <div className="page-sub">Welcome back, {user?.name}. Here&apos;s what&apos;s happening across your workspace today.</div>
        </div>
        <button className="btn" onClick={load}><IconRefresh size={16} /> Refresh</button>
      </div>

      <div className="grid kpi-grid">
        <KpiCard kind="total" value={k.total_cases} />
        <KpiCard kind="active" value={k.active_cases} />
        <KpiCard kind="completed" value={k.completed_cases} foot="all time" />
        <KpiCard kind="overdue" value={k.overdue_cases} foot="needs attention" />
        <KpiCard kind="actions" value={k.total_actions} foot="recorded" />
      </div>

      <div className="grid charts-grid mt-24">
        <div className="card">
          <div className="card-head"><div className="card-title">Daily Case Creation vs Completion</div><div className="card-link">last 14 days</div></div>
          <div className="card-pad" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.daily} margin={{ top:10, right:10, left:-16, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize:11, fill:"#6B7280" }} axisLine={{ stroke:"#E5E7EB" }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize:11, fill:"#6B7280" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize:12 }} />
                <Bar dataKey="created" name="Created" fill="#2563EB" radius={[3,3,0,0]} />
                <Bar dataKey="completed" name="Completed" fill="#047857" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div className="card-title">Weekly Productivity Trend</div><div className="card-link">actions / day</div></div>
          <div className="card-pad" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.weekly} margin={{ top:10, right:10, left:-16, bottom:0 }}>
                <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563EB" stopOpacity={0.25} /><stop offset="100%" stopColor="#2563EB" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize:11, fill:"#6B7280" }} axisLine={{ stroke:"#E5E7EB" }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize:11, fill:"#6B7280" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="actions" name="Actions" stroke="#2563EB" strokeWidth={2} fill="url(#ga)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid charts-grid-3 mt-16">
        <div className="card">
          <div className="card-head"><div className="card-title">Workload Distribution by Resource</div></div>
          <div className="card-pad" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.workload} layout="vertical" margin={{ top:6, right:20, left:20, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize:11, fill:"#6B7280" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize:12, fill:"#1F2937" }} width={90} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize:12 }} />
                <Bar dataKey="active_count" name="Active" stackId="a" fill="#2563EB" />
                <Bar dataKey="completed_count" name="Completed" stackId="a" fill="#047857" />
                <Bar dataKey="overdue_count" name="Overdue" stackId="a" fill="#DC2626" radius={[0,3,3,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div className="card-title">Case Status Distribution</div></div>
          <div className="card-pad" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {statusData.map((s,i)=><Cell key={i} fill={s.color} stroke="#fff" strokeWidth={2} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize:12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid charts-grid mt-16">
        <div className="card">
          <div className="card-head"><div className="card-title"><span className="live-pulse" style={{ marginRight: 8 }} /> Recent Activity</div><div className="card-link" onClick={()=>onNav("activity-logs")}>View all →</div></div>
          <div className="card-pad">
            {data.recent_activities.length === 0 ? <EmptyState title="No recent activity" />
            : <div className="feed">
                {data.recent_activities.map((a:any) => (
                  <div className="feed-item" key={a.action_id}>
                    <div className="feed-dot"><IconActivity size={15} /></div>
                    <div className="feed-body">
                      <div className="feed-top"><span className="feed-type">{a.action_type.replace(/_/g," ")}</span><span className="feed-case" onClick={()=>openCase(a.case_id)}>{a.case_code}</span><span className="muted text-xs">· {a.user_name}</span></div>
                      <div className="feed-desc">{a.description}</div>
                      <div className="feed-meta">{a.created_at.replace("T"," ").slice(0,16)}</div>
                    </div>
                  </div>
                ))}
              </div>}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div className="card-title">Priority Cases</div><div className="card-link" onClick={()=>onNav("all-cases")}>All cases →</div></div>
          <div className="card-pad">
            {data.priority_cases.length === 0 ? <EmptyState title="No priority cases" />
            : <div className="feed">
                {data.priority_cases.map((c:any) => (
                  <div className="feed-item" key={c.case_id} style={{ cursor:"pointer" }} onClick={()=>openCase(c.case_id)}>
                    <div className="feed-dot" style={{ background:"var(--st-pending-bg)", color:"var(--st-pending)" }}>!</div>
                    <div className="feed-body">
                      <div className="feed-top"><span className="feed-case">{c.case_code}</span><PriorityBadge priority={c.priority} /><StatusBadge status={c.status} /></div>
                      <div className="feed-desc">{c.title}</div>
                      <div className="feed-meta">Assignee: {c.assigned_to_name || "Unassigned"} · Due {c.due_date}</div>
                    </div>
                  </div>
                ))}
              </div>}
          </div>
        </div>
      </div>

      <div className="grid charts-grid mt-16">
        <div className="card">
          <div className="card-head"><div className="card-title">Overdue Cases</div><div className="card-link">{data.overdue_cases.length} total</div></div>
          <div className="table-wrap">
            <table className="tbl"><thead><tr><th>Case</th><th>Assignee</th><th>Due</th><th>Overdue</th></tr></thead>
              <tbody>
                {data.overdue_cases.length === 0 ? <tr><td colSpan={4}><EmptyState title="No overdue cases 🎉" /></td></tr>
                : data.overdue_cases.map((c:any) => (
                  <tr key={c.case_id} className="clickable row-overdue" onClick={()=>openCase(c.case_id)}>
                    <td className="code">{c.case_code}<div className="muted text-xs">{c.title}</div></td>
                    <td className="muted">{c.assigned_to_name}</td><td className="overdue-text mono">{c.due_date}</td>
                    <td><OverdueTag days={c.days_overdue} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div className="card-title">Upcoming Due Dates</div><div className="card-link">next 7 days</div></div>
          <div className="table-wrap">
            <table className="tbl"><thead><tr><th>Case</th><th>Assignee</th><th>Status</th><th>Due</th></tr></thead>
              <tbody>
                {data.upcoming_due.length === 0 ? <tr><td colSpan={4}><EmptyState title="Nothing due soon" /></td></tr>
                : data.upcoming_due.map((c:any) => (
                  <tr key={c.case_id} className="clickable" onClick={()=>openCase(c.case_id)}>
                    <td className="code">{c.case_code}<div className="muted text-xs">{c.title}</div></td>
                    <td className="muted">{c.assigned_to_name}</td><td><StatusBadge status={c.status} /></td><td className="mono">{c.due_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card mt-16">
        <div className="card-head"><div className="card-title">Resource Workload Overview</div></div>
        <div className="card-pad">
          {data.workload.length === 0 ? <EmptyState title="No resources" />
          : data.workload.map((w:any) => {
            const total = w.total_count || 1;
            return (
              <div key={w.user_id} style={{ marginBottom: 14 }}>
                <div className="flex between" style={{ marginBottom: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{w.name}</div>
                  <div className="stat-bar">
                    <span className="mono">{w.active_count} active</span><span className="mono">{w.completed_count} done</span>
                    {w.overdue_count > 0 && <span className="mono overdue-text">{w.overdue_count} overdue</span>}
                  </div>
                </div>
                <div className="bar-track" style={{ display:"flex" }}>
                  <div className="bar-fill" style={{ width:`${(w.active_count/total)*100}%` }} />
                  <div className="bar-fill green" style={{ width:`${(w.completed_count/total)*100}%` }} />
                  <div className="bar-fill red" style={{ width:`${(w.overdue_count/total)*100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {openId !== null && <CaseDetailDrawer caseId={openId} onClose={()=>setOpenId(null)} onChanged={load} />}
    </div>
  );
}
