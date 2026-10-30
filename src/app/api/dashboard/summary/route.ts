import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";

export async function GET(req: Request) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = today.toISOString().slice(0,10);

  const total = await db.case.count();
  const active = await db.case.count({ where: { status: { in: ["New","Active","Pending","Reopened"] } } });
  const completed = await db.case.count({ where: { status: "Completed" } });
  const overdue = await db.case.count({
    where: { status: { not: "Completed" }, dueDate: { lt: today, not: null } },
  });
  const totalActions = await db.caseAction.count();

  // Status distribution
  const statusRows = await db.case.groupBy({ by: ["status"], _count: true });
  const status_dist: Record<string, number> = {};
  statusRows.forEach(r => { status_dist[r.status] = r._count; });

  // Workload by resource
  const resources = await db.user.findMany({ where: { role: "Resource", active: true } });
  const workload = [];
  for (const r of resources) {
    const cs = await db.case.findMany({ where: { assignedToId: r.id } });
    workload.push({
      user_id: r.id, name: r.name,
      active_count: cs.filter(c => ["New","Active","Pending","Reopened"].includes(c.status)).length,
      completed_count: cs.filter(c => c.status === "Completed").length,
      overdue_count: cs.filter(c => c.status !== "Completed" && c.dueDate && c.dueDate < today).length,
      total_count: cs.length,
    });
  }
  workload.sort((a,b) => b.active_count - a.active_count);

  // Daily created vs completed (last 14 days)
  const daily = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const next = new Date(d); next.setDate(d.getDate() + 1);
    const created = await db.case.count({ where: { createdAt: { gte: d, lt: next } } });
    const dayStr = d.toISOString().slice(0,10);
    const completedToday = await db.case.count({ where: { completionDate: new Date(dayStr) } });
    const actions = await db.caseAction.count({ where: { createdAt: { gte: d, lt: next } } });
    daily.push({ date: dayStr, created, completed: completedToday, actions });
  }

  // Weekly productivity (last 7 days actions/day)
  const weekly = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const next = new Date(d); next.setDate(d.getDate() + 1);
    const actions = await db.caseAction.count({ where: { createdAt: { gte: d, lt: next } } });
    weekly.push({ date: d.toISOString().slice(0,10), actions });
  }

  // Recent activities (latest 12)
  const recent = await db.caseAction.findMany({
    include: { user: { select: { name: true } }, case: { select: { caseCode: true, title: true } } },
    orderBy: { id: "desc" }, take: 12,
  });

  // Priority cases (High/Critical, not completed)
  const priority_cases = await db.case.findMany({
    where: { priority: { in: ["High","Critical"] }, status: { not: "Completed" } },
    include: { assignedTo: { select: { name: true } } },
    orderBy: [{ priority: "asc" }, { dueDate: "asc" }], take: 10,
  });

  // Overdue cases detail
  const overdueRows = await db.case.findMany({
    where: { status: { not: "Completed" }, dueDate: { lt: today, not: null } },
    include: { assignedTo: { select: { name: true } } },
    orderBy: { dueDate: "asc" }, take: 15,
  });
  const overdue_cases = overdueRows.map(c => ({
    case_id: c.id, case_code: c.caseCode, title: c.title, status: c.status,
    due_date: c.dueDate!.toISOString().slice(0,10), assigned_to: c.assignedToId,
    assigned_to_name: c.assignedTo?.name,
    days_overdue: Math.floor((today.getTime() - c.dueDate!.getTime()) / 86400000),
  }));

  // Upcoming due (next 7 days, not completed)
  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
  const upcomingRows = await db.case.findMany({
    where: { status: { not: "Completed" }, dueDate: { gte: today, lte: weekEnd, not: null } },
    include: { assignedTo: { select: { name: true } } },
    orderBy: { dueDate: "asc" }, take: 15,
  });
  const upcoming_due = upcomingRows.map(c => ({
    case_id: c.id, case_code: c.caseCode, title: c.title, status: c.status,
    due_date: c.dueDate!.toISOString().slice(0,10), assigned_to: c.assignedToId,
    assigned_to_name: c.assignedTo?.name,
  }));

  return NextResponse.json({
    kpis: { total_cases: total, active_cases: active, completed_cases: completed, overdue_cases: overdue, total_actions: totalActions },
    status_distribution: status_dist,
    workload,
    daily, weekly,
    recent_activities: recent.map(a => ({
      action_id: a.id, case_id: a.caseId, user_id: a.userId, action_type: a.actionType,
      description: a.description, previous_value: a.previousValue, new_value: a.newValue,
      created_at: a.createdAt.toISOString(), user_name: a.user?.name,
      case_code: a.case?.caseCode, case_title: a.case?.title,
    })),
    priority_cases: priority_cases.map(c => ({
      case_id: c.id, case_code: c.caseCode, title: c.title, priority: c.priority,
      status: c.status, due_date: c.dueDate?.toISOString().slice(0,10) ?? null,
      assigned_to: c.assignedToId, assigned_to_name: c.assignedTo?.name,
    })),
    overdue_cases, upcoming_due,
  });
}
