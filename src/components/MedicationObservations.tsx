import { useMemo, useState, type FormEvent } from "react";
import { BookOpen, ChevronDown, CircleAlert, FileText, Plus } from "lucide-react";
import { setState, uid, type Med, type MedicationObservationCategory, type User } from "@/lib/store";

const categories: { value: MedicationObservationCategory; label: string }[] = [
  { value: "reacao", label: "Reação relatada" },
  { value: "dificuldade", label: "Dificuldade na administração" },
  { value: "prescricao", label: "Alteração de prescrição informada" },
  { value: "orientacao", label: "Orientação para administração" },
  { value: "outro", label: "Outra observação" },
];
const field = "min-h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/15";
const dateTime = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function MedicationObservations({ med, me }: { med: Med; me: User }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<MedicationObservationCategory>("orientacao");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const observations = useMemo(() => [...(med.observations ?? [])].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)), [med.observations]);
  const guidance = observations.find((entry) => entry.category === "orientacao");

  const save = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return setError("Descreva a informação que precisa ficar registrada.");
    const entry = { id: uid(), category, text: value, recordedAt: new Date().toISOString(), recordedBy: me.login };
    setState((state) => ({
      ...state,
      meds: state.meds.map((item) => item.id === med.id
        ? { ...item, observations: [...(item.observations ?? []), entry] }
        : item),
    }));
    setText("");
    setError("");
    setOpen(false);
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary"><BookOpen className="h-4 w-4" /></span><div><p className="text-xs font-bold text-foreground">Observações do medicamento</p><p className="text-[10px] text-muted-foreground">{observations.length} {observations.length === 1 ? "registro" : "registros"}</p></div></div>
        <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted" onClick={() => setOpen((value) => !value)}><Plus className="h-3.5 w-3.5" />{open ? "Fechar" : "Adicionar"}</button>
      </div>
      {guidance && <div className="rounded-xl border border-primary/20 bg-primary/[0.06] p-3"><p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-primary"><BookOpen className="h-3.5 w-3.5" />Orientação em destaque</p><p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground">{guidance.text}</p></div>}
      {open && <form onSubmit={save} className="space-y-2 rounded-xl border border-primary/20 bg-card p-3">
        <label className="block space-y-1 text-[11px] font-bold text-foreground">Tipo de observação<select className={field} value={category} onChange={(event) => setCategory(event.target.value as MedicationObservationCategory)}>{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="block space-y-1 text-[11px] font-bold text-foreground">Informação<textarea className={field + " min-h-20 resize-y"} rows={3} maxLength={1200} placeholder="Registre o que foi observado ou a orientação recebida..." value={text} onChange={(event) => setText(event.target.value)} /></label>
        {error && <p role="alert" className="text-[10px] font-semibold text-destructive">{error}</p>}
        <div className="flex justify-end"><button type="submit" className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"><FileText className="h-3.5 w-3.5" />Salvar observação</button></div>
      </form>}
      {observations.length > 0 && <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-[11px] font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">Ver histórico completo <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" /></summary>
        <div className="mt-2 space-y-2">
          {observations.map((entry) => <article key={entry.id} className="rounded-xl border border-border/70 bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-extrabold text-primary">{categories.find((item) => item.value === entry.category)?.label ?? "Observação"}</span><span className="text-[10px] text-muted-foreground">{dateTime(entry.recordedAt)}</span></div>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground">{entry.text}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">Registrado por {entry.recordedBy || "cuidador"}</p>
          </article>)}
        </div>
      </details>}
      {!observations.length && !open && <p className="text-[10px] text-muted-foreground">Registre reações relatadas, dificuldades, orientações ou informações sobre a prescrição.</p>}
    </section>
  );
}
