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
  return { start, end, granularity: url.searchParams.get("granularity") || "daily" };
}

export async function GET(req: Request) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { start, end, granularity } = range(req);
  const url = new URL(req.url);
  let targetId = url.searchParams.get("user_id");
  if (user.role === "Resource" && targetId && Number(targetId) !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!targetId) targetId = String(user.id);
  const uid = Number(targetId);
  const target = await db.user.findUnique({ where: { id: uid }, select: { id: true, name: true, email: true, role: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const cases_created = await db.case.count({ where: { createdById: uid, createdAt: { gte: start, lte: end } } });
  const assignments = await db.caseAssignment.findMany({ where: { assignedToId: uid, assignedAt: { gte: start, lte: end } }, select: { caseId: true } });
  const cases_assigned = assignments.length;
  const actionsInRange = await db.caseAction.findMany({ where: { userId: uid, createdAt: { gte: start, lte: end } }, select: { caseId: true } });
  const cases_actioned = new Set(actionsInRange.map(a => a.caseId)).size;
  const total_actions = actionsInRange.length;
  const cases_completed = await db.case.count({ where: { assignedToId: uid, status: "Completed", completionDate: { gte: start, lte: end } } });
  const active_cases = await db.case.count({ where: { assignedToId: uid, status: { in: ["New","Active","Pending","Reopened"] } } });
  const today = new Date(); today.setHours(0,0,0,0);
  const overdue_cases = await db.case.count({ where: { assignedToId: uid, status: { not: "Completed" }, dueDate: { lt: today, not: null } } });

  // avg completion days
  const completedInRange = await db.case.findMany({ where: { assignedToId: uid, status: "Completed", completionDate: { gte: start, lte: end } }, select: { createdAt: true, completionDate: true } });
  let avg_completion_days = 0;
  if (completedInRange.length) {
    const sum = completedInRange.reduce((acc, c) => acc + ((c.completionDate!.getTime() - c.createdAt.getTime()) / 86400000), 0);
    avg_completion_days = Math.round((sum / completedInRange.length) * 10) / 10;
  }

  // trend
  const allActions = await db.caseAction.findMany({ where: { userId: uid, createdAt: { gte: start, lte: end } }, select: { createdAt: true } });
  const bucketFn = (d: Date) => {
    const s = d.toISOString();
    if (granularity === "weekly") {
      const dt = new Date(d); const day = (dt.getDay() + 6) % 7; dt.setDate(dt.getDate() - day);
      return `${dt.getFullYear()}-W${String(getWeek(dt)).padStart(2,"0")}`;
    }
    if (granularity === "monthly") return s.slice(0,7);
    return s.slice(0,10);
  };
  const trendMap: Record<string, number> = {};
  allActions.forEach(a => { const b = bucketFn(a.createdAt); trendMap[b] = (trendMap[b]||0)+1; });
  const trend = Object.entries(trendMap).sort().map(([label, actions]) => ({ label, actions }));

  const completed_cases = await db.case.findMany({
    where: { assignedToId: uid, status: "Completed", completionDate: { gte: start, lte: end } },
    orderBy: { completionDate: "desc" },
  });
  const actionedCaseIds = new Set(actionsInRange.map(a => a.caseId));
  const actioned_cases = await db.case.findMany({ where: { id: { in: [...actionedCaseIds] } }, orderBy: { id: "desc" } });

  return NextResponse.json({
    user: target,
    range: { start_date: start.toISOString().slice(0,10), end_date: end.toISOString().slice(0,10), granularity },
    summary: { cases_created, cases_assigned, cases_actioned, cases_completed, active_cases, overdue_cases, total_actions, avg_completion_days },
    trend,
    completed_cases: completed_cases.map(c => ({
      case_id: c.id, case_code: c.caseCode, title: c.title, status: c.status, priority: c.priority,
      category: c.category, due_date: c.dueDate?.toISOString().slice(0,10) ?? null, completion_date: c.completionDate?.toISOString().slice(0,10) ?? null, created_at: c.createdAt.toISOString().slice(0,10),
    })),
    actioned_cases: actioned_cases.map(c => ({
      case_id: c.id, case_code: c.caseCode, title: c.title, status: c.status, priority: c.priority, category: c.category, due_date: c.dueDate?.toISOString().slice(0,10) ?? null,
    })),
  });
}

function getWeek(d: Date): number {
  const date = new Date(d.valueOf()); date.setHours(0,0,0,0); date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}
