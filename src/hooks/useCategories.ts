import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export function useCategoryFields(categoryId: string) {
  return useQuery({
    queryKey: ["category-fields", categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_fields")
        .select("*")
        .eq("category_id", categoryId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!categoryId,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  const { activeCompanyId } = useCompany();
  return useMutation({
    mutationFn: async (params: { category_name: string; prefix: string; description?: string; icon?: string; skip_handover_form?: boolean; skip_return_form?: boolean; default_notification_days_before?: number | null; is_assignable?: boolean; domain?: string; protocol_type?: string }) => {
      const { data, error } = await supabase
        .from("asset_categories")
        .insert({ ...params, company_id: activeCompanyId } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset-categories"] }),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...params }: { id: string; category_name?: string; prefix?: string; description?: string; icon?: string; sort_order?: number; skip_handover_form?: boolean; skip_return_form?: boolean; default_notification_days_before?: number | null; is_assignable?: boolean; domain?: string; protocol_type?: string }) => {
      const { error } = await supabase.from("asset_categories").update(params as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset-categories"] }),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Block deletion if category has assets
      const { count, error: countErr } = await supabase
        .from("assets")
        .select("id", { count: "exact", head: true })
        .eq("category_id", id);
      if (countErr) throw countErr;
      if ((count ?? 0) > 0) {
        throw new Error(`לא ניתן למחוק - קיימים ${count} פריטים בקטגוריה זו`);
      }
      // Delete custom fields first
      await supabase.from("category_fields").delete().eq("category_id", id);
      const { error } = await supabase.from("asset_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset-categories"] }),
  });
}

export function useReorderCategories() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      // Update each category's sort_order
      await Promise.all(
        orderedIds.map((id, index) =>
          supabase.from("asset_categories").update({ sort_order: index }).eq("id", id)
        )
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset-categories"] }),
  });
}

export function useSaveCategoryFields() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ categoryId, fields }: {
      categoryId: string;
      fields: Array<{
        id?: string;
        field_name: string;
        field_type: "text" | "number" | "date" | "list" | "list_multi";
        is_required: boolean;
        field_options: any;
        sort_order: number;
      }>;
    }) => {
      const existingIds = fields.filter(f => f.id).map(f => f.id!);
      const { data: current } = await supabase
        .from("category_fields")
        .select("id")
        .eq("category_id", categoryId);
      
      const toDelete = (current ?? []).filter(c => !existingIds.includes(c.id)).map(c => c.id);
      if (toDelete.length > 0) {
        await supabase.from("category_fields").delete().in("id", toDelete);
      }

      for (const field of fields) {
        if (field.id) {
          await supabase.from("category_fields").update({
            field_name: field.field_name,
            field_type: field.field_type,
            is_required: field.is_required,
            field_options: field.field_options,
            sort_order: field.sort_order,
          }).eq("id", field.id);
        } else {
          await supabase.from("category_fields").insert({
            category_id: categoryId,
            field_name: field.field_name,
            field_type: field.field_type,
            is_required: field.is_required,
            field_options: field.field_options,
            sort_order: field.sort_order,
          });
        }
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["category-fields", vars.categoryId] });
    },
  });
}

export function useAddCategoryFieldOption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ fieldId, newOption }: { fieldId: string; newOption: string }) => {
      const trimmed = newOption.trim();
      if (!trimmed) throw new Error("ערך ריק");
      const { data: current, error: fetchErr } = await supabase
        .from("category_fields")
        .select("field_options, category_id")
        .eq("id", fieldId)
        .single();
      if (fetchErr) throw fetchErr;
      const existing: string[] = Array.isArray(current?.field_options)
        ? (current!.field_options as any[]).map(String)
        : [];
      if (existing.some((o) => o.trim() === trimmed)) {
        return { categoryId: current!.category_id };
      }
      const next = [...existing, trimmed];
      const { error } = await supabase
        .from("category_fields")
        .update({ field_options: next })
        .eq("id", fieldId);
      if (error) throw error;
      return { categoryId: current!.category_id };
    },
    onSuccess: (res) => {
      if (res?.categoryId) {
        queryClient.invalidateQueries({ queryKey: ["category-fields", res.categoryId] });
      }
    },
  });
}

