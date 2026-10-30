import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { activity } from "@/lib/crm";

const canSeeAll = (role: string) => role === "Admin" || role === "Team Lead";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  const cid = Number(id);
  const c = await db.case.findUnique({ where: { id: cid } });
  if (!c) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!canSeeAll(user.role) && c.assignedToId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const actionType = (body.action_type || "comment_added").trim();
  const description = (body.description || "").trim();
  const previousValue = body.previous_value ?? null;
  const newValue = body.new_value ?? null;
  if (!description) return NextResponse.json({ error: "Description is required" }, { status: 400 });

  const nextActionDate = body.next_action_date ? new Date(body.next_action_date) : null;
  const nextAction = (body.next_action || "").trim() || null;
  if (nextActionDate || nextAction) {
    await db.case.update({ where: { id: cid }, data: { nextActionDate, nextAction } });
    await activity.log(cid, user.id, "next_action_scheduled",
      `Next action scheduled: ${nextAction || "(date only)"} for ${nextActionDate ? nextActionDate.toISOString().slice(0,10) : "N/A"}.`,
      null, nextActionDate ? nextActionDate.toISOString().slice(0,10) : nextAction);
  }

  const a = await activity.log(cid, user.id, actionType, description, previousValue, newValue);
  await db.case.update({ where: { id: cid }, data: { updatedAt: new Date() } });
  return NextResponse.json({ action_id: a.id }, { status: 201 });
}
