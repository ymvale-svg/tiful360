import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LearningContentType = "pdf" | "video" | "link";

export interface ProcedureDepartment {
  id: string;
  company_id: string;
  name: string;
  sort_order: number;
  is_visible: boolean;
}

export interface ProcedureItem {
  id: string;
  company_id: string | null;
  department_id: string | null;
  title: string;
  description: string | null;
  content: string | null;
  category: string | null;
  file_url: string | null;
  sort_order: number;
  is_visible: boolean;
}

export interface GuideTopic {
  id: string;
  company_id: string;
  name: string;
  topic_type: "software" | "operations" | "safety" | "general";
  logo_url: string | null;
  color_key: string;
  sort_order: number;
  is_visible: boolean;
}

export interface GuideItem {
  id: string;
  company_id: string;
  topic_id: string | null;
  title: string;
  description: string | null;
  content_type: LearningContentType;
  resource_url: string;
  file_name: string | null;
  sort_order: number;
  is_visible: boolean;
}

export function useProcedureLibrary(companyId?: string | null, visibleOnly = true) {
  return useQuery({
    queryKey: ["procedure-library", companyId, visibleOnly],
    enabled: !!companyId,
    queryFn: async () => {
      let departmentsQuery = supabase.from("procedure_departments").select("*").eq("company_id", companyId as string).order("sort_order").order("name");
      let itemsQuery = supabase.from("knowledge_base").select("*").eq("company_id", companyId as string).order("sort_order").order("title");
      if (visibleOnly) {
        departmentsQuery = departmentsQuery.eq("is_visible", true);
        itemsQuery = itemsQuery.eq("is_visible", true);
      }
      const [departments, items] = await Promise.all([departmentsQuery, itemsQuery]);
      if (departments.error) throw departments.error;
      if (items.error) throw items.error;
      return {
        departments: (departments.data ?? []) as ProcedureDepartment[],
        items: (items.data ?? []) as ProcedureItem[],
      };
    },
  });
}

export function useGuideLibrary(companyId?: string | null, visibleOnly = true) {
  return useQuery({
    queryKey: ["guide-library", companyId, visibleOnly],
    enabled: !!companyId,
    queryFn: async () => {
      let topicsQuery = supabase.from("guide_topics").select("*").eq("company_id", companyId as string).order("sort_order").order("name");
      let guidesQuery = supabase.from("guides").select("*").eq("company_id", companyId as string).order("sort_order").order("title");
      if (visibleOnly) {
        topicsQuery = topicsQuery.eq("is_visible", true);
        guidesQuery = guidesQuery.eq("is_visible", true);
      }
      const [topics, guides] = await Promise.all([topicsQuery, guidesQuery]);
      if (topics.error) throw topics.error;
      if (guides.error) throw guides.error;
      return {
        topics: (topics.data ?? []) as GuideTopic[],
        guides: (guides.data ?? []) as GuideItem[],
      };
    },
  });
}

export async function uploadLearningFile(companyId: string, area: "procedures" | "guides" | "logos", file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${companyId}/${area}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("portal-learning").upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  return path;
}

export async function getLearningSignedUrl(path: string) {
  const { data, error } = await supabase.storage.from("portal-learning").createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

export async function removeLearningFile(path?: string | null) {
  if (!path || path.startsWith("http")) return;
  await supabase.storage.from("portal-learning").remove([path]);
}