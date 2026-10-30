import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";

const canSeeAll = (role: string) => role === "Admin" || role === "Team Lead";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  const cid = Number(id);
  const c = await db.case.findUnique({
    where: { id: cid },
    include: { createdBy: { select: { name: true } }, assignedTo: { select: { name: true, email: true } } },
  });
  if (!c) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!canSeeAll(user.role) && c.assignedToId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const assignments = await db.caseAssignment.findMany({
    where: { caseId: cid },
    include: { assignedTo: { select: { name: true } }, assignedBy: { select: { name: true } } },
    orderBy: { assignedAt: "asc" },
  });
  const actions = await db.caseAction.findMany({
    where: { caseId: cid },
    include: { user: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const ser = (c: any) => ({
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
  });

  return NextResponse.json({
    case: ser(c),
    assignments: assignments.map(a => ({
      assignment_id: a.id, case_id: a.caseId, assigned_to: a.assignedToId,
      assigned_to_name: a.assignedTo?.name, assigned_by: a.assignedById,
      assigned_by_name: a.assignedBy?.name,
      assigned_at: a.assignedAt.toISOString(), note: a.note,
    })),
    actions: actions.map(a => ({
      action_id: a.id, case_id: a.caseId, user_id: a.userId, action_type: a.actionType,
      description: a.description, previous_value: a.previousValue, new_value: a.newValue,
      created_at: a.createdAt.toISOString(), user_name: a.user?.name,
    })),
    summary: { assignments_count: assignments.length, actions_count: actions.length },
  });
}
