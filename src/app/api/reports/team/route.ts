import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";

function range(req: Request) {
  const url = new URL(req.url);
  const end = new Date(); end.setHours(23,59,59,999);
  const start = new Date(); start.setDate(start.getDate() - 30); start.setHours(0,0,0,0);
  const s = url.searchParams.get("start_date");
  const e = url.searchParams.get("end_date");
  if (s) start.setTime(new Date(s).getTime());
  if (e) end.setTime(new Date(e).getTime() + 86399999);
  return { start, end, granularity: url.searchParams.get("granularity") || "daily",
           status: url.searchParams.get("status"), category: url.searchParams.get("category") };
}

export async function GET(req: Request) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (user.role !== "Admin" && user.role !== "Team Lead")
    return NextResponse.json({ error: "Forbidden: Admin/Team Lead only" }, { status: 403 });
  const { start, end, granularity, status, category } = range(req);
  const today = new Date(); today.setHours(0,0,0,0);

  const caseWhere: any = { createdAt: { gte: start, lte: end } };
  if (status) caseWhere.status = status;
  if (category) caseWhere.category = category;

  const resources = await db.user.findMany({ where: { role: "Resource", active: true } });
  const out = [];
  for (const r of resources) {
    const inRange = await db.case.findMany({ where: { ...caseWhere, OR: [{ createdById: r.id }, { assignedToId: r.id }] } });
    const allAssigned = await db.case.findMany({ where: { assignedToId: r.id } });
    out.push({
      user_id: r.id, name: r.name,
      cases_created: inRange.filter(c => c.createdById === r.id).length,
      cases_assigned: await db.caseAssignment.count({ where: { assignedToId: r.id, assignedAt: { gte: start, lte: end } } }),
      cases_completed: allAssigned.filter(c => c.status === "Completed" && c.completionDate && c.completionDate >= start && c.completionDate <= end).length,
      active_count: allAssigned.filter(c => ["New","Active","Pending","Reopened"].includes(c.status)).length,
      overdue_count: allAssigned.filter(c => c.status !== "Completed" && c.dueDate && c.dueDate < today).length,
      total_actions: await db.caseAction.count({ where: { userId: r.id, createdAt: { gte: start, lte: end } } }),
    });
  }
  out.sort((a,b) => b.cases_completed - a.cases_completed || b.overdue_count - a.overdue_count);

  // trend
  const allActions = await db.caseAction.findMany({ where: { createdAt: { gte: start, lte: end } }, select: { createdAt: true } });
  const bucketFn = (d: Date) => {
    if (granularity === "weekly") {
      const dt = new Date(d); const day = (dt.getDay() + 6) % 7; dt.setDate(dt.getDate() - day);
      return `${dt.getFullYear()}-W${String(getWeek(dt)).padStart(2,"0")}`;
    }
    if (granularity === "monthly") return d.toISOString().slice(0,7);
    return d.toISOString().slice(0,10);
  };
  const trendMap: Record<string, number> = {};
  allActions.forEach(a => { const b = bucketFn(a.createdAt); trendMap[b] = (trendMap[b]||0)+1; });
  const trend = Object.entries(trendMap).sort().map(([label, actions]) => ({ label, actions }));

  const statusBreak = await db.case.groupBy({ by: ["status"], where: caseWhere, _count: true });
  const categoryBreak = await db.case.groupBy({ by: ["category"], where: caseWhere, _count: true, orderBy: { _count: "desc" } });

  return NextResponse.json({
    range: { start_date: start.toISOString().slice(0,10), end_date: end.toISOString().slice(0,10), granularity, status, category },
    resources: out,
    trend,
    status_breakdown: Object.fromEntries(statusBreak.map(r => [r.status, r._count])),
    category_breakdown: Object.fromEntries(categoryBreak.map(r => [r.category, r._count])),
  });
}

function getWeek(d: Date): number {
  const date = new Date(d.valueOf()); date.setHours(0,0,0,0); date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}
