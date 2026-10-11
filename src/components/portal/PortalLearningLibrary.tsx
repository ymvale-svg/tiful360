import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, Building2, Car, Download, ExternalLink, FileText, Laptop, PlayCircle, Search, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { GuideItem, GuideTopic, ProcedureDepartment, ProcedureItem, getLearningSignedUrl } from "@/hooks/usePortalLearning";

type Props =
  | { mode: "procedures"; departments: ProcedureDepartment[]; items: ProcedureItem[] }
  | { mode: "guides"; topics: GuideTopic[]; items: GuideItem[] };

const topicIcons = { software: Laptop, operations: Building2, safety: ShieldCheck, general: Car };

export function PortalLearningLibrary(props: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<{ url: string; name: string; title: string } | null>(null);
  const groups = props.mode === "procedures" ? props.departments : props.topics;
  const normalized = search.trim().toLocaleLowerCase("he");

  const matchingGroups = useMemo(() => groups.filter((group) => {
    const groupItems = props.items.filter((item) => props.mode === "procedures"
      ? (item as ProcedureItem).department_id === group.id
      : (item as GuideItem).topic_id === group.id);
    return !normalized || group.name.toLocaleLowerCase("he").includes(normalized) || groupItems.some((item) =>
      item.title.toLocaleLowerCase("he").includes(normalized) || (item.description ?? "").toLocaleLowerCase("he").includes(normalized));
  }), [groups, normalized, props]);

  const currentGroup = groups.find((group) => group.id === selectedId) ?? (selectedId === "general" ? { id: "general", name: "כללי" } : undefined);
  const currentItems = props.items.filter((item) => {
    const belongs = props.mode === "procedures"
      ? (selectedId === "general" ? !(item as ProcedureItem).department_id : (item as ProcedureItem).department_id === selectedId)
      : (item as GuideItem).topic_id === selectedId;
    return belongs && (!normalized || item.title.toLocaleLowerCase("he").includes(normalized) || (item.description ?? "").toLocaleLowerCase("he").includes(normalized));
  });
  const uncategorized = props.mode === "procedures" ? props.items.filter((item) => !(item as ProcedureItem).department_id) : [];

  const openItem = async (item: ProcedureItem | GuideItem) => {
    const path = props.mode === "procedures" ? (item as ProcedureItem).file_url : (item as GuideItem).resource_url;
    if (!path) return;
    const isExternal = path.startsWith("http://") || path.startsWith("https://");
    const url = isExternal ? path : await getLearningSignedUrl(path);
    const isPdf = props.mode === "procedures" || (item as GuideItem).content_type === "pdf";
    if (isPdf) setPreview({ url, name: (item as GuideItem).file_name || `${item.title}.pdf`, title: item.title });
    else window.open(url, "_blank", "noopener,noreferrer");
  };

  if (selectedId && currentGroup) {
    return (
      <div className="space-y-3 animate-fade-in">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)} aria-label="חזרה לנושאים"><ArrowRight className="w-4 h-4" /></Button>
          <div><h2 className="font-semibold">{currentGroup.name}</h2><p className="text-xs text-muted-foreground">{currentItems.length} פריטים</p></div>
        </div>
        <SearchBox value={search} onChange={setSearch} />
        {currentItems.map((item) => {
          const guide = item as GuideItem;
          const Icon = props.mode === "guides" ? (guide.content_type === "video" ? PlayCircle : guide.content_type === "link" ? ExternalLink : FileText) : FileText;
          return <button key={item.id} onClick={() => openItem(item)} className="w-full bg-card rounded-lg border border-border/50 p-3 flex items-center gap-3 text-right hover:bg-muted/40 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Icon className="w-5 h-5 text-primary" /></div>
            <div className="flex-1 min-w-0"><p className="text-sm font-medium">{item.title}</p>{item.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>}</div>
            {props.mode === "guides" && guide.content_type === "pdf" ? <Download className="w-4 h-4 text-muted-foreground" /> : <ExternalLink className="w-4 h-4 text-muted-foreground" />}
          </button>;
        })}
        {!currentItems.length && <Empty label="לא נמצאו פריטים בנושא זה" />}
        <DocumentPreviewDialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)} url={preview?.url ?? null} fileName={preview?.name ?? ""} title={preview?.title} />
      </div>
    );
  }

  const shownGroups = [...matchingGroups];
  if (props.mode === "procedures" && uncategorized.length && (!normalized || uncategorized.some((item) => item.title.toLocaleLowerCase("he").includes(normalized)))) {
    shownGroups.push({ id: "general", company_id: "", name: "כללי", sort_order: 999, is_visible: true });
  }
  return (
    <div className="space-y-4 animate-fade-in">
      <SearchBox value={search} onChange={setSearch} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {shownGroups.map((group) => {
          const topic = group as GuideTopic;
          const Icon = props.mode === "guides" ? (topicIcons[topic.topic_type] ?? BookOpen) : Building2;
          const count = group.id === "general" ? uncategorized.length : props.items.filter((item) => props.mode === "procedures" ? (item as ProcedureItem).department_id === group.id : (item as GuideItem).topic_id === group.id).length;
          return <button key={group.id} onClick={() => setSelectedId(group.id)} className="bg-card border border-border/50 rounded-lg p-4 min-h-28 flex flex-col items-center justify-center gap-2 hover:border-primary/40 hover:bg-muted/30 transition-colors">
            {props.mode === "guides" && topic.logo_url ? <TopicLogo path={topic.logo_url} name={topic.name} /> : <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center"><Icon className="w-6 h-6 text-primary" /></div>}
            <span className="text-sm font-semibold text-center">{group.name}</span><span className="text-[11px] text-muted-foreground">{count} פריטים</span>
          </button>;
        })}
      </div>
      {!shownGroups.length && <Empty label={normalized ? "לא נמצאו תוצאות" : "עדיין לא נוסף תוכן"} />}
    </div>
  );
}

function TopicLogo({ path, name }: { path: string; name: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => { getLearningSignedUrl(path).then(setUrl).catch(() => undefined); }, [path]);
  return url ? <img src={url} alt={`לוגו ${name}`} className="w-11 h-11 object-contain rounded-lg" /> : <div className="w-11 h-11 rounded-lg bg-muted" />;
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder="חיפוש..." className="w-full pr-9 pl-9 py-2.5 bg-card border border-border/50 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30" />{value && <button onClick={() => onChange("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label="נקה חיפוש"><X className="w-4 h-4" /></button>}</div>;
}

function Empty({ label }: { label: string }) { return <p className="text-center text-sm text-muted-foreground py-8">{label}</p>; }