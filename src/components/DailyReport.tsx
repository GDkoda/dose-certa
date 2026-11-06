import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ClipboardList, FileText, Plus, Printer } from "lucide-react";
import { setState, uid, useStore, type CareEventCategory, type User } from "@/lib/store";

const field = "min-h-11 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";
const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted";
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:brightness-95 disabled:opacity-50";
const card = "rounded-[1.6rem] border border-border/80 bg-card p-4 shadow-sm sm:p-5";
const dateKey = (value: Date) => [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
const dateOf = (iso: string) => {
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? "" : dateKey(value);
};
const timeOf = (iso: string) => {
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? "--:--" : value.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};
const dayLabel = (value: string) => new Date(value + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

type ReportEntry = { id: string; time: string; group: string; title: string; detail: string; status?: string; tone?: "positive" | "warning" | "neutral" };

export function DailyReport({ me, activePatientId = "" }: { me: User; activePatientId?: string }) {
  const patients = useStore((state) => state.patients.filter((patient) => me.role === "mestre" || patient.ownerId === me.id));
  const meds = useStore((state) => state.meds.filter((med) => me.role === "mestre" || med.ownerId === me.id));
  const doses = useStore((state) => state.doses.filter((dose) => me.role === "mestre" || dose.ownerId === me.id));
  const routineLogs = useStore((state) => state.routineLogs.filter((log) => me.role === "mestre" || log.ownerId === me.id));
  const routines = useStore((state) => state.routines.filter((task) => me.role === "mestre" || task.ownerId === me.id));
  const hydrationLogs = useStore((state) => state.hydrationLogs.filter((log) => me.role === "mestre" || log.ownerId === me.id));
  const careEvents = useStore((state) => state.careEvents.filter((event) => me.role === "mestre" || event.ownerId === me.id));
  const [patientId, setPatientId] = useState(activePatientId);
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventCategory, setEventCategory] = useState<CareEventCategory>("observacao");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventTime, setEventTime] = useState(new Date().toTimeString().slice(0, 5));
  const [eventError, setEventError] = useState("");

  useEffect(() => { if (activePatientId) setPatientId(activePatientId); }, [activePatientId]);
  const patient = patients.find((entry) => entry.id === patientId);
  const patientMeds = meds.filter((med) => med.patientId === patientId);
  const patientRoutineTasks = routines.filter((task) => task.patientId === patientId);
  const tasksById = useMemo(() => new Map(patientRoutineTasks.map((task) => [task.id, task])), [patientRoutineTasks]);
  const patientDoses = doses.filter((dose) => dose.patientId === patientId && dateOf(dose.takenAt ?? dose.scheduledAt) === selectedDate);
  const patientHydration = hydrationLogs.filter((entry) => entry.patientId === patientId && entry.date === selectedDate);
  const patientCareEvents = careEvents.filter((entry) => entry.patientId === patientId && dateOf(entry.recordedAt) === selectedDate);
  const legacyRoutineLogs = routineLogs.filter((entry) => entry.patientId === patientId && entry.date === selectedDate);

  const entries = useMemo(() => {
    const result: ReportEntry[] = [];
    const medsById = new Map(patientMeds.map((med) => [med.id, med]));
    patientDoses.forEach((dose) => {
      const med = medsById.get(dose.medId);
      result.push({
        id: "dose-" + dose.id,
        time: timeOf(dose.takenAt ?? dose.scheduledAt),
        group: "Medicamentos",
        title: med?.name ?? "Medicamento",
        detail: [med?.dose, "Horário previsto: " + timeOf(dose.scheduledAt)].filter(Boolean).join(" · "),
        status: dose.status === "tomado" ? "Administrado" : dose.status === "nao_tomado" ? "Não tomado" : "Pendente",
        tone: dose.status === "tomado" ? "positive" : dose.status === "nao_tomado" ? "warning" : "neutral",
      });
    });
    patientMeds.forEach((med) => (med.observations ?? []).forEach((note) => {
      if (dateOf(note.recordedAt) !== selectedDate) return;
      const labels = { reacao: "Reação relatada", dificuldade: "Dificuldade na administração", prescricao: "Alteração de prescrição informada", orientacao: "Orientação", outro: "Outra observação" };
      result.push({
        id: "med-note-" + med.id + "-" + note.id,
        time: timeOf(note.recordedAt),
        group: "Medicamentos",
        title: med.name + " · " + labels[note.category],
        detail: note.text + (note.recordedBy ? " · Registrado por " + note.recordedBy : ""),
        status: "Observação",
        tone: "neutral",
      });
    }));
    patientHydration.forEach((entry) => result.push({
      id: "water-" + entry.id,
      time: timeOf(entry.recordedAt),
      group: "Hidratação",
      title: entry.amountMl + " ml registrados",
      detail: [entry.notes, entry.recordedBy ? "Registrado por " + entry.recordedBy : "Oferta de água registrada pelo cuidador."].filter(Boolean).join(" · "),
      status: "Ingerido",
      tone: "positive",
    }));
    legacyRoutineLogs.forEach((entry) => {
      const task = tasksById.get(entry.taskId);
      const quantity = entry.offeredAmount !== undefined
        ? "Oferecido: " + entry.offeredAmount + " " + (entry.unit ?? "") + " · Aceito: " + (entry.acceptedAmount ?? 0) + " " + (entry.unit ?? "")
        : "";
      const routineGroups = {
        hidratacao: "Hidratação", alimentacao: "Alimentação", higiene: "Higiene",
        terapia: "Terapia", descanso: "Descanso", escola: "Escola",
        atividade: "Atividade", consulta: "Consulta", outro: "Outros cuidados",
      };
      result.push({
        id: "routine-" + entry.id,
        time: timeOf(entry.completedAt),
        group: task ? routineGroups[task.category] : "Rotina",
        title: task?.title ?? "Registro de cuidado",
        detail: [quantity, entry.notes].filter(Boolean).join(" · ") || "Registro de rotina.",
        status: entry.status === "nao_realizado" ? "Não realizado" : entry.status === "parcial" ? "Parcial" : "Concluído",
        tone: entry.status === "nao_realizado" ? "warning" : "positive",
      });
    });
    patientCareEvents.forEach((entry) => {
      const labels = { saude: "Alteração percebida na saúde", intercorrencia: "Intercorrência", observacao: "Observação geral" };
      result.push({
        id: "care-" + entry.id,
        time: timeOf(entry.recordedAt),
        group: entry.category === "intercorrencia" ? "Intercorrências" : "Acompanhamento",
        title: entry.title || labels[entry.category],
        detail: entry.description + (entry.recordedBy ? " · Registrado por " + entry.recordedBy : ""),
        status: labels[entry.category],
        tone: entry.category === "intercorrencia" ? "warning" : "neutral",
      });
    });
    return result.sort((a, b) => a.time.localeCompare(b.time));
  }, [patientMeds, patientDoses, patientHydration, legacyRoutineLogs, tasksById, patientCareEvents, selectedDate]);

  const waterTotal = patientHydration.reduce((sum, item) => sum + item.amountMl, 0)
    + legacyRoutineLogs.filter((log) => tasksById.get(log.taskId)?.category === "hidratacao").reduce((sum, log) => sum + (log.acceptedAmount ?? 0), 0);
  const taken = patientDoses.filter((dose) => dose.status === "tomado").length;
  const missed = patientDoses.filter((dose) => dose.status === "nao_tomado").length;
  const mealCount = legacyRoutineLogs.filter((log) => tasksById.get(log.taskId)?.category === "alimentacao").length;

  const addEvent = (event: FormEvent) => {
    event.preventDefault();
    if (!patient) return;
    if (!eventTitle.trim() || !eventDescription.trim()) return setEventError("Informe um título e descreva o que aconteceu.");
    const localDateTime = new Date(selectedDate + "T" + eventTime + ":00");
    if (Number.isNaN(localDateTime.getTime())) return setEventError("Confira a data e o horário.");
    setState((state) => ({
      ...state,
      careEvents: [{
        id: uid(),
        patientId: patient.id,
        ownerId: patient.ownerId,
        category: eventCategory,
        title: eventTitle.trim(),
        description: eventDescription.trim(),
        recordedAt: localDateTime.toISOString(),
        recordedBy: me.login,
      }, ...state.careEvents],
    }));
    setEventTitle("");
    setEventDescription("");
    setEventCategory("observacao");
    setEventTime(new Date().toTimeString().slice(0, 5));
    setEventError("");
    setShowEventForm(false);
  };

  if (!patients.length) return <section className={card}><h1 className="font-display text-2xl font-bold text-foreground">Relatório diário</h1><p className="mt-2 text-sm text-muted-foreground">Cadastre um paciente para começar a reunir os registros do dia.</p></section>;

  return (
    <main className="mx-auto max-w-5xl space-y-5">
      <header className={card + " relative overflow-hidden"}>
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Acompanhamento do cuidado</p>
            <h1 className="mt-1 font-display text-3xl font-bold text-foreground">Relatório diário</h1>
            <p className="mt-1 text-sm text-muted-foreground">Reúna os registros do dia em uma única linha do tempo.</p>
          </div>
          <div className="no-print flex gap-2">
            <button type="button" className={button} onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir / PDF</button>
            {patient && <button type="button" className={primary} onClick={() => setShowEventForm((value) => !value)}><Plus className="h-4 w-4" />Novo registro</button>}
          </div>
        </div>
        <div className="relative mt-5 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs font-bold text-foreground">Paciente
            <select className={field} value={patientId} onChange={(event) => setPatientId(event.target.value)}>
              <option value="">Selecione um paciente</option>
              {patients.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-bold text-foreground">Dia do relatório
            <input className={field} type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
          </label>
        </div>
      </header>

      {!patient && <section className={card + " text-center"}><ClipboardList className="mx-auto h-7 w-7 text-primary" /><h2 className="mt-2 font-display text-lg font-bold text-foreground">Escolha um paciente</h2><p className="mt-1 text-sm text-muted-foreground">Selecione a pessoa que deseja acompanhar para montar o relatório do dia.</p></section>}
      {patient && <>
        <section className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <div className={card}><p className="text-xs font-semibold text-muted-foreground">Doses administradas</p><p className="mt-2 font-display text-3xl font-bold text-foreground">{taken}</p><p className="text-[11px] text-muted-foreground">{missed} não tomadas</p></div>
          <div className={card}><p className="text-xs font-semibold text-muted-foreground">Água registrada</p><p className="mt-2 font-display text-3xl font-bold text-foreground">{waterTotal}<span className="ml-1 text-xs">ml</span></p><p className="text-[11px] text-muted-foreground">{patientHydration.length} lançamentos rápidos</p></div>
          <div className={card}><p className="text-xs font-semibold text-muted-foreground">Refeições</p><p className="mt-2 font-display text-3xl font-bold text-foreground">{mealCount}</p><p className="text-[11px] text-muted-foreground">Registros no dia</p></div>
          <div className={card}><p className="text-xs font-semibold text-muted-foreground">Anotações</p><p className="mt-2 font-display text-3xl font-bold text-foreground">{patientCareEvents.length + patientMeds.reduce((sum, med) => sum + (med.observations ?? []).filter((note) => dateOf(note.recordedAt) === selectedDate).length, 0)}</p><p className="text-[11px] text-muted-foreground">Saúde e medicamentos</p></div>
        </section>

        {showEventForm && <form onSubmit={addEvent} className={card + " no-print space-y-3"}>
          <div className="flex items-center justify-between gap-2"><div><h2 className="font-bold text-foreground">Registrar acontecimento</h2><p className="text-xs text-muted-foreground">Use para alterações percebidas na saúde, intercorrências ou observações.</p></div><button type="button" className={button} onClick={() => setShowEventForm(false)}>Fechar</button></div>
          <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
            <label className="space-y-1 text-xs font-bold text-foreground">Tipo de registro
              <select className={field} value={eventCategory} onChange={(event) => setEventCategory(event.target.value as CareEventCategory)}>
                <option value="observacao">Observação geral</option><option value="saude">Alteração percebida na saúde</option><option value="intercorrencia">Intercorrência</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-bold text-foreground">Horário
              <input className={field} type="time" value={eventTime} onChange={(event) => setEventTime(event.target.value)} />
            </label>
          </div>
          <label className="block space-y-1 text-xs font-bold text-foreground">Título
            <input className={field} maxLength={100} placeholder="Ex.: Relatou dor de cabeça" value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} />
          </label>
          <label className="block space-y-1 text-xs font-bold text-foreground">Descrição
            <textarea className={field + " min-h-24 resize-y"} rows={3} maxLength={2000} placeholder="Descreva o que foi observado, quando começou e quais providências foram tomadas..." value={eventDescription} onChange={(event) => setEventDescription(event.target.value)} />
          </label>
          {eventError && <p role="alert" className="text-xs font-semibold text-destructive">{eventError}</p>}
          <div className="flex justify-end"><button type="submit" className={primary}>Salvar no relatório</button></div>
        </form>}

        <section className={card + " space-y-4"}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
            <div><p className="text-xs font-bold uppercase tracking-wider text-primary">Registro consolidado</p><h2 className="mt-1 font-display text-xl font-bold capitalize text-foreground">{dayLabel(selectedDate)}</h2><p className="text-xs text-muted-foreground">{patient.name} · {entries.length} lançamentos encontrados</p></div>
            <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">Dose Certa</span>
          </div>
          {entries.length ? <ol className="space-y-3">
            {entries.map((entry) => <li key={entry.id} className="flex gap-3 rounded-2xl border border-border/70 bg-background/65 p-3 sm:p-4">
              <div className="w-12 shrink-0 pt-0.5 text-sm font-extrabold tabular-nums text-foreground">{entry.time}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-extrabold uppercase tracking-wider text-primary">{entry.group}</span>{entry.status && <span className={"rounded-full px-2 py-0.5 text-[10px] font-bold " + (entry.tone === "positive" ? "bg-primary/10 text-primary" : entry.tone === "warning" ? "bg-amber-500/15 text-amber-800 dark:text-amber-200" : "bg-muted text-muted-foreground")}>{entry.status}</span>}</div>
                <p className="mt-1 text-sm font-bold text-foreground">{entry.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{entry.detail}</p>
              </div>
            </li>)}
          </ol> : <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center"><FileText className="mx-auto h-8 w-8 text-muted-foreground" /><h3 className="mt-3 font-display text-lg font-bold text-foreground">Nenhum registro neste dia</h3><p className="mt-1 text-sm text-muted-foreground">Os medicamentos, cuidados e observações registrados aparecerão aqui automaticamente.</p></div>}
          <p className="border-t border-border/70 pt-3 text-[10px] leading-relaxed text-muted-foreground">Este relatório reúne informações registradas pelos cuidadores. Não substitui prontuário, avaliação profissional ou orientação clínica. Confira as informações antes de compartilhar ou imprimir.</p>
        </section>
      </>}
    </main>
  );
}
