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
const timestampOf = (iso: string) => {
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? 0 : value;
};
const timeOf = (iso: string) => {
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? "--:--" : value.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};
const formatDate = (value: string) => new Date(value + "T12:00:00").toLocaleDateString("pt-BR");
const dayLabel = (value: string) => new Date(value + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
const dateInRange = (value: string, start: string, end: string) => Boolean(value) && value >= start && value <= end;
const weekdayNames = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

type ReportEntry = {
  id: string;
  date: string;
  sortAt: number;
  time: string;
  group: string;
  title: string;
  detail: string;
  status?: string;
  tone?: "positive" | "warning" | "neutral";
};

export function DailyReport({ me, activePatientId = "" }: { me: User; activePatientId?: string }) {
  const patients = useStore((state) => state.patients.filter((patient) => me.role === "mestre" || patient.ownerId === me.id));
  const meds = useStore((state) => state.meds.filter((med) => me.role === "mestre" || med.ownerId === me.id));
  const doses = useStore((state) => state.doses.filter((dose) => me.role === "mestre" || dose.ownerId === me.id));
  const routineLogs = useStore((state) => state.routineLogs.filter((log) => me.role === "mestre" || log.ownerId === me.id));
  const routines = useStore((state) => state.routines.filter((task) => me.role === "mestre" || task.ownerId === me.id));
  const hydrationLogs = useStore((state) => state.hydrationLogs.filter((log) => me.role === "mestre" || log.ownerId === me.id));
  const careEvents = useStore((state) => state.careEvents.filter((event) => me.role === "mestre" || event.ownerId === me.id));
  const today = dateKey(new Date());
  const [patientId, setPatientId] = useState(activePatientId);
  const [reportMode, setReportMode] = useState<"day" | "period">("day");
  const [selectedDate, setSelectedDate] = useState(today);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventCategory, setEventCategory] = useState<CareEventCategory>("observacao");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventDate, setEventDate] = useState(today);
  const [eventTime, setEventTime] = useState(new Date().toTimeString().slice(0, 5));
  const [eventError, setEventError] = useState("");

  useEffect(() => { if (activePatientId) setPatientId(activePatientId); }, [activePatientId]);
  useEffect(() => {
    const start = reportMode === "day" ? selectedDate : startDate;
    const end = reportMode === "day" ? selectedDate : endDate;
    setEventDate((current) => !dateInRange(current, start, end) ? end : current);
  }, [reportMode, selectedDate, startDate, endDate]);

  const patient = patients.find((entry) => entry.id === patientId);
  const patientMeds = meds.filter((med) => med.patientId === patientId);
  const patientRoutineTasks = routines.filter((task) => task.patientId === patientId);
  const tasksById = useMemo(() => new Map(patientRoutineTasks.map((task) => [task.id, task])), [patientRoutineTasks]);
  const rangeStart = reportMode === "day" ? selectedDate : startDate;
  const rangeEnd = reportMode === "day" ? selectedDate : endDate;
  const validRange = Boolean(rangeStart && rangeEnd && rangeStart <= rangeEnd);

  const patientDoses = doses.filter((dose) => dose.patientId === patientId && validRange && dateInRange(dateOf(dose.takenAt ?? dose.scheduledAt), rangeStart, rangeEnd));
  const patientHydration = hydrationLogs.filter((entry) => entry.patientId === patientId && validRange && dateInRange(entry.date, rangeStart, rangeEnd));
  const patientCareEvents = careEvents.filter((entry) => entry.patientId === patientId && validRange && dateInRange(dateOf(entry.recordedAt), rangeStart, rangeEnd));
  const legacyRoutineLogs = routineLogs.filter((entry) => entry.patientId === patientId && validRange && dateInRange(entry.date, rangeStart, rangeEnd));

  const entries = useMemo(() => {
    const result: ReportEntry[] = [];
    const medsById = new Map(patientMeds.map((med) => [med.id, med]));
    patientDoses.forEach((dose) => {
      const eventAt = dose.takenAt ?? dose.scheduledAt;
      const med = medsById.get(dose.medId);
      result.push({
        id: "dose-" + dose.id,
        date: dateOf(eventAt),
        sortAt: timestampOf(eventAt),
        time: timeOf(eventAt),
        group: "Medicamentos",
        title: med?.name ?? "Medicamento",
        detail: [med?.dose, "Horário previsto: " + timeOf(dose.scheduledAt)].filter(Boolean).join(" · "),
        status: dose.status === "tomado" ? "Administrado" : dose.status === "nao_tomado" ? "Não tomado" : "Pendente",
        tone: dose.status === "tomado" ? "positive" : dose.status === "nao_tomado" ? "warning" : "neutral",
      });
    });

    patientMeds.forEach((med) => (med.observations ?? []).forEach((note) => {
      const noteDate = dateOf(note.recordedAt);
      if (!dateInRange(noteDate, rangeStart, rangeEnd)) return;
      const labels = { reacao: "Reação relatada", dificuldade: "Dificuldade na administração", prescricao: "Alteração de prescrição informada", orientacao: "Orientação", outro: "Outra observação" };
      result.push({
        id: "med-note-" + med.id + "-" + note.id,
        date: noteDate,
        sortAt: timestampOf(note.recordedAt),
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
      date: entry.date,
      sortAt: timestampOf(entry.recordedAt),
      time: timeOf(entry.recordedAt),
      group: "Hidratação",
      title: entry.amountMl + " ml registrados",
      detail: [entry.notes, entry.recordedBy ? "Registrado por " + entry.recordedBy : "Oferta de água registrada pelo cuidador."].filter(Boolean).join(" · "),
      status: "Ingerido",
      tone: "positive",
    }));

    const routineGroups = {
      hidratacao: "Hidratação", alimentacao: "Alimentação", higiene: "Higiene",
      terapia: "Terapia", descanso: "Descanso", escola: "Escola",
      atividade: "Atividade", consulta: "Consulta", outro: "Outros cuidados",
    };
    legacyRoutineLogs.forEach((entry) => {
      const task = tasksById.get(entry.taskId);
      const quantity = entry.offeredAmount !== undefined
        ? "Oferecido: " + entry.offeredAmount + " " + (entry.unit ?? "") + " · Aceito: " + (entry.acceptedAmount ?? 0) + " " + (entry.unit ?? "")
        : "";
      result.push({
        id: "routine-" + entry.id,
        date: entry.date,
        sortAt: timestampOf(entry.completedAt),
        time: timeOf(entry.completedAt),
        group: task ? routineGroups[task.category] : "Rotina",
        title: task?.title ?? "Registro de cuidado",
        detail: [quantity, entry.notes].filter(Boolean).join(" · ") || "Registro de rotina.",
        status: entry.status === "nao_realizado" ? "Não realizado" : entry.status === "parcial" ? "Parcial" : "Concluído",
        tone: entry.status === "nao_realizado" ? "warning" : entry.status === "parcial" ? "neutral" : "positive",
      });
    });

    patientCareEvents.forEach((entry) => {
      const labels = { saude: "Alteração percebida na saúde", intercorrencia: "Intercorrência", observacao: "Observação geral" };
      result.push({
        id: "care-" + entry.id,
        date: dateOf(entry.recordedAt),
        sortAt: timestampOf(entry.recordedAt),
        time: timeOf(entry.recordedAt),
        group: entry.category === "intercorrencia" ? "Intercorrências" : "Acompanhamento",
        title: entry.title || labels[entry.category],
        detail: entry.description + (entry.recordedBy ? " · Registrado por " + entry.recordedBy : ""),
        status: labels[entry.category],
        tone: entry.category === "intercorrencia" ? "warning" : "neutral",
      });
    });

    return result.sort((a, b) => a.date.localeCompare(b.date) || a.sortAt - b.sortAt);
  }, [patientMeds, patientDoses, patientHydration, legacyRoutineLogs, tasksById, patientCareEvents, rangeStart, rangeEnd]);

  const entriesByDay = useMemo(() => {
    const grouped = new Map<string, ReportEntry[]>();
    entries.forEach((entry) => grouped.set(entry.date, [...(grouped.get(entry.date) ?? []), entry]));
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);

  const waterTotal = patientHydration.reduce((sum, item) => sum + item.amountMl, 0)
    + legacyRoutineLogs.filter((log) => tasksById.get(log.taskId)?.category === "hidratacao").reduce((sum, log) => sum + (log.acceptedAmount ?? 0), 0);
  const taken = patientDoses.filter((dose) => dose.status === "tomado").length;
  const missed = patientDoses.filter((dose) => dose.status === "nao_tomado").length;
  const pending = patientDoses.filter((dose) => dose.status === "pendente").length;
  const mealCount = legacyRoutineLogs.filter((log) => tasksById.get(log.taskId)?.category === "alimentacao").length;
  const noteCount = patientCareEvents.length + patientMeds.reduce((sum, med) => sum + (med.observations ?? []).filter((note) => dateInRange(dateOf(note.recordedAt), rangeStart, rangeEnd)).length, 0);
  const rangeLabel = reportMode === "day"
    ? dayLabel(selectedDate)
    : formatDate(rangeStart) + " até " + formatDate(rangeEnd);

  const addEvent = (event: FormEvent) => {
    event.preventDefault();
    if (!patient) return;
    if (!validRange || !dateInRange(eventDate, rangeStart, rangeEnd)) return setEventError("Escolha uma data dentro do período do relatório.");
    if (!eventTitle.trim() || !eventDescription.trim()) return setEventError("Informe um título e descreva o que aconteceu.");
    const localDateTime = new Date(eventDate + "T" + eventTime + ":00");
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

  if (!patients.length) return <section className={card}><h1 className="font-display text-2xl font-bold text-foreground">Relatório de acompanhamento</h1><p className="mt-2 text-sm text-muted-foreground">Cadastre um paciente para começar a reunir os registros.</p></section>;

  return (
    <main className="dc-daily-report-print mx-auto max-w-5xl space-y-5">
      <header className={card + " relative overflow-hidden"}>
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Acompanhamento do cuidado</p>
            <h1 className="mt-1 font-display text-3xl font-bold text-foreground">Relatório completo</h1>
            <p className="mt-1 text-sm text-muted-foreground">Histórico consolidado de medicamentos, hidratação, rotina e observações.</p>
            {patient && <div className="dc-report-print-meta mt-3 text-sm text-foreground"><p><strong>Paciente:</strong> {patient.name}</p><p><strong>Período:</strong> {rangeLabel}</p></div>}
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <button type="button" className={button} onClick={() => window.print()} disabled={!patient || !validRange}><Printer className="h-4 w-4" />Imprimir / PDF</button>
            {patient && <button type="button" className={primary} onClick={() => setShowEventForm((value) => !value)}><Plus className="h-4 w-4" />Novo registro</button>}
          </div>
        </div>

        <div className="no-print mt-5 space-y-3">
          <label className="block space-y-1.5 text-xs font-bold text-foreground">Paciente
            <select className={field} value={patientId} onChange={(event) => setPatientId(event.target.value)}>
              <option value="">Selecione um paciente</option>
              {patients.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-foreground">Formato do relatório</span>
            <div className="inline-flex rounded-xl border border-border bg-background p-1">
              <button type="button" onClick={() => setReportMode("day")} aria-pressed={reportMode === "day"} className={reportMode === "day" ? primary : button}>Um dia</button>
              <button type="button" onClick={() => setReportMode("period")} aria-pressed={reportMode === "period"} className={reportMode === "period" ? primary : button}>Faixa de dias</button>
            </div>
          </div>
          {reportMode === "day" ? (
            <label className="block max-w-sm space-y-1.5 text-xs font-bold text-foreground">Dia do relatório
              <input className={field} type="date" value={selectedDate} onChange={(event) => { setSelectedDate(event.target.value); setEventDate(event.target.value); }} required />
            </label>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs font-bold text-foreground">Data inicial
                <input className={field} type="date" value={startDate} max={endDate || undefined} onChange={(event) => {
                  const next = event.target.value;
                  setStartDate(next);
                  if (next && endDate && next > endDate) setEndDate(next);
                  setEventDate((current) => !current || current < next || current > endDate ? next : current);
                }} required />
              </label>
              <label className="space-y-1.5 text-xs font-bold text-foreground">Data final
                <input className={field} type="date" value={endDate} min={startDate || undefined} onChange={(event) => {
                  const next = event.target.value;
                  setEndDate(next);
                  setEventDate((current) => !current || current < startDate || current > next ? next : current);
                }} required />
              </label>
            </div>
          )}
          {!validRange && <p role="alert" className="text-xs font-semibold text-destructive">A data inicial precisa ser anterior ou igual à data final.</p>}
        </div>
      </header>

      {!patient && <section className={card + " text-center"}><ClipboardList className="mx-auto h-7 w-7 text-primary" /><h2 className="mt-2 font-display text-lg font-bold text-foreground">Escolha um paciente</h2><p className="mt-1 text-sm text-muted-foreground">Selecione a pessoa que deseja acompanhar para montar o relatório.</p></section>}

      {patient && validRange && <>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className={card}><p className="text-xs font-semibold text-muted-foreground">Doses administradas</p><p className="mt-2 font-display text-3xl font-bold text-foreground">{taken}</p><p className="text-[11px] text-muted-foreground">{missed} não tomadas · {pending} pendentes</p></div>
          <div className={card}><p className="text-xs font-semibold text-muted-foreground">Água registrada</p><p className="mt-2 font-display text-3xl font-bold text-foreground">{waterTotal}<span className="ml-1 text-xs">ml</span></p><p className="text-[11px] text-muted-foreground">{patientHydration.length} lançamentos rápidos</p></div>
          <div className={card}><p className="text-xs font-semibold text-muted-foreground">Refeições</p><p className="mt-2 font-display text-3xl font-bold text-foreground">{mealCount}</p><p className="text-[11px] text-muted-foreground">Registros no período</p></div>
          <div className={card}><p className="text-xs font-semibold text-muted-foreground">Cuidados de rotina</p><p className="mt-2 font-display text-3xl font-bold text-foreground">{legacyRoutineLogs.length}</p><p className="text-[11px] text-muted-foreground">Concluídos, parciais ou não realizados</p></div>
          <div className={card}><p className="text-xs font-semibold text-muted-foreground">Anotações e ocorrências</p><p className="mt-2 font-display text-3xl font-bold text-foreground">{noteCount}</p><p className="text-[11px] text-muted-foreground">Saúde e medicamentos</p></div>
        </section>

        {showEventForm && <form onSubmit={addEvent} className={card + " no-print space-y-3"}>
          <div className="flex items-center justify-between gap-2"><div><h2 className="font-bold text-foreground">Registrar acontecimento</h2><p className="text-xs text-muted-foreground">O registro será incluído na data escolhida, dentro do período.</p></div><button type="button" className={button} onClick={() => setShowEventForm(false)}>Fechar</button></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-xs font-bold text-foreground">Tipo de registro
              <select className={field} value={eventCategory} onChange={(event) => setEventCategory(event.target.value as CareEventCategory)}>
                <option value="observacao">Observação geral</option><option value="saude">Alteração percebida na saúde</option><option value="intercorrencia">Intercorrência</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-bold text-foreground">Data
              <input className={field} type="date" value={eventDate} min={rangeStart} max={rangeEnd} onChange={(event) => setEventDate(event.target.value)} required />
            </label>
            <label className="space-y-1 text-xs font-bold text-foreground">Horário
              <input className={field} type="time" value={eventTime} onChange={(event) => setEventTime(event.target.value)} required />
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
            <div><p className="text-xs font-bold uppercase tracking-wider text-primary">Histórico completo</p><h2 className="mt-1 font-display text-xl font-bold capitalize text-foreground">{rangeLabel}</h2><p className="text-xs text-muted-foreground">{patient.name} · {entries.length} lançamentos encontrados no período</p></div>
            <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">Dose Certa</span>
          </div>

          {entriesByDay.length ? <div className="space-y-5">
            {entriesByDay.map(([date, dayEntries]) => <div key={date} className="dc-report-day space-y-3">
              <h3 className="dc-report-day-title border-b border-border/60 pb-2 text-sm font-extrabold capitalize text-foreground">{dayLabel(date)} <span className="font-normal text-muted-foreground">· {dayEntries.length} {dayEntries.length === 1 ? "registro" : "registros"}</span></h3>
              <ol className="space-y-3">
                {dayEntries.map((entry) => <li key={entry.id} className="flex gap-3 rounded-2xl border border-border/70 bg-background/65 p-3 sm:p-4">
                  <div className="w-12 shrink-0 pt-0.5 text-sm font-extrabold tabular-nums text-foreground">{entry.time}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-extrabold uppercase tracking-wider text-primary">{entry.group}</span>{entry.status && <span className={"rounded-full px-2 py-0.5 text-[10px] font-bold " + (entry.tone === "positive" ? "bg-primary/10 text-primary" : entry.tone === "warning" ? "bg-amber-500/15 text-amber-800 dark:text-amber-200" : "bg-muted text-muted-foreground")}>{entry.status}</span>}</div>
                    <p className="mt-1 text-sm font-bold text-foreground">{entry.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{entry.detail}</p>
                  </div>
                </li>)}
              </ol>
            </div>)}
          </div> : <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center"><FileText className="mx-auto h-8 w-8 text-muted-foreground" /><h3 className="mt-3 font-display text-lg font-bold text-foreground">Nenhum registro neste período</h3><p className="mt-1 text-sm text-muted-foreground">Os medicamentos, cuidados e observações registrados dentro das datas escolhidas aparecerão aqui.</p></div>}

          <p className="border-t border-border/70 pt-3 text-[10px] leading-relaxed text-muted-foreground">Este relatório reúne informações registradas pelos cuidadores. Não substitui prontuário, avaliação profissional ou orientação clínica. Confira as informações antes de compartilhar ou imprimir.</p>
        </section>

        {patientMeds.length > 0 && <section className={card + " space-y-3"}>
          <div><p className="text-xs font-bold uppercase tracking-wider text-primary">Referência do paciente</p><h2 className="font-display text-lg font-bold text-foreground">Medicamentos cadastrados</h2><p className="text-xs text-muted-foreground">Lista atual dos medicamentos associados a este paciente, para contextualizar os registros do período.</p></div>
          <div className="grid gap-2 sm:grid-cols-2">
            {patientMeds.map((med) => <div key={med.id} className="rounded-xl border border-border/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-foreground">{med.name}</p><span className="text-[10px] font-semibold text-muted-foreground">{med.archivedAt ? "Arquivado" : "Ativo"}</span></div>
              <p className="mt-1 text-xs text-muted-foreground">{[med.dose, med.presentation].filter(Boolean).join(" · ")}</p>
              <p className="mt-1 text-xs text-muted-foreground">Horários: {(med.schedule?.map((slot) => slot.time) ?? med.times).join(", ") || "Não informados"}</p>
            </div>)}
          </div>
        </section>}

        {patientRoutineTasks.length > 0 && <section className={card + " space-y-3"}>
          <div><p className="text-xs font-bold uppercase tracking-wider text-primary">Organização do cuidado</p><h2 className="font-display text-lg font-bold text-foreground">Rotinas cadastradas</h2><p className="text-xs text-muted-foreground">Programação atual associada ao paciente; os resultados realizados estão detalhados na linha do tempo.</p></div>
          <div className="grid gap-2 sm:grid-cols-2">
            {patientRoutineTasks.map((task) => <div key={task.id} className="rounded-xl border border-border/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-foreground">{task.title}</p><span className="text-[10px] font-semibold text-muted-foreground">{task.enabled ? "Ativa" : "Pausada"}</span></div>
              <p className="mt-1 text-xs text-muted-foreground">{task.time} · {task.weekdays.map((day) => weekdayNames[day] ?? String(day)).join(", ") || "Sem dias definidos"}</p>
              {task.description && <p className="mt-1 text-xs text-muted-foreground">{task.description}</p>}
            </div>)}
          </div>
        </section>}
      </>}
    </main>
  );
}
