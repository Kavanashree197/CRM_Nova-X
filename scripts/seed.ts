// Seed the CRM database with realistic sample data.
// Run:  bun scripts/seed.ts
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";

const TODAY = new Date();
function daysFromNow(n: number): Date {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + n);
  d.setHours(9, 0, 0, 0);
  return d;
}
function daysAgo(n: number): Date { return daysFromNow(-n); }
function iso(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

async function main() {
  // Wipe (order matters for FKs)
  await db.caseAction.deleteMany();
  await db.caseAssignment.deleteMany();
  await db.case.deleteMany();
  await db.user.deleteMany();

  // Users
  const users = await Promise.all([
    db.user.create({ data: { name: "Arjun Mehta",    email: "admin@crm.io",  passwordHash: hashPassword("admin123"),  role: "Admin" } }),
    db.user.create({ data: { name: "Priya Sharma",   email: "lead@crm.io",   passwordHash: hashPassword("lead123"),   role: "Team Lead" } }),
    db.user.create({ data: { name: "Rahul Verma",    email: "rahul@crm.io",  passwordHash: hashPassword("rahul123"),  role: "Resource" } }),
    db.user.create({ data: { name: "Sneha Iyer",     email: "sneha@crm.io",  passwordHash: hashPassword("sneha123"),   role: "Resource" } }),
    db.user.create({ data: { name: "Vikram Nair",    email: "vikram@crm.io", passwordHash: hashPassword("vikram123"), role: "Resource" } }),
    db.user.create({ data: { name: "Anita Desai",    email: "anita@crm.io",  passwordHash: hashPassword("anita123"),   role: "Resource" } }),
  ]);
  const [admin, lead, rahul, sneha, vikram, anita] = users;
  const resources = [rahul, sneha, vikram, anita];
  const resByIdx = (i: number) => resources[i];

  // Case plan: title, category, priority, status, resIdx, dueOffset, naOffset, createdDaysAgo, description
  const plan: [string, string, string, string, number, number, number, number, string][] = [
    ["Invoice not reflecting GST discount",        "Billing",            "High",     "Active",    0, -3, 1, 1, "Customer reports the GST line item on the Sept invoice is double-counted after the manual discount."],
    ["Cannot reset password - email never arrives","Account Access",     "Critical", "Active",    1, -1, 0, 2, "User triggered reset 4 times, no email received. Confirmed not in spam."],
    ["Slack integration webhook failing",          "Technical Support",  "High",     "Pending",   2,  2, 3, 3, "Webhook returns 403 after the workspace token was rotated."],
    ["Bulk import of 5k contacts throws timeout",  "Data Migration",     "High",     "Active",    3, -5, 1, 4, "CSV upload via the admin console times out at 60s for files > 2k rows."],
    ["Request: dark mode for the reports page",    "Feature Request",    "Low",      "New",       0,  7, 2, 0, "Customer success team asking if dark mode can be added to the reports module."],
    ["Duplicate charge on card ending 4421",        "Billing",            "Critical", "Active",    1, -2, 0, 1, "Card charged twice within 90 seconds during a checkout retry storm."],
    ["SSO login loops back to login page",         "Account Access",     "High",     "Pending",   2,  4, 5, 5, "SAML response looks valid but the session cookie is not being set on the redirect."],
    ["Onboarding checklist for Acme Corp",         "Onboarding",         "Medium",   "Active",    3,  5, 2, 2, "Provision workspace, seed demo data, schedule kickoff call."],
    ["Bug: date picker shows wrong weekday",        "Bug Report",         "Medium",   "Active",    0,  3, 2, 3, "Date picker is off by one weekday for users in UTC-5 after DST change."],
    ["GDPR data export request - ticket #4471",    "Compliance",         "High",     "Active",    1,  6, 1, 4, "Subject access request; 30-day window. Need to export profile, billing and activity logs."],
    ["Mobile app crashes on profile screen",        "Bug Report",         "Critical", "Active",   2, -1, 0, 2, "Crash log points to nil pointer in avatar rendering. Affects iOS 17.4 only."],
    ["Upgrade plan from Pro to Enterprise",        "Billing",            "Medium",   "Pending",   3,  8, 4, 5, "Customer wants prorated upgrade; needs contract amendment sent for signature."],
    ["Cannot download quarterly PDF report",       "Technical Support",  "Medium",   "Active",    0,  1, 1, 3, "Export button spins forever; network tab shows a 502 from the report service."],
    ["Forgot security question answers",            "Account Access",     "Low",      "New",       1, 10, 3, 0, "User locked out of the secondary verification step; needs identity verification call."],
    ["Migrate 3 years of tickets from Zendesk",     "Data Migration",     "High",     "Active",    2,  9, 2, 6, "Scope: 18k tickets, attachments excluded. Target completion in 2 weeks."],
    ["Reported: automated email contains typo",     "Bug Report",         "Low",      "Completed", 3,  6, 0, 13, "Welcome email said 'acount' instead of 'account'. Fixed in template v2.3."],
    ["Renewal questions before Dec renewal",         "Billing",            "Medium",   "Completed", 0,  2, 0, 22, "Answered pricing questions; customer renewed for 12 months."],
    ["Old ticket: refund never received - reopen",  "Billing",            "High",     "Reopened",  1, -7, 1, 20, "Customer says the refund promised 2 weeks ago never hit their bank account."],
  ];

  const resName = (uid: number | null) => users.find(u => u.id === uid)?.name ?? "Unassigned";

  for (let i = 0; i < plan.length; i++) {
    const [title, category, priority, status, resIdx, dueOff, naOff, createdOff, desc] = plan[i];
    const assignee = resByIdx(resIdx);
    const dueDate = daysFromNow(dueOff);
    const naDate = daysFromNow(naOff);
    const createdAt = daysAgo(createdOff);
    let completionDate: Date | null = null;
    let resolutionNote: string | null = null;
    if (status === "Completed") {
      completionDate = new Date(createdAt); completionDate.setDate(completionDate.getDate() + 6);
      resolutionNote = title.includes("Renewal")
        ? "Answered all renewal pricing questions over a call; customer signed a 12-month renewal."
        : "Typo fixed in email template v2.3 and redeployed; verified by sending a test welcome email.";
    }
    const caseCode = `CASE-${String(i + 1).padStart(3, "0")}`;
    const c = await db.case.create({
      data: {
        caseCode, title, category, description: desc, priority, status,
        createdById: admin.id, assignedToId: assignee.id,
        dueDate, nextActionDate: naDate,
        nextAction: "Follow up with customer and verify fix.",
        completionDate, resolutionNote,
        createdAt, updatedAt: createdAt,
      },
    });

    // Initial assignment record
    await db.caseAssignment.create({
      data: { caseId: c.id, assignedToId: assignee.id, assignedById: admin.id,
              assignedAt: createdAt, note: "Initial assignment at case creation" },
    });

    // Action log (spread across the case's life for realistic charts)
    const act = (userId: number, type: string, desc2: string, prev: string | null, newV: string | null, at: Date) =>
      db.caseAction.create({ data: { caseId: c.id, userId, actionType: type, description: desc2,
        previousValue: prev, newValue: newV, createdAt: at } });

    await act(admin.id, "case_created", `Case ${caseCode} created and assigned to ${assignee.name}.`, null, status, createdAt);
    if (["Active", "Pending", "Completed", "Reopened"].includes(status)) {
      const t = new Date(createdAt); t.setHours(11, 30, 0, 0);
      await act(assignee.id, "status_changed", `Status changed from New to ${status}.`, "New", status, t);
    }
    if (status === "Completed" && completionDate) {
      const t = new Date(createdAt); t.setDate(t.getDate() + 3); t.setHours(14, 0, 0, 0);
      await act(assignee.id, "comment_added", "Reviewed root cause with the customer over a call.", null, null, t);
      const tc = new Date(completionDate); tc.setHours(16, 0, 0, 0);
      await act(assignee.id, "resolution_submitted", "Resolution note submitted and case marked Completed.", null, "Completed", tc);
    }
    if (status === "Reopened") {
      const t = new Date(createdAt); t.setDate(t.getDate() + 3); t.setHours(14, 0, 0, 0);
      await act(assignee.id, "comment_added", "Customer reports the refund never hit their account.", null, null, t);
      const tr = daysAgo(2); tr.setHours(10, 0, 0, 0);
      await act(assignee.id, "case_reopened", "Case reopened by resource; prior completion preserved.", "Completed", "Reopened", tr);
    }
    if (["Active", "Pending"].includes(status)) {
      const comments = [
        "Reached out to customer for additional logs and a screen recording.",
        "Confirmed the issue reproduces in the staging environment.",
        "Escalated to the engineering on-call for a second opinion.",
        "Awaiting customer reply with the affected account ID.",
        "Pinged the customer success manager to coordinate a call.",
        "Reviewed the latest logs; no obvious error spike found yet.",
      ];
      const t = new Date(createdAt); t.setDate(t.getDate() - Math.max(0, createdOff - 1)); t.setHours(15, 0, 0, 0);
      if (t > TODAY) t.setTime(TODAY.getTime() - 86400000);
      await act(assignee.id, "comment_added", comments[i % comments.length], null, null, t);
    }
  }

  const counts = {
    users: await db.user.count(),
    cases: await db.case.count(),
    actions: await db.caseAction.count(),
    assignments: await db.caseAssignment.count(),
  };
  console.log("[seed] done:", counts);
  console.log("[seed] login: admin@crm.io / admin123  (lead@crm.io / lead123, *_@crm.io / *123)");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await db.$disconnect(); });
