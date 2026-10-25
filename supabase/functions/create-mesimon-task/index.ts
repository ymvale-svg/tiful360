// Turns a service ticket into a task in Mesimon (the task-management system).
// Mesimon files it under the operations department, in a project named after the
// ticket subject (created with the subject's first ticket), and closes the ticket
// back through it-api (which emails the opener) when the task is completed.
//
// Actions: "status" (is the connection available for this ticket's company), "options"
// (projects, users and file limits for the dialog, with its defaults), "create".
// Defaults: the subject's project, the sender as assignee (by email), due two business
// days after sending — each can be overridden in the dialog, and files can be attached.
// Only operations staff may call it. Secrets: MESIMON_URL, MESIMON_API_KEY, and
// MESIMON_COMPANY_IDS — the companies whose tickets may reach Mesimon, so another
// tenant's tickets never land in this organisation's task system.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { markTicketInProgress } from "../_shared/ticket-handling-status.ts";

const APP_BASE = "https://tiful360.com";
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUBJECT_LABELS: Record<string, string> = {
  computing: "מיחשוב",
  peripherals: "ציוד היקפי",
  furniture: "ריהוט משרדי",
  software: "תוכנות",
  priority: "פריוריטי",
  other: "אחר",
  offboarding: "ניתוקים / סיום העסקה",
  onboarding: "קליטת עובד",
};

const DUE_BUSINESS_DAYS = 2;
const MAX_FILES = 5;
// Files travel base64-encoded inside the JSON body; keep the whole request reasonable
const MAX_FILES_BASE64 = 28 * 1024 * 1024;

// Today's calendar day in Israel (Mesimon due dates are dates, not times)
const israelToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());

/** `days` business days after `from` (YYYY-MM-DD): Sunday–Thursday, skipping company holidays. */
function addBusinessDays(from: string, days: number, holidays: Set<string>) {
  const d = new Date(`${from}T00:00:00Z`);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const ymd = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 5 && d.getUTCDay() !== 6 && !holidays.has(ymd)) left--;
  }
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const authClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await authClient.auth.getClaims(auth.replace("Bearer ", ""));
    const uid = claims?.claims?.sub;
    if (!uid) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "create";
    const ticket_id = typeof body.ticket_id === "string" ? body.ticket_id : "";
    if (!ticket_id) return json({ error: "ticket_id required" }, 400);

    // RLS decides visibility; the role check limits the action to operations staff
    const { data: visible } = await authClient.from("it_tickets").select("id").eq("id", ticket_id).maybeSingle();
    if (!visible) return json({ error: "Forbidden" }, 403);
    const [{ data: ops }, { data: sa }] = await Promise.all([
      authClient.rpc("is_ops_staff", { _user_id: uid }),
      authClient.rpc("is_super_admin", { _user_id: uid }),
    ]);
    if (!ops && !sa) return json({ error: "Forbidden" }, 403);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: t } = await admin
      .from("it_tickets")
      .select("id, company_id, ticket_code, title, description, subject_category, ticket_type, priority, sla_deadline, location, contact_phone, mesimon_task_id, mesimon_task_url, employees(full_name)")
      .eq("id", ticket_id)
      .single();
    if (!t) return json({ error: "not found" }, 404);

    // Accept either the site address or the full endpoint address — keep only the origin
    const base = (Deno.env.get("MESIMON_URL") ?? "").trim().replace(/\/api(\/.*)?$/, "").replace(/\/+$/, "");
    const key = (Deno.env.get("MESIMON_API_KEY") ?? "").trim();
    const companies = (Deno.env.get("MESIMON_COMPANY_IDS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const available = !!base && !!key && companies.includes(t.company_id);

    if (action === "status") {
      return json({ available, task_id: t.mesimon_task_id, task_url: t.mesimon_task_url });
    }
    if (!available) return json({ error: "החיבור למשימון אינו מוגדר עבור החברה" }, 400);

    // Errors are worded for the person who clicked: what failed and who can fix it
    const mesimon = async (path: string, init: RequestInit = {}, timeoutMs = 20000) => {
      let res: Response;
      try {
        res = await fetch(`${base}/api/integrations/tiful360${path}`, {
          ...init,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new Error("משימון אינו זמין כרגע — נסו שוב בעוד כמה דקות");
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      console.error("mesimon responded", res.status, data?.error);
      if (res.status === 401) {
        throw new Error(`משימון דחה את מפתח החיבור (${data?.error ?? "401"}) — MESIMON_API_KEY חייב להיות זהה ל-TIFUL360_INBOUND_KEY במשימון`);
      }
      if (res.status === 404) throw new Error("כתובת משימון שגויה — יש לבדוק את MESIMON_URL");
      if (res.status >= 500) throw new Error("משימון החזיר שגיאה — נסו שוב בעוד כמה דקות");
      throw new Error(data?.error ?? `משימון החזיר שגיאה ${res.status}`);
    };

    const subject = t.subject_category ?? t.ticket_type;
    // Mesimon files each subject under its own project, named by this label
    const subjectLabel = SUBJECT_LABELS[subject] ?? "אחר";
    // The sender is the default assignee — matched in Mesimon by email
    const senderEmail = String(claims?.claims?.email ?? "").trim();
    const today = israelToday();
    // Start Mesimon's options call right away so it runs alongside the holiday lookup
    const optionsPromise = action === "options"
      ? mesimon(`/options?subjectLabel=${encodeURIComponent(subjectLabel)}`)
      : null;
    optionsPromise?.catch(() => {});
    const { data: holidayRows } = await admin
      .from("company_holidays")
      .select("holiday_date")
      .eq("company_id", t.company_id)
      .gte("holiday_date", today);
    const holidays = new Set((holidayRows ?? []).map((h: { holiday_date: string }) => String(h.holiday_date).slice(0, 10)));
    const defaultDueDate = addBusinessDays(today, DUE_BUSINESS_DAYS, holidays);

    if (optionsPromise) {
      const options = await optionsPromise;
      return json({ ...options, defaultDueDate, defaultAssigneeEmail: senderEmail });
    }
    if (action !== "create") return json({ error: "unknown action" }, 400);

    if (t.mesimon_task_id) {
      await markTicketInProgress(admin, t.id, "mesimon");
      return json({ ok: true, existing: true, task_id: t.mesimon_task_id, task_url: t.mesimon_task_url });
    }

    const { data: prof } = await admin.from("profiles").select("display_name").eq("id", uid).maybeSingle();
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.due_date ?? "")) ? String(body.due_date) : defaultDueDate;
    const assigneeId = Number(body.assignee_id) > 0 ? Number(body.assignee_id) : null;
    const projectId = Number(body.project_id) > 0 ? Number(body.project_id) : null;

    // Type and size rules are Mesimon's (same as a regular upload); here only the shape and total
    const files = Array.isArray(body.files) ? body.files : [];
    if (files.length > MAX_FILES) return json({ error: `ניתן לצרף עד ${MAX_FILES} קבצים` }, 400);
    const cleanFiles = files.map((f: { name?: unknown; mime?: unknown; data?: unknown }) => ({
      name: String(f?.name ?? "").slice(0, 200),
      mime: String(f?.mime ?? "").slice(0, 100),
      data: String(f?.data ?? ""),
    }));
    if (cleanFiles.some((f: { name: string; data: string }) => !f.name || !f.data)) return json({ error: "אחד הקבצים ריק" }, 400);
    if (cleanFiles.reduce((n: number, f: { data: string }) => n + f.data.length, 0) > MAX_FILES_BASE64) {
      return json({ error: "הקבצים גדולים מדי — עד 20MB בסך הכול" }, 400);
    }

    const created = await mesimon("/tasks", {
      method: "POST",
      body: JSON.stringify({
        ticketCode: t.ticket_code,
        // Mesimon also accepts the call number under this name
        callNumber: t.ticket_code,
        title: t.title,
        description: t.description ?? "",
        subject,
        subjectLabel,
        projectId,
        priority: t.priority,
        dueDate,
        employeeName: (t as { employees?: { full_name?: string } | null }).employees?.full_name ?? "",
        location: t.location ?? "",
        contactPhone: t.contact_phone ?? "",
        openedBy: prof?.display_name ?? "",
        note: String(body.note ?? "").slice(0, 2000),
        assigneeId,
        // "ללא אחראי" in the dialog — don't fall back to the sender
        assigneeEmail: body.unassigned ? "" : senderEmail,
        files: cleanFiles,
        ticketUrl: `${APP_BASE}/it-tickets?ticket=${encodeURIComponent(t.ticket_code)}`,
      }),
    }, 60000);

    const task_id = String(created.taskId);
    const task_url = created.url ?? null;
    const now = new Date().toISOString();
    // The ticket's SLA follows the due date set in Mesimon (end of that day, Israel time)
    const mesimonDue = String(created.dueDate ?? created.due_date ?? dueDate ?? "").slice(0, 10);
    let slaDeadline: string | null = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(mesimonDue)) {
      const probe = new Date(`${mesimonDue}T12:00:00Z`);
      const tzName = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", timeZoneName: "shortOffset" })
        .formatToParts(probe).find((p) => p.type === "timeZoneName")?.value ?? "GMT+2";
      const hours = Number(tzName.replace("GMT", "")) || 2;
      slaDeadline = new Date(Date.parse(`${mesimonDue}T23:59:00Z`) - hours * 3600_000).toISOString();
    }
    const { error: linkError } = await admin
      .from("it_tickets")
      .update({
        mesimon_task_id: task_id, mesimon_task_url: task_url, mesimon_sent_at: now, mesimon_sent_by: uid, updated_at: now,
        ...(slaDeadline ? { sla_deadline: slaDeadline } : {}),
      })
      .eq("id", t.id);
    if (linkError) throw new Error(linkError.message);
    await markTicketInProgress(admin, t.id, "mesimon");
    await admin.from("activity_log").insert({
      company_id: t.company_id,
      performed_by: uid,
      action: "העברת קריאה למשימון",
      entity_type: "it_tickets",
      entity_id: t.id,
      details: `קריאה ${t.ticket_code} הועברה למשימון כמשימה ${task_id}${cleanFiles.length ? ` עם ${cleanFiles.length} קבצים` : ""}`,
    });

    return json({ ok: true, existing: !!created.existing, task_id, task_url, due_date: dueDate, assigned: created.assigned !== false, assignee_email: senderEmail });
  } catch (e) {
    return json({ error: (e as Error).message ?? "server error" }, 500);
  }
});
