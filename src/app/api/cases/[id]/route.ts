import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser, VALID_CATEGORIES, VALID_PRIORITIES, VALID_STATUSES } from "@/lib/auth";
import { activity } from "@/lib/crm";

const canSeeAll = (role: string) => role === "Admin" || role === "Team Lead";

async function loadCase(id: number) {
  return db.case.findUnique({
    where: { id },
    include: { createdBy: { select: { name: true } }, assignedTo: { select: { name: true, email: true } } },
  });
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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  const c = await loadCase(Number(id));
  if (!c) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!canSeeAll(user.role) && c.assignedToId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ case: serialize(c) });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  const c = await loadCase(Number(id));
  if (!c) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!canSeeAll(user.role) && c.assignedToId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const changed: string[] = [];
  const data: any = {};
  const today = new Date(); today.setHours(0,0,0,0);

  // Text fields
  for (const f of ["title", "category", "description", "next_action"]) {
    if (f in body) {
      const newVal = body[f] ?? null;
      const oldVal = (c as any)[f === "next_action" ? "nextAction" : f] ?? null;
      if (newVal !== oldVal && String(newVal ?? "") !== String(oldVal ?? "")) {
        if (f === "category" && !VALID_CATEGORIES.includes(newVal)) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
        data[f === "next_action" ? "nextAction" : f] = newVal;
        await activity.log(c.id, user.id, "case_updated", `${f.replace("_"," ").replace(/\b\w/g,m=>m.toUpperCase())} updated.`, oldVal, newVal);
        changed.push(f);
      }
    }
  }
  // Date fields
  for (const f of ["due_date", "next_action_date"]) {
    if (f in body) {
      const v = body[f];
      const newVal = v ? new Date(v) : null;
      const oldVal = (c as any)[f === "due_date" ? "dueDate" : "nextActionDate"];
      const changedDate = (!newVal && !oldVal) ? false : (!newVal || !oldVal) ? true : newVal.getTime() !== oldVal.getTime();
      if (changedDate) {
        data[f === "due_date" ? "dueDate" : "nextActionDate"] = newVal;
        await activity.log(c.id, user.id, "case_updated", `${f.replace("_"," ").replace(/\b\w/g,m=>m.toUpperCase())} updated.`, oldVal?.toISOString().slice(0,10) ?? null, newVal?.toISOString().slice(0,10) ?? null);
        changed.push(f);
      }
    }
  }
  // Priority
  if ("priority" in body) {
    const newVal = body.priority;
    if (!VALID_PRIORITIES.includes(newVal)) return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
    if (newVal !== c.priority) {
      data.priority = newVal;
      await activity.log(c.id, user.id, "priority_updated", `Priority changed from ${c.priority} to ${newVal}.`, c.priority, newVal);
      changed.push("priority");
    }
  }
  // Assignment
  if ("assigned_to" in body) {
    const newVal = body.assigned_to ? Number(body.assigned_to) : null;
    const oldVal = c.assignedToId;
    if (newVal !== oldVal) {
      if (newVal !== null) {
        const au = await db.user.findUnique({ where: { id: newVal } });
        if (!au) return NextResponse.json({ error: "Invalid assignee" }, { status: 400 });
      }
      const oldName = c.assignedTo?.name ?? "Unassigned";
      let newName = "Unassigned";
      if (newVal !== null) {
        const u = await db.user.findUnique({ where: { id: newVal } });
        newName = u?.name ?? "Unassigned";
      }
      data.assignedToId = newVal;
      if (newVal !== null) {
        await db.caseAssignment.create({
          data: { caseId: c.id, assignedToId: newVal, assignedById: user.id,
                  note: `Reassigned from ${oldName} to ${newName}` },
        });
      }
      const actionType = oldVal === null ? "case_assigned" : "case_reassigned";
      await activity.log(c.id, user.id, actionType, `Case reassigned from ${oldName} to ${newName}.`, oldName, newName);
      changed.push("assigned_to");
    }
  }
  // Status
  if ("status" in body) {
    const newVal = body.status;
    if (!VALID_STATUSES.includes(newVal)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    const oldVal = c.status;
    if (newVal !== oldVal) {
      const resolutionNote = (body.resolution_note || "").trim();
      if (newVal === "Completed") {
        if (!resolutionNote) return NextResponse.json({ error: "A resolution note is required to mark a case Completed" }, { status: 400 });
        data.status = newVal;
        data.completionDate = today;
        data.resolutionNote = resolutionNote;
        await activity.log(c.id, user.id, "resolution_submitted", "Resolution note submitted. Case closed.", oldVal, newVal);
        await activity.log(c.id, user.id, "status_changed", `Status changed from ${oldVal} to ${newVal}.`, oldVal, newVal);
      } else if (newVal === "Reopened") {
        data.status = newVal;
        data.completionDate = null;
        await activity.log(c.id, user.id, "case_reopened", `Case reopened from ${oldVal}. Prior completion preserved.`, oldVal, newVal);
      } else {
        data.status = newVal;
        await activity.log(c.id, user.id, "status_changed", `Status changed from ${oldVal} to ${newVal}.`, oldVal, newVal);
      }
      changed.push("status");
    }
  }

  if (Object.keys(data).length > 0) {
    await db.case.update({ where: { id: c.id }, data });
  }
  const fresh = await loadCase(c.id);
  return NextResponse.json({ case: serialize(fresh), changed });
}
