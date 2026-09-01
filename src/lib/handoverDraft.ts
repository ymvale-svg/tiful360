/**
 * Local drafts for the handover / return flow.
 *
 * Lets an operator stop mid-process (missing signature, no reception, phone
 * call…) and resume later with all the entered details and captured media.
 * Stored in IndexedDB because photos/videos are File objects.
 */

const DB_NAME = "tiful-handover-drafts";
const STORE = "drafts";

export interface HandoverDraft {
  key: string;
  savedAt: string;
  label: string;
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

export const saveHandoverDraft = (draft: HandoverDraft) =>
  tx<void>("readwrite", (s) => s.put(draft));

export const loadHandoverDraft = (key: string) =>
  tx<HandoverDraft>("readonly", (s) => s.get(key));

export const deleteHandoverDraft = (key: string) =>
  tx<void>("readwrite", (s) => s.delete(key));

export const draftKeyForAsset = (assetId: string, direction: string) => `asset:${assetId}:${direction}`;
export const draftKeyForAssets = (assetIds: string[]) => `multi:${[...assetIds].sort().join(",")}`;

export function formatDraftTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("he-IL", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
