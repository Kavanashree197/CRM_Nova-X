"use client";
import React, { useEffect, useState, useCallback } from "react";
import { apiGet } from "../api";
import CaseTable from "../CaseTable";
import CaseDetailDrawer from "../CaseDetailDrawer";

const STATUSES = ["New","Active","Pending","Completed","Reopened"];
const PRIORITIES = ["Low","Medium","High","Critical"];
const CATEGORIES = ["Billing","Technical Support","Account Access","Onboarding","Feature Request","Bug Report","Data Migration","Compliance"];

export default function AllCases({ initialSearch }: { initialSearch?: string }) {
  const [cases, setCases] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [filters, setFilters] = useState<any>({ status:"", priority:"", category:"", assigned_to:"", q: initialSearch || "", overdue:"" });

  const load = useCallback(() => {
    setLoading(true);
    const p:any = {};
    Object.entries(filters).forEach(([k,v]) => { if (v) p[k] = v; });
    if (filters.overdue) p.overdue = "1";
    apiGet("/api/cases", p).then((d:any)=>setCases(d.cases)).finally(()=>setLoading(false));
  }, [filters]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { apiGet("/api/auth/users").then((d:any)=>setUsers(d.users||[])); }, []);
  const setF = (k:string,v:any) => setFilters((s:any)=>({...s,[k]:v}));
  const clear = () => setFilters({ status:"", priority:"", category:"", assigned_to:"", q:"", overdue:"" });
  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">All Cases</div><div className="page-sub">Every case in the system. Use the filters to narrow down by status, priority, assignee, or category.</div></div>
      </div>
      <div className="card card-pad">
        <div className="filters">
          <div className="field"><label className="lbl">Search</label><input className="inp" placeholder="Title or code" value={filters.q} onChange={e=>setF("q",e.target.value)} style={{ height:34 }} /></div>
          <div className="field"><label className="lbl">Status</label><select className="inp" value={filters.status} onChange={e=>setF("status",e.target.value)}><option value="">All</option>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
          <div className="field"><label className="lbl">Priority</label><select className="inp" value={filters.priority} onChange={e=>setF("priority",e.target.value)}><option value="">All</option>{PRIORITIES.map(s=><option key={s}>{s}</option>)}</select></div>
          <div className="field"><label className="lbl">Category</label><select className="inp" value={filters.category} onChange={e=>setF("category",e.target.value)}><option value="">All</option>{CATEGORIES.map(s=><option key={s}>{s}</option>)}</select></div>
          <div className="field"><label className="lbl">Assignee</label><select className="inp" value={filters.assigned_to} onChange={e=>setF("assigned_to",e.target.value)}><option value="">Anyone</option>{users.filter((u:any)=>u.role==="Resource").map((u:any)=><option key={u.user_id} value={u.user_id}>{u.name}</option>)}</select></div>
          <div className="field"><label className="lbl">Overdue</label><select className="inp" value={filters.overdue} onChange={e=>setF("overdue",e.target.value)}><option value="">No</option><option value="1">Only overdue</option></select></div>
          {activeCount > 0 && <button className="btn btn-sm" onClick={clear}>Clear ({activeCount})</button>}
        </div>
      </div>
      <div className="card mt-16"><div className="card-head"><div className="card-title">{cases ? `${cases.length} case${cases.length===1?"":"s"}` : "Loading…"}</div></div><CaseTable cases={cases} loading={loading} onRowClick={setOpenId} /></div>
      {openId !== null && <CaseDetailDrawer caseId={openId} onClose={()=>setOpenId(null)} onChanged={load} />}
    </div>
  );
}
