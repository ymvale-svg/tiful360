import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Package, UserRound, FolderTree, Ticket, X } from "lucide-react";
import { useAssets, useEmployees, useAssetCategories, useITTickets } from "@/hooks/useData";
import { getDomain, domainKeyToSlug } from "@/lib/assetDomains";
import { cn } from "@/lib/utils";

type Hit = {
  id: string;
  label: string;
  sub?: string;
  group: "employees" | "assets" | "categories" | "tickets";
  to: string;
};

const GROUPS: { key: Hit["group"]; title: string; icon: typeof Search }[] = [
  { key: "employees", title: "עובדים", icon: UserRound },
  { key: "assets", title: "פריטי ציוד", icon: Package },
  { key: "categories", title: "קטגוריות", icon: FolderTree },
  { key: "tickets", title: "קריאות שירות", icon: Ticket },
];

/** Header-wide search across employees, assets, categories and service tickets. */
export function GlobalSearch() {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: assets } = useAssets();
  const { data: employees } = useEmployees();
  const { data: categories } = useAssetCategories();
  const { data: tickets } = useITTickets();

  // Close when clicking outside; ⌘K / Ctrl+K focuses the field.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const slugFor = (categoryId?: string | null) => {
    const c = (categories ?? []).find((x: any) => x.id === categoryId);
    return domainKeyToSlug(getDomain(c as any));
  };

  const hits = useMemo<Hit[]>(() => {
    const q = term.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: Hit[] = [];

    for (const e of (employees ?? []) as any[]) {
      if (
        e.full_name?.toLowerCase().includes(q) ||
        e.employee_code?.toLowerCase().includes(q) ||
        e.email?.toLowerCase().includes(q) ||
        e.phone?.toLowerCase?.().includes(q)
      ) {
        out.push({
          id: e.id,
          label: e.full_name,
          sub: [e.employee_code, e.role].filter(Boolean).join(" · "),
          group: "employees",
          to: `/employees/${e.id}`,
        });
      }
      if (out.filter((h) => h.group === "employees").length >= 6) break;
    }

    for (const a of (assets ?? []) as any[]) {
      if (
        a.asset_name?.toLowerCase().includes(q) ||
        a.asset_code?.toLowerCase().includes(q) ||
        a.serial_number?.toLowerCase().includes(q) ||
        a.license_plate?.toLowerCase?.().includes(q) ||
        (a.custom_fields && JSON.stringify(a.custom_fields).toLowerCase().includes(q))
      ) {
        out.push({
          id: a.id,
          label: a.asset_name,
          sub: [a.asset_code, a.serial_number].filter(Boolean).join(" · "),
          group: "assets",
          to: `/assets/${slugFor(a.category_id)}/${a.id}`,
        });
      }
      if (out.filter((h) => h.group === "assets").length >= 6) break;
    }

    for (const c of (categories ?? []) as any[]) {
      if (c.category_name?.toLowerCase().includes(q) || c.prefix?.toLowerCase?.().includes(q)) {
        out.push({
          id: c.id,
          label: c.category_name,
          sub: c.prefix ?? undefined,
          group: "categories",
          to: `/assets/${domainKeyToSlug(getDomain(c as any))}?cat=${c.id}`,
        });
      }
      if (out.filter((h) => h.group === "categories").length >= 4) break;
    }

    for (const t of (tickets ?? []) as any[]) {
      if (
        t.title?.toLowerCase().includes(q) ||
        t.description?.toLowerCase?.().includes(q) ||
        t.employees?.full_name?.toLowerCase().includes(q)
      ) {
        out.push({
          id: t.id,
          label: t.title,
          sub: t.employees?.full_name ?? undefined,
          group: "tickets",
          to: `/it-tickets?selected=${t.id}`,
        });
      }
      if (out.filter((h) => h.group === "tickets").length >= 4) break;
    }

    return out;
  }, [term, employees, assets, categories, tickets]);

  const go = (hit: Hit) => {
    setOpen(false);
    setTerm("");
    navigate(hit.to);
  };

  return (
    <div ref={boxRef} className="relative hidden md:block w-56 lg:w-80">
      <div className="flex items-center gap-3 bg-muted rounded-lg px-3 py-2">
        <Search className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <label htmlFor="global-search" className="sr-only">חיפוש כללי</label>
        <input
          id="global-search"
          ref={inputRef}
          type="text"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="חיפוש עובדים, ציוד, קריאות..."
          className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground"
          autoComplete="off"
        />
        {term && (
          <button type="button" onClick={() => { setTerm(""); inputRef.current?.focus(); }} aria-label="ניקוי חיפוש">
            <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {open && term.trim().length >= 2 && (
        <div className="absolute top-full mt-2 w-[22rem] lg:w-[26rem] max-w-[90vw] right-0 rounded-xl border border-border bg-popover shadow-xl z-[60] max-h-[70vh] overflow-y-auto p-2">
          {hits.length === 0 ? (
            <p className="text-sm text-muted-foreground px-3 py-4 text-center">לא נמצאו תוצאות עבור „{term}”</p>
          ) : (
            GROUPS.map(({ key, title, icon: Icon }) => {
              const rows = hits.filter((h) => h.group === key);
              if (!rows.length) return null;
              return (
                <div key={key} className="mb-1 last:mb-0">
                  <div className="px-3 py-1 text-xs font-semibold text-muted-foreground">
                    {title} <span className="font-normal">({rows.length})</span>
                  </div>
                  {rows.map((h) => (
                    <button
                      key={`${key}-${h.id}`}
                      type="button"
                      onClick={() => go(h)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-right",
                        "hover:bg-muted transition-colors",
                      )}
                    >
                      <Icon className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm truncate">{h.label}</span>
                        {h.sub && <span className="block text-xs text-muted-foreground truncate">{h.sub}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
