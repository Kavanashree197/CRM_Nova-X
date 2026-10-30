import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser, hashPassword, publicUser } from "@/lib/auth";

export async function GET(req: Request) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const users = await db.user.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ users: users.map(u => ({ user_id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, created_at: u.createdAt.toISOString().slice(0,10) })) });
}

export async function POST(req: Request) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (me.role !== "Admin") return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const name = (body.name || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const role = (body.role || "Resource").trim();
  const password = body.password || "";
  if (!name || !email || !password) return NextResponse.json({ error: "name, email, password required" }, { status: 400 });
  if (!["Admin", "Team Lead", "Resource"].includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  const u = await db.user.create({ data: { name, email, role, passwordHash: hashPassword(password) } });
  return NextResponse.json({ user: publicUser(u) }, { status: 201 });
}
