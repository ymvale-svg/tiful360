// Lets any screen (a dashboard tile, a shortcut) open the header's notification center.
let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const notificationCenter = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  get: () => open,
  set(next: boolean) { if (next !== open) { open = next; emit(); } },
};
