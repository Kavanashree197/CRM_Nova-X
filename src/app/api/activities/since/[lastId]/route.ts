import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";

// Lightweight poll: actions with id > lastId, oldest first.
export async function GET(req: Request, { params }: { params: Promise<{ lastId: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { lastId } = await params;
  const since = Number(lastId) || 0;
  const where: any = { id: { gt: since } };
  if (user.role === "Resource") {
    const myCaseIds = await db.case.findMany({ where: { assignedToId: user.id }, select: { id: true } });
    where.caseId = { in: myCaseIds.map(c => c.id) };
  }
  const rows = await db.caseAction.findMany({
    where,
    include: { user: { select: { name: true } }, case: { select: { caseCode: true, title: true } } },
    orderBy: { id: "asc" },
    take: 200,
  });
  return NextResponse.json({
    activities: rows.map(a => ({
      action_id: a.id, case_id: a.caseId, user_id: a.userId, action_type: a.actionType,
      description: a.description, previous_value: a.previousValue, new_value: a.newValue,
      created_at: a.createdAt.toISOString(), user_name: a.user?.name,
      case_code: a.case?.caseCode, case_title: a.case?.title,
    })),
    latest_id: rows.length ? rows[rows.length - 1].id : since,
  });
}
