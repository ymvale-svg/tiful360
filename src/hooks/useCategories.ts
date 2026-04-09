import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  return useMutation({
    mutationFn: async (params: { category_name: string; prefix: string; description?: string; icon?: string }) => {
      const { data, error } = await supabase
        .from("asset_categories")
        .insert(params)
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
    mutationFn: async ({ id, ...params }: { id: string; category_name?: string; prefix?: string; description?: string; icon?: string }) => {
      const { error } = await supabase.from("asset_categories").update(params).eq("id", id);
      if (error) throw error;
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
        field_type: "text" | "number" | "date" | "list";
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
