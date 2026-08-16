import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export interface EmployeeDocument {
  id: string;
  employee_id: string;
  company_id: string;
  document_type: string;
  document_label: string | null;
  file_url: string;
  file_name: string;
  file_size_bytes: number | null;
  expiry_date: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  notes: string | null;
}

export const EMPLOYEE_DOCUMENT_TYPES: Array<{ value: string; label: string }> = [
  { value: "contract", label: "חוזה העסקה" },
  { value: "id_document", label: "תעודת זהות / דרכון" },
  { value: "certificate", label: "תעודה / הסמכה" },
  { value: "medical", label: "אישור רפואי" },
  { value: "signed_form", label: "טופס חתום" },
  { value: "offboarding", label: "מסמכי עזיבה" },
  { value: "other", label: "אחר" },
];

export function useEmployeeDocuments(employeeId: string | undefined) {
  return useQuery({
    queryKey: ["employee-documents", employeeId],
    enabled: !!employeeId,
    queryFn: async (): Promise<EmployeeDocument[]> => {
      const { data, error } = await supabase
        .from("employee_documents" as any)
        .select("*")
        .eq("employee_id", employeeId!)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as EmployeeDocument[];
    },
  });
}

export function useUploadEmployeeDocument() {
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  return useMutation({
    mutationFn: async (params: {
      employee_id: string;
      file: File;
      document_type?: string;
      document_label?: string;
      expiry_date?: string;
      notes?: string;
    }) => {
      if (!activeCompanyId) throw new Error("לא נבחרה חברה");
      const ext = params.file.name.split(".").pop() || "bin";
      const path = `${activeCompanyId}/${params.employee_id}/${Date.now()}.${ext}`;

      const up = await supabase.storage
        .from("employee-documents")
        .upload(path, params.file, { cacheControl: "3600", upsert: false });
      if (up.error) throw up.error;

      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("employee_documents" as any).insert({
        employee_id: params.employee_id,
        company_id: activeCompanyId,
        document_type: params.document_type || "other",
        document_label: params.document_label || null,
        file_url: path,
        file_name: params.file.name,
        file_size_bytes: params.file.size,
        expiry_date: params.expiry_date || null,
        notes: params.notes || null,
        uploaded_by: user?.id ?? null,
      } as any);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["employee-documents", vars.employee_id] });
    },
  });
}

export function useDeleteEmployeeDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: EmployeeDocument) => {
      await supabase.storage.from("employee-documents").remove([doc.file_url]);
      const { error } = await supabase.from("employee_documents" as any).delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: (_, doc) => {
      qc.invalidateQueries({ queryKey: ["employee-documents", doc.employee_id] });
    },
  });
}

export async function getEmployeeDocumentSignedUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("employee-documents")
    .createSignedUrl(filePath, 60 * 10);
  if (error) return null;
  return data?.signedUrl ?? null;
}
