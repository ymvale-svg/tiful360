import { useQuery } from "@tanstack/react-query";
import { listHandoverDraftsForAsset } from "@/lib/handoverDraft";

export function useAssetHandoverDrafts(assetId?: string) {
  return useQuery({
    queryKey: ["handover-drafts", "asset", assetId],
    enabled: Boolean(assetId),
    queryFn: () => {
      if (!assetId) return Promise.resolve([]);
      return listHandoverDraftsForAsset(assetId);
    },
  });
}