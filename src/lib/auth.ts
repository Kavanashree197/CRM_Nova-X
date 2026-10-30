// Tiny auth helpers: password hashing (scrypt) + signed token (HMAC).
// No external deps — uses Node's built-in crypto. Keeps the POC student-friendly.
import crypto from "crypto";

const SECRET = process.env.CRM_SECRET || "crm-poc-secret-change-me";

// --- Password hashing (scrypt) ---------------------------------------------
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(test, "hex"), Buffer.from(hash, "hex"));
}

// --- Signed token (base64url payload . HMAC) --------------------------------
export function makeToken(payload: { uid: number; role: string }): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readToken(token: string): { uid: number; role: string } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// --- Request helper: extract the current user from the Authorization header --
import { db } from "./db";

export async function getUser(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const payload = readToken(auth.slice(7));
  if (!payload) return null;
  const user = await db.user.findUnique({ where: { id: payload.uid } });
  if (!user || !user.active) return null;
  return user;
}

export function publicUser(u: any) {
  if (!u) return null;
  return {
    user_id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    created_at: u.createdAt?.toISOString?.() ?? String(u.createdAt),
  };
}

// Domain constants — shared across routes and seed
export const VALID_STATUSES = ["New", "Active", "Pending", "Completed", "Reopened"];
export const VALID_PRIORITIES = ["Low", "Medium", "High", "Critical"];
export const VALID_CATEGORIES = [
  "Billing", "Technical Support", "Account Access", "Onboarding",
  "Feature Request", "Bug Report", "Data Migration", "Compliance",
];
