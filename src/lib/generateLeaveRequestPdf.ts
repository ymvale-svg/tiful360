import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";

const TYPE_LABELS: Record<string, string> = {
  vacation: "חופשה",
  sick: "מחלה",
  personal: "יום אישי",
  other: "אחר",
};

interface BuildArgs {
  request: {
    id: string;
    request_type: string;
    start_date: string;
    end_date: string;
    total_days: number;
    reason: string | null;
    reviewed_at: string | null;
    manager_note: string | null;
  };
  employee: { full_name: string; id_number: string; employee_code: string; department: string; role: string };
  manager: { full_name: string } | null;
  company: { name: string };
}

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB").replaceAll("/", "-") : "—");

/**
 * Builds a signed-approval PDF (Hebrew/RTL) and uploads it to leave-documents bucket.
 * Returns the storage path (used to create signed URL when emailing).
 */
export async function generateAndUploadLeavePdf(args: BuildArgs, employeeId: string): Promise<string> {
  const { request, employee, manager, company } = args;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // jsPDF base RTL is limited. We construct lines and render right-aligned.
  const pageW = pdf.internal.pageSize.getWidth();
  const right = pageW - 15; // right margin (RTL)
  let y = 20;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(company.name, right, y, { align: "right" });
  y += 8;
  pdf.setFontSize(13);
  pdf.text("אישור בקשת חופשה / מחלה", right, y, { align: "right" });
  y += 10;

  pdf.setDrawColor(200);
  pdf.line(15, y, right, y);
  y += 8;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);

  const rows: Array<[string, string]> = [
    ["שם העובד", employee.full_name],
    ["תעודת זהות", employee.id_number],
    ["מספר עובד", employee.employee_code],
    ["מחלקה / תפקיד", `${employee.department} / ${employee.role}`],
    ["סוג בקשה", TYPE_LABELS[request.request_type] ?? request.request_type],
    [
      "תאריכים",
      request.start_date === request.end_date
        ? fmt(request.start_date)
        : `${fmt(request.start_date)} - ${fmt(request.end_date)}`,
    ],
    ["מספר ימים", String(request.total_days)],
    ["סיבה / הערות", request.reason ?? "—"],
  ];

  rows.forEach(([k, v]) => {
    pdf.setFont("helvetica", "bold");
    pdf.text(`${k}:`, right, y, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.text(String(v), right - 45, y, { align: "right" });
    y += 7;
  });

  y += 6;
  pdf.line(15, y, right, y);
  y += 10;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text("סטטוס: מאושר ✓", right, y, { align: "right" });
  y += 8;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(`אושר ע"י: ${manager?.full_name ?? "מנהל מערכת"}`, right, y, { align: "right" });
  y += 7;
  pdf.text(`תאריך אישור: ${fmt(request.reviewed_at)}`, right, y, { align: "right" });
  y += 10;
  if (request.manager_note) {
    pdf.text(`הערת מנהל: ${request.manager_note}`, right, y, { align: "right" });
    y += 7;
  }

  y += 20;
  pdf.line(right - 60, y, right, y);
  y += 5;
  pdf.setFontSize(10);
  pdf.text("חתימת מנהל מאשר", right - 30, y, { align: "center" });

  const blob = pdf.output("blob");
  const path = `${employeeId}/${request.id}.pdf`;
  const { error } = await supabase.storage
    .from("leave-documents")
    .upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (error) throw error;

  const { data } = await supabase.storage
    .from("leave-documents")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  return data?.signedUrl ?? path;
}
