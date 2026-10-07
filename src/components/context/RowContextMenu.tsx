import type { ReactNode } from "react";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface ContextAction {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** Only shown to these roles (hidden — not greyed — otherwise). */
  roles?: string[];
  /** Hide when false (e.g. no value to copy, not relevant for this item). */
  when?: boolean;
  danger?: boolean;
  /** Draw a separator before this action. */
  separator?: boolean;
}

/** Right-click (and long-press / Shift+F10) menu for a row, card or link. */
export function RowContextMenu({ actions, children }: { actions: ContextAction[]; children: ReactNode }) {
  const { roles } = useAuth();
  const visible = actions.filter(
    (a) => a.when !== false && (!a.roles || a.roles.some((r) => (roles as string[]).includes(r))),
  );
  if (visible.length === 0) return <>{children}</>;
  return (
    <ContextMenu dir="rtl">
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-[200px] text-right" onClick={(e) => e.stopPropagation()}>
        {visible.map((a, i) => (
          <div key={a.label}>
            {(a.separator || a.danger) && i > 0 && <ContextMenuSeparator />}
            <ContextMenuItem
              onSelect={a.onSelect}
              className={cn("gap-2", a.danger && "text-destructive focus:text-destructive")}
            >
              {a.icon}
              {a.label}
            </ContextMenuItem>
          </div>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function copyAction(label: string, value: unknown, separator = false): ContextAction {
  const text = value == null ? "" : String(value);
  return {
    label,
    when: text.trim() !== "",
    separator,
    onSelect: () => {
      navigator.clipboard.writeText(text).then(() => toast({ title: "הועתק", description: text }));
    },
  };
}

export function openInNewTab(path: string) {
  window.open(path, "_blank", "noopener");
}
