import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser, VALID_CATEGORIES, VALID_PRIORITIES } from "@/lib/auth";

const canSeeAll = (role: string) => role === "Admin" || role === "Team Lead";

export async function GET(req: Request) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const url = new URL(req.url);
  const p = url.searchParams;
  const where: any = {};
  if (!canSeeAll(user.role)) where.assignedToId = user.id;
  if (p.get("status")) where.status = p.get("status");
  if (p.get("priority")) where.priority = p.get("priority");
  if (p.get("category")) where.category = p.get("category");
  if (p.get("assigned_to")) where.assignedToId = Number(p.get("assigned_to"));
  const q = p.get("q");
  if (q) where.OR = [{ title: { contains: q } }, { caseCode: { contains: q } }];

  const overdue = p.get("overdue") === "1";
  const today = new Date(); today.setHours(0,0,0,0);
  let cases = await db.case.findMany({
    where,
    include: { assignedTo: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (overdue) {
    cases = cases.filter(c => c.status !== "Completed" && c.dueDate && c.dueDate < today);
  }
  const todayStr = today.toISOString().slice(0,10);
  const rows = cases.map(c => ({
    case_id: c.id, case_code: c.caseCode, title: c.title, category: c.category,
    priority: c.priority, status: c.status, due_date: c.dueDate ? c.dueDate.toISOString().slice(0,10) : null,
    next_action_date: c.nextActionDate ? c.nextActionDate.toISOString().slice(0,10) : null,
    completion_date: c.completionDate ? c.completionDate.toISOString().slice(0,10) : null,
    assigned_to: c.assignedToId, assigned_to_name: c.assignedTo?.name ?? null,
    created_at: c.createdAt.toISOString(), updated_at: c.updatedAt.toISOString(),
    is_overdue: c.status !== "Completed" && c.dueDate ? c.dueDate.toISOString().slice(0,10) < todayStr : false,
  }));
  return NextResponse.json({ cases: rows, count: rows.length });
}

export async function POST(req: Request) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const title = (body.title || "").trim();
  const category = (body.category || "").trim();
  const description = (body.description || "").trim() || null;
  const priority = body.priority || "Medium";
  const assignedTo = body.assigned_to ? Number(body.assigned_to) : null;
  const dueDate = body.due_date ? new Date(body.due_date) : null;
  const nextActionDate = body.next_action_date ? new Date(body.next_action_date) : null;
  const nextAction = (body.next_action || "").trim() || null;

  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!VALID_CATEGORIES.includes(category)) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  if (!VALID_PRIORITIES.includes(priority)) return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
  if (assignedTo !== null) {
    const au = await db.user.findUnique({ where: { id: assignedTo } });
    if (!au) return NextResponse.json({ error: "Invalid assignee" }, { status: 400 });
  }

  // Generate next case code (CASE-001 ...)
  const count = await db.case.count();
  const caseCode = `CASE-${String(count + 1).padStart(3, "0")}`;

  const c = await db.case.create({
    data: { caseCode, title, category, description, priority, status: "New",
            createdById: user.id, assignedToId: assignedTo, dueDate, nextActionDate, nextAction },
    include: { createdBy: { select: { name: true } }, assignedTo: { select: { name: true, email: true } } },
  });

  if (assignedTo !== null) {
    await db.caseAssignment.create({
      data: { caseId: c.id, assignedToId: assignedTo, assignedById: user.id,
              note: "Initial assignment at case creation" },
    });
    await db.caseAction.create({
      data: { caseId: c.id, userId: user.id, actionType: "case_created",
              description: `Case ${caseCode} created and assigned to ${c.assignedTo?.name}.`,
              previousValue: null, newValue: "New" },
    });
  } else {
    await db.caseAction.create({
      data: { caseId: c.id, userId: user.id, actionType: "case_created",
              description: `Case ${caseCode} created (unassigned).`,
              previousValue: null, newValue: "New" },
    });
  }

  return NextResponse.json({ case: serialize(c) }, { status: 201 });
}

function serialize(c: any) {
  return {
    case_id: c.id, case_code: c.caseCode, title: c.title, category: c.category,
    description: c.description, priority: c.priority, status: c.status,
    created_by: c.createdById, created_by_name: c.createdBy?.name ?? null,
    assigned_to: c.assignedToId, assigned_to_name: c.assignedTo?.name ?? null,
    assigned_to_email: c.assignedTo?.email ?? null,
    due_date: c.dueDate ? c.dueDate.toISOString().slice(0,10) : null,
    next_action_date: c.nextActionDate ? c.nextActionDate.toISOString().slice(0,10) : null,
    next_action: c.nextAction, completion_date: c.completionDate ? c.completionDate.toISOString().slice(0,10) : null,
    resolution_note: c.resolutionNote,
    created_at: c.createdAt.toISOString(), updated_at: c.updatedAt.toISOString(),
    is_overdue: c.status !== "Completed" && c.dueDate ? c.dueDate.toISOString().slice(0,10) < new Date().toISOString().slice(0,10) : false,
  };
}
