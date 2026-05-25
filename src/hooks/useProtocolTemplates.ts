import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ProtocolType =
  | "physical"
  | "virtual"
  | "vehicle"
  | "training"
  | "return_physical"
  | "return_virtual";

export interface ProtocolTemplate {
  id: string;
  company_id: string | null;
  category_id: string | null;
  protocol_type: ProtocolType;
  display_name: string;
  body_template: string;
  requires_employee_sig: boolean;
  requires_issuer_sig: boolean;
  validity_days: number | null;
}

export const PROTOCOL_TYPES: { type: ProtocolType; label: string }[] = [
  { type: "physical", label: "מסירת ציוד פיזי" },
  { type: "virtual", label: "מסירת גישה דיגיטלית והסכם סודיות" },
  { type: "vehicle", label: "מסירת רכב חברה" },
  { type: "training", label: "אישור ביצוע הדרכה" },
  { type: "return_physical", label: "החזרת ציוד פיזי" },
  { type: "return_virtual", label: "ניתוק גישה דיגיטלית" },
];

/** Map asset_categories.protocol_type (domain) → document_protocols.protocol_type */
export function deriveProtocolTypeFromCategory(
  categoryProtocolType: string | null | undefined
): ProtocolType {
  switch (categoryProtocolType) {
    case "digital":
      return "virtual";
    case "vehicle":
      return "vehicle";
    case "training":
      return "training";
    case "physical":
    case "insurance":
    case "real_estate":
    default:
      return "physical";
  }
}

/** Fetch all templates visible to the user (global + company). */
export function useProtocolTemplates(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["protocol-templates", companyId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_protocols")
        .select("*")
        .or(
          companyId
            ? `company_id.is.null,company_id.eq.${companyId}`
            : "company_id.is.null"
        );
      if (error) throw error;
      return (data ?? []) as ProtocolTemplate[];
    },
    enabled: companyId !== undefined,
  });
}

/** Resolve effective template for a given (type, category) using priority:
 *  company+category → company-default → global-default. */
export function resolveTemplate(
  templates: ProtocolTemplate[],
  protocolType: ProtocolType,
  companyId: string | null,
  categoryId: string | null
): ProtocolTemplate | null {
  if (companyId && categoryId) {
    const hit = templates.find(
      (t) =>
        t.company_id === companyId &&
        t.protocol_type === protocolType &&
        t.category_id === categoryId
    );
    if (hit) return hit;
  }
  if (companyId) {
    const hit = templates.find(
      (t) =>
        t.company_id === companyId &&
        t.protocol_type === protocolType &&
        t.category_id === null
    );
    if (hit) return hit;
  }
  return (
    templates.find(
      (t) =>
        t.company_id === null &&
        t.protocol_type === protocolType &&
        t.category_id === null
    ) ?? null
  );
}

export function useUpsertProtocolTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      company_id: string;
      category_id: string | null;
      protocol_type: ProtocolType;
      display_name: string;
      body_template: string;
      requires_issuer_sig: boolean;
      validity_days: number | null;
    }) => {
      const { error } = await supabase.from("document_protocols").upsert(
        {
          company_id: input.company_id,
          category_id: input.category_id,
          protocol_type: input.protocol_type,
          display_name: input.display_name,
          body_template: input.body_template,
          requires_employee_sig: true,
          requires_issuer_sig: input.requires_issuer_sig,
          validity_days: input.validity_days,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,protocol_type,category_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["protocol-templates"] }),
  });
}

export function useDeleteProtocolTemplateOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("document_protocols")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["protocol-templates"] }),
  });
}

/** Substitute {{placeholder}} tokens with values. */
export function substitutePlaceholders(
  body: string,
  values: Record<string, string>
): string {
  return body.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_, key) =>
    values[key] ?? `{{${key}}}`
  );
}

export const PLACEHOLDER_HINTS: { key: string; label: string }[] = [
  { key: "employee_name", label: "שם העובד" },
  { key: "employee_id", label: "ת.ז. עובד" },
  { key: "asset_name", label: "שם הציוד" },
  { key: "asset_code", label: "קוד ציוד" },
  { key: "serial", label: "מספר סידורי" },
  { key: "category", label: "קטגוריה" },
  { key: "date", label: "תאריך" },
  { key: "company_name", label: "שם החברה" },
];
