import { NextResponse } from "next/server";
import { getUser, publicUser } from "@/lib/auth";

export async function GET(req: Request) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  return NextResponse.json({ user: publicUser(user) });
}
