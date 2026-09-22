/**
 * Local drafts for the handover / return flow.
 *
 * Lets an operator stop mid-process (missing signature, no reception, phone
 * call…) and resume later with all the entered details and captured media.
 * Stored in IndexedDB because photos/videos are File objects.
 */

import { supabase } from "@/integrations/supabase/client";

const DB_NAME = "tiful-handover-drafts";
const STORE = "drafts";

export interface HandoverDraft {
  key: string;
  savedAt: string;
  label: string;
  /** Company the draft belongs to (shared drafts). */
  companyId?: string | null;
  /** Name of the user who saved the draft (shared drafts from other users). */
  savedByName?: string | null;
  /** True when the draft was saved on another device: media files are not available here. */
  remoteOnly?: boolean;
  /** True when the original draft included photos/video. */
  hasMedia?: boolean;
  /** Serializable flow state (employee, texts, selected fields, step, mode…). */
  state: Record<string, any>;
  photos: File[];
  video: File | null;
  odometerPhoto?: File | null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve, reject) => {
      const store = db.transaction(STORE, mode).objectStore(STORE);
      const req = run(store);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("handover draft storage unavailable", e);
    return null;
  }
}

const putLocal = (draft: HandoverDraft) => tx<void>("readwrite", (s) => s.put(draft));
const getLocal = (key: string) => tx<HandoverDraft>("readonly", (s) => s.get(key));
const delLocal = (key: string) => tx<void>("readwrite", (s) => s.delete(key));

/**
 * Drafts are shared through the backend so any authorised user (and any device)
 * sees a "continue process" action. Photos/video stay on the device that
 * captured them — only the entered details travel.
 */
export async function saveHandoverDraft(draft: HandoverDraft) {
  await putLocal(draft);
  try {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    let savedByName: string | null = null;
    if (auth?.user?.id) {
      const { data: emp, error: employeeError } = await supabase
        .from("employees")
        .select("full_name")
        .eq("linked_user_id", auth.user.id)
        .limit(1)
        .maybeSingle();
      if (employeeError) throw employeeError;
      savedByName = emp?.full_name ?? auth.user.email ?? null;
    }
    const { error } = await supabase.from("handover_drafts").upsert(
      {
        key: draft.key,
        company_id: draft.companyId ?? null,
        label: draft.label ?? "",
        state: draft.state ?? {},
        has_media: (draft.photos?.length ?? 0) > 0 || !!draft.video || !!draft.odometerPhoto,
        saved_by: auth?.user?.id ?? null,
        saved_by_name: savedByName,
        saved_at: draft.savedAt,
      },
      { onConflict: "key" }
    );
    if (error) throw error;
  } catch (e) {
    console.warn("shared draft sync failed", e);
    throw e;
  }
}

export async function loadHandoverDraft(key: string): Promise<HandoverDraft | null> {
  const local = await getLocal(key);
  let remote: any = null;
  try {
    const { data } = await supabase.from("handover_drafts").select("*").eq("key", key).maybeSingle();
    remote = data;
  } catch (e) {
    console.warn("shared draft fetch failed", e);
  }
  if (!remote) return local ?? null;
  // Local copy still valid (same or newer save) → keep it, with the media files.
  if (local && new Date(local.savedAt).getTime() >= new Date(remote.saved_at).getTime()) {
    return { ...local, savedByName: remote.saved_by_name, hasMedia: remote.has_media };
  }
  return {
    key: remote.key,
    savedAt: remote.saved_at,
    label: remote.label ?? "",
    companyId: remote.company_id,
    savedByName: remote.saved_by_name,
    remoteOnly: true,
    hasMedia: remote.has_media,
    state: (remote.state ?? {}) as Record<string, any>,
    photos: [],
    video: null,
    odometerPhoto: null,
  };
}

function remoteRowToDraft(remote: any): HandoverDraft {
  return {
    key: remote.key,
    savedAt: remote.saved_at,
    label: remote.label ?? "",
    companyId: remote.company_id,
    savedByName: remote.saved_by_name,
    remoteOnly: true,
    hasMedia: remote.has_media,
    state: (remote.state ?? {}) as Record<string, any>,
    photos: [],
    video: null,
    odometerPhoto: null,
  };
}

/** All shared drafts that include an asset, including multi-item processes. */
export async function listHandoverDraftsForAsset(assetId: string): Promise<HandoverDraft[]> {
  const directPrefix = `asset:${assetId}:`;
  const { data, error } = await supabase
    .from("handover_drafts")
    .select("*")
    .or(`key.like.${directPrefix}%,key.like.multi:%${assetId}%`)
    .order("saved_at", { ascending: false });
  if (error) throw error;

  const remoteDrafts = (data ?? [])
    .filter((row) => {
      if (row.key.startsWith(directPrefix)) return true;
      if (!row.key.startsWith("multi:")) return false;
      return row.key.slice("multi:".length).split(",").includes(assetId);
    })
    .map(remoteRowToDraft);

  const localDrafts = await Promise.all([
    getLocal(draftKeyForAsset(assetId, "handover")),
    getLocal(draftKeyForAsset(assetId, "return")),
  ]);
  const byKey = new Map(remoteDrafts.map((draft) => [draft.key, draft]));
  localDrafts.forEach((local) => {
    if (!local) return;
    const remote = byKey.get(local.key);
    if (!remote || new Date(local.savedAt).getTime() >= new Date(remote.savedAt).getTime()) {
      byKey.set(local.key, { ...local, savedByName: remote?.savedByName ?? local.savedByName });
    }
  });

  return [...byKey.values()].sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  );
}

export async function deleteHandoverDraft(key: string) {
  await delLocal(key);
  try {
    await supabase.from("handover_drafts").delete().eq("key", key);
  } catch (e) {
    console.warn("shared draft delete failed", e);
  }
}

export const draftKeyForAsset = (assetId: string, direction: string) => `asset:${assetId}:${direction}`;
export const draftKeyForAssets = (assetIds: string[]) => `multi:${[...assetIds].sort().join(",")}`;

export function formatDraftTime(iso: string) {
  try {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch {
    return iso;
  }
}
