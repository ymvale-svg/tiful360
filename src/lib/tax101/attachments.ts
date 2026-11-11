/**
 * Documents the official Form 101 asks the employee to attach, and when.
 * The wording follows the printed form ("מצורף", "חובה לצרף").
 */
import type { Tax101FormData } from "./types";

export interface Tax101Attachment {
  kind: Tax101AttachmentKind;
  /** Original file name, for display only. */
  name: string;
  /** Storage path in the tax-forms-101 bucket: <company>/<form>-att-<ts>-<kind>.<ext> */
  path: string;
  size: number;
  uploaded_at: string;
}

export const TAX101_ATTACHMENT_KINDS = {
  id_copy: { label: "צילום תעודת זהות כולל ספח", section: "חלק ב׳" },
  passport: { label: "צילום דרכון ואישור/רשיון שהייה בישראל", section: "חלק ב׳" },
  separated: { label: "אישור פקיד השומה על מצב פרוד/ה", section: "חלק ב׳" },
  disability: { label: "אישור נכות 100% / עיוורון (משרד הביטחון, האוצר או פקיד השומה)", section: "חלק ח׳ סעיף 2א" },
  disability_comp: { label: "אישור על קבלת תגמול לפי חוק הנכים / נפגעי איבה", section: "חלק ח׳ סעיף 2ב" },
  settlement: { label: "אישור הרשות המקומית על תושבות ביישוב מזכה (טופס 1312א)", section: "חלק ח׳ סעיף 3" },
  immigrant: { label: "תעודת עולה", section: "חלק ח׳ סעיף 4" },
  disabled_child: { label: "אישור גמלת ילד נכה מהמוסד לביטוח לאומי", section: "חלק ח׳ סעיף 11" },
  alimony: { label: "פסק דין לתשלום מזונות", section: "חלק ח׳ סעיף 12" },
  discharge: { label: "תעודת שחרור / סיום שירות לאומי", section: "חלק ח׳ סעיף 14" },
  degree: { label: "הצהרה בטופס 119 על סיום לימודים", section: "חלק ח׳ סעיף 15" },
  reservist: { label: "אישור מצה\"ל על ימי שירות מילואים כלוחם", section: "חלק ח׳ סעיף 16" },
  coordination: { label: "אישור תיאום מס מפקיד השומה", section: "חלק ט׳ סעיף 3" },
  other: { label: "מסמך נוסף", section: "" },
} as const;

export type Tax101AttachmentKind = keyof typeof TAX101_ATTACHMENT_KINDS;

export const TAX101_ATTACHMENT_ACCEPT = "application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp";
export const TAX101_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const TAX101_ATTACHMENT_MAX_FILES = 20;

export interface AttachmentRequirement {
  kind: Tax101AttachmentKind;
  label: string;
  section: string;
  /** Blocks signing until a file of this kind is attached. */
  required: boolean;
}

export interface AttachmentPolicy {
  /** Always ask for an ID copy (the form asks for it on first filling and after changes). */
  require_id_copy?: boolean;
  /** Documents of checked credits must be attached before signing. */
  require_attachments?: boolean;
}

/** Which documents apply to this form, given what the employee filled and checked. */
export function attachmentRequirements(data: Tax101FormData, policy: AttachmentPolicy): AttachmentRequirement[] {
  const strict = policy.require_attachments !== false;
  const tc = data.tax_credits;
  const out: AttachmentRequirement[] = [];
  const need = (kind: Tax101AttachmentKind, when: boolean, required = strict) => {
    if (when) out.push({ kind, ...TAX101_ATTACHMENT_KINDS[kind], required });
  };

  const noId = !data.id_number.trim() && !!data.passport_number.trim();
  need("id_copy", !noId, !!policy.require_id_copy);
  need("passport", noId);
  need("separated", data.marital_status === "separated");
  need("disability", tc.blind_or_disabled);
  need("disability_comp", tc.disability_compensation_recipient);
  need("settlement", tc.settlement_eligible);
  need("immigrant", tc.new_immigrant);
  need("disabled_child", tc.parent_to_disabled_child);
  need("alimony", tc.alimony_to_ex_spouse);
  need("discharge", tc.discharged_soldier);
  need("degree", tc.academic_degree_completed);
  need("reservist", tc.reservist_combat);
  need("coordination", data.tax_coordination.assessor_approval);
  need("other", true, false);
  return out;
}

export function missingRequiredAttachments(reqs: AttachmentRequirement[], files: Tax101Attachment[]): AttachmentRequirement[] {
  const have = new Set(files.map((f) => f.kind));
  return reqs.filter((r) => r.required && !have.has(r.kind));
}

/** Storage path for a new attachment; the original (often Hebrew) file name stays out of the path. */
export function attachmentPath(companyId: string, formId: string, kind: Tax101AttachmentKind, fileName: string, now = Date.now()): string {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(fileName)?.[1] ?? "bin").toLowerCase();
  return `${companyId}/${formId}-att-${now}-${kind}.${ext}`;
}

const KINDS = new Set(Object.keys(TAX101_ATTACHMENT_KINDS));

/** Keeps only well-formed attachment records (drafts and stored rows are untrusted). */
export function sanitizeAttachments(list: unknown, formId: string): Tax101Attachment[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((a): a is Tax101Attachment =>
      !!a && typeof a === "object" &&
      KINDS.has((a as Tax101Attachment).kind) &&
      typeof (a as Tax101Attachment).path === "string" &&
      (a as Tax101Attachment).path.includes(`/${formId}-att-`) &&
      typeof (a as Tax101Attachment).name === "string")
    .slice(0, TAX101_ATTACHMENT_MAX_FILES)
    .map((a) => ({
      kind: a.kind,
      name: a.name.slice(0, 200),
      path: a.path,
      size: typeof a.size === "number" ? a.size : 0,
      uploaded_at: typeof a.uploaded_at === "string" ? a.uploaded_at : "",
    }));
}
