import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { makeToken, verifyPassword, publicUser } from "@/lib/auth";

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!email || !password) return NextResponse.json({ error: "Email and password are required" }, { status: 400 });

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  if (!verifyPassword(password, user.passwordHash)) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

  const token = makeToken({ uid: user.id, role: user.role });
  return NextResponse.json({ token, user: publicUser(user) });
}
