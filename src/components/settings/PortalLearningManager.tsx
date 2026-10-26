import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, Eye, EyeOff, FileText, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { GuideItem, GuideTopic, LearningContentType, ProcedureDepartment, ProcedureItem, removeLearningFile, uploadLearningFile, useGuideLibrary, useProcedureLibrary } from "@/hooks/usePortalLearning";
import { supabase } from "@/integrations/supabase/client";

export function PortalLearningManager({ companyId }: { companyId: string }) {
  return (
    <div className="bg-card rounded-lg border border-border/50 p-5 space-y-4">
      <div><h3 className="font-semibold">ניהול נהלים ומדריכים</h3><p className="text-xs text-muted-foreground mt-1">נהלים מחולקים למחלקות; מדריכים מחולקים לנושאים.</p></div>
      <Tabs defaultValue="procedures" dir="rtl">
        <TabsList><TabsTrigger value="procedures" className="gap-1.5"><BookOpen className="w-4 h-4" />נהלים</TabsTrigger><TabsTrigger value="guides" className="gap-1.5"><FileText className="w-4 h-4" />מדריכים</TabsTrigger></TabsList>
        <TabsContent value="procedures"><ProceduresManager companyId={companyId} /></TabsContent>
        <TabsContent value="guides"><GuidesManager companyId={companyId} /></TabsContent>
      </Tabs>
    </div>
  );
}

function ProceduresManager({ companyId }: { companyId: string }) {
  const { data = { departments: [], items: [] } } = useProcedureLibrary(companyId, false);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [departmentName, setDepartmentName] = useState("");
  const [editing, setEditing] = useState<ProcedureItem | null>(null);
  const [form, setForm] = useState({ title: "", description: "", department_id: "general", url: "", file: null as File | null });
  const refresh = () => qc.invalidateQueries({ queryKey: ["procedure-library"] });
  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("נא להזין כותרת");
      let fileUrl = form.url.trim() || editing?.file_url || null;
      if (form.file) fileUrl = await uploadLearningFile(companyId, "procedures", form.file);
      const payload = { title: form.title.trim(), description: form.description.trim() || null, department_id: form.department_id === "general" ? null : form.department_id, file_url: fileUrl, company_id: companyId };
      const result = editing ? await supabase.from("knowledge_base").update(payload).eq("id", editing.id) : await supabase.from("knowledge_base").insert(payload);
      if (result.error) throw result.error;
      if (editing?.file_url && form.file && editing.file_url !== fileUrl) await removeLearningFile(editing.file_url);
    },
    onSuccess: () => { refresh(); setEditing(null); setForm({ title: "", description: "", department_id: "general", url: "", file: null }); toast({ title: "הנוהל נשמר" }); },
    onError: (error: Error) => toast({ title: "שגיאה", description: error.message, variant: "destructive" }),
  });
  const addDepartment = async () => {
    if (!departmentName.trim()) return;
    const { error } = await supabase.from("procedure_departments").insert({ company_id: companyId, name: departmentName.trim(), sort_order: data.departments.length });
    if (error) return toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    setDepartmentName(""); refresh();
  };
  const editItem = (item: ProcedureItem) => { setEditing(item); setForm({ title: item.title, description: item.description ?? "", department_id: item.department_id ?? "general", url: item.file_url?.startsWith("http") ? item.file_url : "", file: null }); };

  return <div className="space-y-5 pt-4">
    <ManagerBlock title="מחלקות">
      <div className="flex gap-2"><Input value={departmentName} onChange={(e) => setDepartmentName(e.target.value)} placeholder="שם מחלקה" /><Button onClick={addDepartment} className="gap-1"><Plus className="w-4 h-4" />הוסף</Button></div>
      <ManagedGroups table="procedure_departments" groups={data.departments} refresh={refresh} />
    </ManagerBlock>
    <ManagerBlock title={editing ? "עריכת נוהל" : "הוספת נוהל"}>
      <ContentForm title={form.title} description={form.description} url={form.url} setTitle={(title) => setForm({ ...form, title })} setDescription={(description) => setForm({ ...form, description })} setUrl={(url) => setForm({ ...form, url })} onFile={(file) => setForm({ ...form, file })} accept="application/pdf" />
      <div><Label>מחלקה</Label><Select value={form.department_id} onValueChange={(department_id) => setForm({ ...form, department_id })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="general">כללי</SelectItem>{data.departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="flex gap-2"><Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>{editing ? "שמור שינויים" : "הוסף נוהל"}</Button>{editing && <Button variant="ghost" onClick={() => { setEditing(null); setForm({ title: "", description: "", department_id: "general", url: "", file: null }); }}>ביטול</Button>}</div>
    </ManagerBlock>
    <ManagedItems items={data.items} groupName={(item) => data.departments.find((d) => d.id === (item as ProcedureItem).department_id)?.name ?? "כללי"} onEdit={(item) => editItem(item as ProcedureItem)} table="knowledge_base" refresh={refresh} filePath={(item) => (item as ProcedureItem).file_url} />
  </div>;
}

function GuidesManager({ companyId }: { companyId: string }) {
  const { data = { topics: [], guides: [] } } = useGuideLibrary(companyId, false);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [topic, setTopic] = useState({ name: "", topic_type: "general", logo: null as File | null });
  const [editing, setEditing] = useState<GuideItem | null>(null);
  const [form, setForm] = useState({ title: "", url: "", file: null as File | null });
  const refresh = () => qc.invalidateQueries({ queryKey: ["guide-library"] });
  const addTopic = async () => {
    if (!topic.name.trim()) return;
    const logoUrl = topic.logo ? await uploadLearningFile(companyId, "logos", topic.logo) : null;
    const { error } = await supabase.from("guide_topics").insert({ company_id: companyId, name: topic.name.trim(), topic_type: topic.topic_type, logo_url: logoUrl, sort_order: data.topics.length });
    if (error) return toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    setTopic({ name: "", topic_type: "general", logo: null }); refresh();
  };
  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("נא להזין שם למדריך");
      let resourceUrl = form.url.trim() || editing?.resource_url || "";
      let fileName = editing?.file_name ?? null;
      let contentType: LearningContentType = editing?.content_type ?? "link";
      if (form.file) {
        resourceUrl = await uploadLearningFile(companyId, "guides", form.file);
        fileName = form.file.name;
        contentType = form.file.type.startsWith("video/") ? "video" : "pdf";
      }
      if (!resourceUrl) throw new Error("נא לבחור קובץ או להזין קישור");
      const payload = { company_id: companyId, topic_id: editing?.topic_id ?? null, title: form.title.trim(), content_type: contentType, resource_url: resourceUrl, file_name: fileName };
      const result = editing ? await supabase.from("guides").update(payload).eq("id", editing.id) : await supabase.from("guides").insert(payload);
      if (result.error) throw result.error;
      if (editing?.resource_url && form.file && editing.resource_url !== resourceUrl) await removeLearningFile(editing.resource_url);
    },
    onSuccess: () => { refresh(); setEditing(null); setForm({ title: "", url: "", file: null }); toast({ title: "המדריך נשמר" }); },
    onError: (error: Error) => toast({ title: "שגיאה", description: error.message, variant: "destructive" }),
  });
  const editItem = (item: GuideItem) => { setEditing(item); setForm({ title: item.title, url: item.resource_url.startsWith("http") ? item.resource_url : "", file: null }); };
  const assignGuideTopic = async (item: GuideItem, topic_id: string | null) => {
    const { error } = await supabase.from("guides").update({ topic_id }).eq("id", item.id);
    if (error) return toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    refresh();
  };
  return <div className="space-y-5 pt-4">
    <ManagerBlock title="נושאי מדריכים"><div className="grid sm:grid-cols-[1fr_180px_1fr_auto] gap-2"><Input value={topic.name} onChange={(e) => setTopic({ ...topic, name: e.target.value })} placeholder="שם הנושא" /><Select value={topic.topic_type} onValueChange={(topic_type) => setTopic({ ...topic, topic_type })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="software">תוכנה</SelectItem><SelectItem value="operations">תפעול</SelectItem><SelectItem value="safety">בטיחות</SelectItem><SelectItem value="general">כללי</SelectItem></SelectContent></Select><Input type="file" accept="image/*" onChange={(e) => setTopic({ ...topic, logo: e.target.files?.[0] ?? null })} /><Button onClick={addTopic} className="gap-1"><Plus className="w-4 h-4" />הוסף</Button></div><ManagedGroups table="guide_topics" groups={data.topics} refresh={refresh} filePath={(group) => (group as GuideTopic).logo_url} /></ManagerBlock>
    <ManagerBlock title={editing ? "עריכת מדריך" : "הוספת מדריך"}>
      <div className="space-y-3">
        <div><Label>שם המדריך</Label><Input className="mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="למשל: פתיחת קריאת שירות" /></div>
        <div className="grid sm:grid-cols-2 gap-3"><div><Label>בחירת קובץ</Label><Input className="mt-1" type="file" accept="application/pdf,video/*" onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })} /></div><div><Label>או קישור</Label><Input className="mt-1 text-left" dir="ltr" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." /></div></div>
        <p className="text-xs text-muted-foreground">להעלאה מפייספון או מאייפון: השאירו את המסך פתוח עד שהקובץ נקלט.</p>
        <div className="flex gap-2"><Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>{editing ? "שמור שינויים" : "הוסף מדריך"}</Button>{editing && <Button variant="ghost" onClick={() => { setEditing(null); setForm({ title: "", url: "", file: null }); }}>ביטול</Button>}</div>
      </div>
    </ManagerBlock>
    <ManagedItems items={data.guides} groupName={(item) => data.topics.find((t) => t.id === (item as GuideItem).topic_id)?.name ?? "כללי"} onEdit={(item) => editItem(item as GuideItem)} table="guides" refresh={refresh} filePath={(item) => (item as GuideItem).resource_url} assignTopic={{ topics: data.topics, onAssign: assignGuideTopic }} />
  </div>;
}

function ManagerBlock({ title, children }: { title: string; children: React.ReactNode }) { return <div className="border-t border-border pt-4 space-y-3"><h4 className="text-sm font-semibold">{title}</h4>{children}</div>; }
function ContentForm({ title, description, url, setTitle, setDescription, setUrl, onFile, accept, hideFile = false }: { title: string; description: string; url: string; setTitle: (v: string) => void; setDescription: (v: string) => void; setUrl: (v: string) => void; onFile: (f: File | null) => void; accept: string; hideFile?: boolean }) { return <div className="grid sm:grid-cols-2 gap-3"><div><Label>כותרת</Label><Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} /></div><div><Label>תיאור קצר</Label><Input className="mt-1" value={description} onChange={(e) => setDescription(e.target.value)} /></div>{!hideFile && <div><Label>העלאת PDF</Label><Input className="mt-1" type="file" accept={accept} onChange={(e) => onFile(e.target.files?.[0] ?? null)} /></div>}<div><Label>{hideFile ? "קישור" : "או קישור קיים"}</Label><Input className="mt-1 text-left" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." /></div></div>; }

function ManagedGroups({ table, groups, refresh, filePath }: { table: "procedure_departments" | "guide_topics"; groups: Array<ProcedureDepartment | GuideTopic>; refresh: () => void; filePath?: (group: ProcedureDepartment | GuideTopic) => string | null }) {
  const update = async (id: string, values: Record<string, unknown>) => { await supabase.from(table).update(values as any).eq("id", id); refresh(); };
  const remove = async (group: ProcedureDepartment | GuideTopic) => { const path = filePath?.(group); await supabase.from(table).delete().eq("id", group.id); await removeLearningFile(path); refresh(); };
  return <div className="space-y-1">{groups.map((group, index) => <div key={group.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded-md"><span className="text-sm flex-1">{group.name}</span><Button variant="ghost" size="icon" disabled={index === 0} onClick={() => update(group.id, { sort_order: Math.max(0, group.sort_order - 1) })}><ChevronUp className="w-4 h-4" /></Button><Button variant="ghost" size="icon" onClick={() => update(group.id, { sort_order: group.sort_order + 1 })}><ChevronDown className="w-4 h-4" /></Button><Button variant="ghost" size="icon" onClick={() => update(group.id, { is_visible: !group.is_visible })}>{group.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}</Button><Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove(group)}><Trash2 className="w-4 h-4" /></Button></div>)}</div>;
}

function ManagedItems({ items, groupName, onEdit, table, refresh, filePath }: { items: Array<ProcedureItem | GuideItem>; groupName: (item: ProcedureItem | GuideItem) => string; onEdit: (item: ProcedureItem | GuideItem) => void; table: "knowledge_base" | "guides"; refresh: () => void; filePath: (item: ProcedureItem | GuideItem) => string | null }) {
  const update = async (item: ProcedureItem | GuideItem) => { await supabase.from(table).update({ is_visible: !item.is_visible }).eq("id", item.id); refresh(); };
  const remove = async (item: ProcedureItem | GuideItem) => { await supabase.from(table).delete().eq("id", item.id); await removeLearningFile(filePath(item)); refresh(); };
  return <ManagerBlock title="תוכן קיים"><div className="space-y-2">{items.map((item) => <div key={item.id} className="flex items-center gap-2 p-3 border border-border/50 rounded-md"><div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{item.title}</p><p className="text-xs text-muted-foreground">{groupName(item)}</p></div><Button variant="ghost" size="icon" onClick={() => onEdit(item)}><Pencil className="w-4 h-4" /></Button><Button variant="ghost" size="icon" onClick={() => update(item)}>{item.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}</Button><Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove(item)}><Trash2 className="w-4 h-4" /></Button></div>)}{!items.length && <p className="text-sm text-muted-foreground">עדיין לא נוסף תוכן</p>}</div></ManagerBlock>;
}