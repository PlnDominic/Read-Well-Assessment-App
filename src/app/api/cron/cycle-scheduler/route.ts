import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateDueCycle } from "@/lib/cycles";
import { appUrl, escapeHtml, sendEmail } from "@/lib/email";

// How many days before a cycle's end date its reminder email goes out.
// Fixed rather than a per-school setting, same tradeoff as
// FLAGGED_SCORE_THRESHOLD in lib/theme.ts: one sensible default beats a
// speculative setting nobody's asked to configure yet.
const REMINDER_DAYS_BEFORE_END = 3;

/**
 * Daily: (1) activates any cycle whose scheduled start date has arrived
 * (see lib/cycles.ts -- the same reconciliation the Cycles page runs on
 * load, so this cron is the fallback for schools nobody happens to visit
 * that day) and notifies that school's admins, then (2) for any current
 * cycle ending in exactly REMINDER_DAYS_BEFORE_END days, reminds each
 * teacher who still has students without a completed assessment.
 *
 * Configured as a Vercel Cron Job in vercel.json; see
 * purge-expired-data/route.ts for the CRON_SECRET auth this mirrors.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: schools, error: schoolsError } = await admin.from("schools").select("id");
  if (schoolsError) return NextResponse.json({ error: schoolsError.message }, { status: 500 });

  let activatedCount = 0;
  for (const school of schools ?? []) {
    const { activated } = await activateDueCycle(admin, school.id);
    if (!activated) continue;
    activatedCount++;

    const { data: admins } = await admin
      .from("profiles")
      .select("id, name, email")
      .eq("school_id", school.id)
      .eq("role", "administrator");
    for (const a of admins ?? []) {
      await admin.from("notifications").insert({
        recipient_id: a.id,
        type: "cycle_started",
        message: `${activated.name} has started.`,
        link: "/admin/cycles",
      });
      if (a.email) {
        await sendEmail({
          to: a.email,
          subject: `${activated.name} has started`,
          html: `<p>Hi ${escapeHtml(a.name)},</p><p><a href="${appUrl("/admin/cycles")}">${escapeHtml(
            activated.name
          )}</a> is now the active assessment cycle.</p>`,
        });
      }
    }
  }

  const reminderDate = new Date();
  reminderDate.setDate(reminderDate.getDate() + REMINDER_DAYS_BEFORE_END);
  const reminderDateStr = reminderDate.toISOString().slice(0, 10);

  const { data: endingCycles, error: endingError } = await admin
    .from("assessment_cycles")
    .select("id, name, school_id")
    .eq("is_current", true)
    .eq("ends_at", reminderDateStr);
  if (endingError) return NextResponse.json({ error: endingError.message }, { status: 500 });

  let remindersSent = 0;
  for (const cycle of endingCycles ?? []) {
    const { data: students } = await admin
      .from("students")
      .select("id, teacher_id")
      .eq("school_id", cycle.school_id);
    const studentIds = (students ?? []).map((s) => s.id);
    if (studentIds.length === 0) continue;

    const { data: sessions } = await admin
      .from("assessment_sessions")
      .select("student_id, status")
      .eq("cycle_id", cycle.id)
      .in("student_id", studentIds);
    const completedIds = new Set((sessions ?? []).filter((s) => s.status === "completed").map((s) => s.student_id));

    const incompleteByTeacher = new Map<string, number>();
    for (const s of students ?? []) {
      if (!completedIds.has(s.id)) {
        incompleteByTeacher.set(s.teacher_id, (incompleteByTeacher.get(s.teacher_id) ?? 0) + 1);
      }
    }
    if (incompleteByTeacher.size === 0) continue;

    const { data: teachers } = await admin
      .from("profiles")
      .select("id, name, email")
      .in("id", [...incompleteByTeacher.keys()]);

    for (const teacher of teachers ?? []) {
      const count = incompleteByTeacher.get(teacher.id) ?? 0;
      const message = `${cycle.name} ends in ${REMINDER_DAYS_BEFORE_END} days -- ${count} student${
        count === 1 ? "" : "s"
      } still need${count === 1 ? "s" : ""} to complete their assessment.`;

      await admin.from("notifications").insert({
        recipient_id: teacher.id,
        type: "cycle_ending_reminder",
        message,
        link: "/teacher",
      });
      remindersSent++;

      if (teacher.email) {
        await sendEmail({
          to: teacher.email,
          subject: `${cycle.name} ends soon`,
          html: `<p>Hi ${escapeHtml(teacher.name)},</p><p>${escapeHtml(message)}</p><p><a href="${appUrl(
            "/teacher"
          )}">View your class</a></p>`,
        });
      }
    }
  }

  return NextResponse.json({ ok: true, activatedCount, remindersSent });
}
