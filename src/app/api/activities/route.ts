import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";

export async function GET(req: Request) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 500);
  const offset = Number(url.searchParams.get("offset") || 0);
  const caseId = url.searchParams.get("case_id");
  const userId = url.searchParams.get("user_id");
  const actionType = url.searchParams.get("action_type");

  const where: any = {};
  if (caseId) where.caseId = Number(caseId);
  if (userId) where.userId = Number(userId);
  if (actionType) where.actionType = actionType;
  if (user.role === "Resource") {
    const myCaseIds = await db.case.findMany({ where: { assignedToId: user.id }, select: { id: true } });
    where.caseId = { in: myCaseIds.map(c => c.id) };
  }

  const rows = await db.caseAction.findMany({
    where,
    include: { user: { select: { name: true } }, case: { select: { caseCode: true, title: true } } },
    orderBy: [{ id: "desc" }],
    take: limit, skip: offset,
  });
  return NextResponse.json({
    activities: rows.map(a => ({
      action_id: a.id, case_id: a.caseId, user_id: a.userId, action_type: a.actionType,
      description: a.description, previous_value: a.previousValue, new_value: a.newValue,
      created_at: a.createdAt.toISOString(), user_name: a.user?.name,
      case_code: a.case?.caseCode, case_title: a.case?.title,
    })),
    count: rows.length,
  });
}
