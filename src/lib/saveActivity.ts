// Counts saves that run outside React Query mutations (async button handlers,
// direct supabase calls) so the global save bar can show them too.
let active = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const saveActivity = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  get: () => active,
  /** Marks one save as started; call the returned function once when it settles. */
  begin(): () => void {
    active++;
    emit();
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      active--;
      emit();
    };
  },
};

/** Shows the global save bar while `work` runs, and returns its result. */
export function trackSave<T>(work: Promise<T>): Promise<T> {
  const end = saveActivity.begin();
  return work.then(
    (v) => { end(); return v; },
    (e) => { end(); throw e; },
  );
}
