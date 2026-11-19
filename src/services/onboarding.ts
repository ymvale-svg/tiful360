// Data access for working onboarding checklists. Functions take the client as a parameter so
// they can be tested with a fake and reused outside React.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Db = Pick<SupabaseClient<Database>, "rpc" | "from">;
type UntypedRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: Error | null }>;

/** Tick or untick an item in one DB transaction (asset hand-over included). */
export async function completeOnboardingItem(db: Db, itemId: string, done: boolean, note?: string | null) {
  // complete_onboarding_item is newer than the generated types.
  const { data, error } = await (db.rpc as unknown as UntypedRpc)("complete_onboarding_item", {
    _item_id: itemId,
    _done: done,
    _note: note?.trim() || null,
  });
  if (error) throw error;
  return data;
}

/** Items that currently hold an asset, across the company's onboarding processes (RLS-scoped). */
export async function listOnboardingAssetPicks(db: Db) {
  const { data, error } = await db
    .from("onboarding_items")
    .select("id, asset_id, status")
    .not("asset_id", "is", null);
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; asset_id: string | null; status: string }>;
}

/** Set how a category is fulfilled in onboarding and whether HR sees it (RLS: catalog managers). */
export async function updateCategoryOnboarding(
  db: Db,
  categoryId: string,
  patch: { fulfillment_track?: string | null; show_in_onboarding?: boolean | null },
) {
  const { error } = await db.from("asset_categories").update(patch).eq("id", categoryId);
  if (error) throw error;
}
