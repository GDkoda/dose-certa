import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft, CalendarDays, Check, CheckCircle2, CircleMinus, Clock3, Droplets,
  Heart, ListChecks, Pencil, Plus, Sparkles, Utensils, X,
} from "lucide-react";
import {
  setState, uid, useStore,
  type RoutineCategory, type RoutineTask, type RoutineLog, type User,
} from "@/lib/store";

const field = "min-h-11 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";
const primaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";
const quietButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted";
const categories: { id: RoutineCategory; label: string; emoji: string }[] = [
  { id: "hidratacao", label: "Hidratação", emoji: "💧" },
  { id: "alimentacao", label: "Alimentação", emoji: "🥣" },
  { id: "higiene", label: "Higiene", emoji: "🛁" },
  { id: "terapia", label: "Terapia", emoji: "🧩" },
  { id: "descanso", label: "Descanso", emoji: "🌙" },
  { id: "escola", label: "Escola", emoji: "🎒" },
  { id: "atividade", label: "Atividade", emoji: "🎨" },
  { id: "consulta", label: "Consulta", emoji: "🩺" },
  { id: "outro", label: "Outro", emoji: "✨" },
];
const days = [{ label: "D", value: 0 }, { label: "S", value: 1 }, { label: "T", value: 2 }, { label: "Q", value: 3 }, { label: "Q", value: 4 }, { label: "S", value: 5 }, { label: "S", value: 6 }];
const dateKey = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
const categoryInfo = (category: RoutineCategory) => categories.find((item) => item.id === category) ?? { id: "outro" as RoutineCategory, label: "Outro", emoji: "✨" };
const todayLabel = (value: string) => new Date(value + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

type TimelineItem =
  | { key: string; kind: "medication"; title: string; time: string; description: string; status: string; }
  | { key: string; kind: "task"; title: string; task: RoutineTask; time: string; log?: RoutineLog };

export function RoutineCare({ me, patientId, onBack, onOpenMedicines, onSelectPatient }: {
  me: User; patientId: string; onBack: () => void; onOpenMedicines: () => void; onSelectPatient: (patientId: string) => void;
}) {
  const patients = useStore((state) => state.patients.filter((patient) => me.role === "mestre" || patient.ownerId === me.id));
  const meds = useStore((state) => state.meds);
  const doses = useStore((state) => state.doses);
  const routines = useStore((state) => state.routines);
  const logs = useStore((state) => state.routineLogs);
  const settings = useStore((state) => state.routineSettings);
  const [selectedPatientId, setSelectedPatientId] = useState(patientId);
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [visualMode, setVisualMode] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<RoutineCategory>("atividade");
  const [time, setTime] = useState("09:00");
  const [description, setDescription] = useState("");
  const [pictogram, setPictogram] = useState("🎨");
  const [weekdays, setWeekdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [formError, setFormError] = useState("");
  const [logTask, setLogTask] = useState<RoutineTask | null>(null);
  const [offered, setOffered] = useState("200");
  const [accepted, setAccepted] = useState("200");
  const [amountUnit, setAmountUnit] = useState("porção");
  const [logNotes, setLogNotes] = useState("");
  const [logError, setLogError] = useState("");
  const [goalDraft, setGoalDraft] = useState("");

  useEffect(() => { setSelectedPatientId(patientId); }, [patientId]);
  const patient = patients.find((item) => item.id === selectedPatientId);
  const patientMeds = meds.filter((med) => med.patientId === selectedPatientId && !med.archivedAt && (me.role === "mestre" || med.ownerId === me.id));
  const patientTasks = routines.filter((task) => task.patientId === selectedPatientId && (me.role === "mestre" || task.ownerId === me.id));
  const patientLogs = logs.filter((log) => log.patientId === selectedPatientId && (me.role === "mestre" || log.ownerId === me.id));
  const patientSetting = settings.find((setting) => setting.patientId === selectedPatientId);
  const waterGoal = patientSetting?.dailyWaterGoalMl ?? 0;

  useEffect(() => { setGoalDraft(waterGoal ? String(waterGoal) : ""); }, [selectedPatientId, waterGoal]);

  const currentDate = new Date(selectedDate + "T12:00:00");
  const currentLogs = patientLogs.filter((log) => log.date === selectedDate);
  const currentTasks = patientTasks
    .filter((task) => task.enabled && task.weekdays.includes(currentDate.getDay()))
    .sort((a, b) => a.time.localeCompare(b.time));

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    patientMeds.forEach((med) => {
      (med.times ?? []).forEach((medTime, index) => {
        const dose = doses.find((entry) => entry.medId === med.id
          && dateKey(new Date(entry.scheduledAt)) === selectedDate
          && new Date(entry.scheduledAt).toTimeString().slice(0, 5) === medTime);
        items.push({
          key: "med-" + med.id + "-" + medTime + "-" + index,
          kind: "medication",
          title: med.name,
          time: medTime,
          description: med.dose,
          status: dose?.status ?? "pendente",
        });
      });
    });
    currentTasks.forEach((task) => {
      items.push({
        key: task.id,
        kind: "task",
        title: task.title,
        task,
        time: task.time,
        log: currentLogs.find((log) => log.taskId === task.id),
      });
    });
    return items.sort((a, b) => a.time.localeCompare(b.time));
  }, [patientMeds, doses, selectedDate, currentTasks, currentLogs]);

  const waterAccepted = currentLogs
    .filter((log) => patientTasks.find((task) => task.id === log.taskId)?.category === "hidratacao")
    .reduce((total, log) => total + (log.acceptedAmount ?? 0), 0);
  const mealsLogged = currentLogs.filter((log) => patientTasks.find((task) => task.id === log.taskId)?.category === "alimentacao").length;
  const completed = timeline.filter((item) => item.kind === "medication"
    ? item.status === "tomado"
    : item.log?.status === "concluido" || item.log?.status === "parcial").length;
  const progress = timeline.length ? Math.round((completed / timeline.length) * 100) : 0;
  const pendingTimeline = timeline.filter((item) => item.kind === "medication" ? item.status === "pendente" : !item.log || item.log.status === "pendente");
  const nextItem = pendingTimeline[0];
  const afterItem = pendingTimeline[1];
  const waterPercent = waterGoal > 0 ? Math.min(100, Math.round((waterAccepted / waterGoal) * 100)) : 0;

  const resetForm = () => {
    setTitle("");
    setCategory("atividade");
    setTime("09:00");
    setDescription("");
    setPictogram("🎨");
    setWeekdays([0, 1, 2, 3, 4, 5, 6]);
    setEditingTaskId(null);
    setFormError("");
  };

  const submitTask = (event: FormEvent) => {
    event.preventDefault();
    if (!patient) return;
    if (!title.trim()) return setFormError("Dê um nome para esta atividade.");
    if (!weekdays.length) return setFormError("Selecione pelo menos um dia da semana.");
    if (editingTaskId) {
      setState((state) => ({
        ...state,
        routines: state.routines.map((task) => task.id === editingTaskId
          ? { ...task, title: title.trim(), category, time, description: description.trim(), pictogram: pictogram.trim() || categoryInfo(category).emoji, weekdays }
          : task),
      }));
    } else {
      const task: RoutineTask = {
        id: uid(), patientId: patient.id, ownerId: patient.ownerId, title: title.trim(),
        category, time, description: description.trim(), pictogram: pictogram.trim() || categoryInfo(category).emoji,
        weekdays, enabled: true,
      };
      setState((state) => ({ ...state, routines: [...state.routines, task] }));
    }
    resetForm();
    setShowForm(false);
  };

  const beginEdit = (task: RoutineTask) => {
    setEditingTaskId(task.id);
    setTitle(task.title);
    setCategory(task.category);
    setTime(task.time);
    setDescription(task.description);
    setPictogram(task.pictogram);
    setWeekdays(task.weekdays);
    setFormError("");
    setShowForm(true);
  };

  const saveLog = (event: FormEvent) => {
    event.preventDefault();
    if (!patient || !logTask) return;
    const offeredNumber = Number(offered);
    const acceptedNumber = Number(accepted);
    if (!Number.isFinite(offeredNumber) || !Number.isFinite(acceptedNumber) || offeredNumber < 0 || acceptedNumber < 0 || acceptedNumber > offeredNumber) {
      return setLogError("Confira as quantidades: o valor aceito não pode superar o oferecido.");
    }
    const status: RoutineLog["status"] = acceptedNumber === 0 ? "nao_realizado" : acceptedNumber < offeredNumber ? "parcial" : "concluido";
    const entry: RoutineLog = {
      id: patientLogs.find((log) => log.taskId === logTask.id && log.date === selectedDate)?.id ?? uid(),
      patientId: patient.id, ownerId: patient.ownerId, taskId: logTask.id, date: selectedDate,
      status, offeredAmount: offeredNumber, acceptedAmount: acceptedNumber,
      unit: logTask.category === "hidratacao" ? "ml" : amountUnit,
      notes: logNotes.trim(), completedAt: new Date().toISOString(),
    };
    setState((state) => ({
      ...state,
      routineLogs: [
        ...state.routineLogs.filter((log) => !(log.taskId === logTask.id && log.date === selectedDate)),
        entry,
      ],
    }));
    setLogTask(null);
    setLogError("");
    setLogNotes("");
  };

  const markTask = (task: RoutineTask, status: RoutineLog["status"]) => {
    if (!patient) return;
    if (task.category === "hidratacao" || task.category === "alimentacao") {
      setOffered(task.category === "hidratacao" ? "200" : "1");
      setAccepted(task.category === "hidratacao" ? "200" : "1");
      setAmountUnit("porção");
      setLogNotes("");
      setLogError("");
      setLogTask(task);
      if (status === "nao_realizado") setAccepted("0");
      return;
    }
    const existing = patientLogs.find((log) => log.taskId === task.id && log.date === selectedDate);
    const entry: RoutineLog = {
      id: existing?.id ?? uid(), patientId: patient.id, ownerId: patient.ownerId,
      taskId: task.id, date: selectedDate, status, notes: "", completedAt: new Date().toISOString(),
    };
    setState((state) => ({
      ...state,
      routineLogs: [...state.routineLogs.filter((log) => !(log.taskId === task.id && log.date === selectedDate)), entry],
    }));
  };

  const saveGoal = () => {
    if (!patient) return;
    const value = goalDraft.trim() === "" ? undefined : Number(goalDraft);
    if (value !== undefined && (!Number.isFinite(value) || value < 1 || value > 10000)) return;
    const updated = { id: patient.id, patientId: patient.id, ownerId: patient.ownerId, ...(value ? { dailyWaterGoalMl: value } : {}) };
    setState((state) => ({
      ...state,
      routineSettings: [
        ...state.routineSettings.filter((setting) => setting.patientId !== patient.id),
        updated,
      ],
    }));
  };

  const openLog = (task: RoutineTask) => {
    setOffered(task.category === "hidratacao" ? "200" : "1");
    setAccepted(task.category === "hidratacao" ? "200" : "1");
    setAmountUnit("porção");
    setLogNotes("");
    setLogError("");
    setLogTask(task);
  };

  if (!patient) {
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <button type="button" onClick={onBack} className={quietButton}><ArrowLeft className="h-4 w-4" />Voltar para pacientes</button>
        <section className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><CalendarDays className="h-7 w-7" /></div>
          <h1 className="font-display text-2xl font-bold text-foreground">Rotina e cuidados</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">Escolha um paciente para organizar a agenda visual, registrar alimentação e acompanhar a hidratação.</p>
          <select className={field + " mt-5 max-w-md"} aria-label="Escolher paciente" value={selectedPatientId} onChange={(event) => { setSelectedPatientId(event.target.value); onSelectPatient(event.target.value); }}>
            <option value="">Selecione um paciente</option>
            {patients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          {patients.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Cadastre um paciente antes de montar uma rotina.</p>}
        </section>
      </div>
    );
  }

  if (visualMode) {
    return (
      <div className="mx-auto min-h-[70vh] max-w-5xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-primary">Modo visual</p>
            <h1 className="font-display text-3xl font-bold text-foreground">{patient.name}</h1>
            <p className="mt-1 text-sm capitalize text-muted-foreground">{todayLabel(selectedDate)}</p>
          </div>
          <button type="button" className={quietButton} onClick={() => setVisualMode(false)}><X className="h-4 w-4" />Sair do modo visual</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[1.75rem] border border-primary/20 bg-primary/[0.07] p-5">
            <p className="text-xs font-extrabold uppercase tracking-wider text-primary">Agora</p>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-4xl">{nextItem?.kind === "task" ? nextItem.task.pictogram : "💊"}</span>
              <div><p className="font-display text-xl font-bold text-foreground">{nextItem?.title ?? "Rotina livre"}</p><p className="text-sm text-muted-foreground">{nextItem ? nextItem.time : "Nenhuma atividade pendente"}</p></div>
            </div>
          </div>
          <div className="rounded-[1.75rem] border border-border bg-card p-5">
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Depois</p>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-4xl">{afterItem?.kind === "task" ? afterItem.task.pictogram : afterItem ? "💊" : "🌿"}</span>
              <div><p className="font-display text-xl font-bold text-foreground">{afterItem?.title ?? "Sem próxima atividade"}</p><p className="text-sm text-muted-foreground">{afterItem?.time ?? "Agenda em dia"}</p></div>
            </div>
          </div>
          <div className="rounded-[1.75rem] border border-border bg-card p-5">
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Seu dia até aqui</p>
            <p className="mt-2 font-display text-3xl font-bold text-foreground">{progress}%</p>
            <p className="text-sm text-muted-foreground">{completed} de {timeline.length} atividades concluídas</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: progress + "%" }} /></div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {timeline.map((item) => {
            const done = item.kind === "medication" ? item.status === "tomado" : item.log?.status === "concluido" || item.log?.status === "parcial";
            return (
              <article key={item.key} className={"rounded-[1.7rem] border p-5 shadow-sm transition " + (done ? "border-primary/30 bg-primary/[0.05]" : "border-border bg-card")}>
                <div className="flex items-start justify-between gap-2"><span className="text-4xl">{item.kind === "medication" ? "💊" : item.task.pictogram}</span><span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">{item.time}</span></div>
                <h2 className="mt-4 font-display text-xl font-bold text-foreground">{item.title}</h2>
                <p className="mt-1 min-h-10 text-sm text-muted-foreground">{item.kind === "medication" ? item.description : item.task.description || categoryInfo(item.task.category).label}</p>
                {item.kind === "medication" ? <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">{done ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Clock3 className="h-4 w-4" />}{done ? "Concluído no controle de medicamentos" : "Acompanhar em medicamentos"}</span>
                  : <button type="button" onClick={() => item.log ? openLog(item.task) : markTask(item.task, "concluido")} className={done ? quietButton + " mt-3 w-full" : primaryButton + " mt-3 w-full"}>{done ? <><CheckCircle2 className="h-4 w-4" />Ver registro</> : <><Check className="h-4 w-4" />Concluir atividade</>}</button>}
              </article>
            );
          })}
        </div>
        {timeline.length === 0 && <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">A rotina ainda está vazia. O cuidador pode adicionar atividades na agenda.</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="relative overflow-hidden rounded-[2rem] border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-primary/5 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground transition hover:text-primary"><ArrowLeft className="h-4 w-4" />Pacientes</button>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-primary">Planejamento do cuidado</p>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Rotina de {patient.name}</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Uma visão clara do que acontece ao longo do dia, com registros simples para cada cuidado.</p>
          </div>
          <button type="button" className={quietButton} onClick={() => setVisualMode(true)}><Sparkles className="h-4 w-4 text-primary" />Modo visual</button>
        </div>
        <div className="relative mt-6 grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/70 bg-background/75 p-3.5">
            <p className="text-xs font-semibold text-muted-foreground">Atividades concluídas</p>
            <p className="mt-1 font-display text-2xl font-bold text-foreground">{completed}<span className="ml-1 text-sm font-medium text-muted-foreground">/ {timeline.length}</span></p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/75 p-3.5">
            <p className="text-xs font-semibold text-muted-foreground">Água aceita hoje</p>
            <p className="mt-1 font-display text-2xl font-bold text-foreground">{waterAccepted}<span className="ml-1 text-sm font-medium text-muted-foreground">ml</span></p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/75 p-3.5">
            <p className="text-xs font-semibold text-muted-foreground">Refeições registradas</p>
            <p className="mt-1 font-display text-2xl font-bold text-foreground">{mealsLogged}</p>
          </div>
        </div>
        <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: progress + "%" }} /></div>
        <div className="relative mt-1 flex justify-between text-[10px] font-semibold text-muted-foreground"><span>Progresso da agenda</span><span>{progress}%</span></div>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(290px,.75fr)]">
        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-display text-xl font-bold text-foreground">Agenda visual</h2><p className="text-xs text-muted-foreground">Medicamentos já cadastrados e atividades personalizadas.</p></div>
            <div className="flex gap-2">
              <input aria-label="Dia da agenda" type="date" className={field + " min-h-10 w-auto max-w-[155px] text-xs"} value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
              <button type="button" className={primaryButton + " px-3"} onClick={() => { resetForm(); setShowForm((value) => !value); }}><Plus className="h-4 w-4" />Nova atividade</button>
            </div>
          </div>

          {showForm && (
            <form onSubmit={submitTask} className="space-y-4 rounded-[1.6rem] border border-primary/25 bg-primary/[0.035] p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-2"><div><h3 className="font-bold text-foreground">{editingTaskId ? "Editar atividade" : "Montar atividade"}</h3><p className="text-xs text-muted-foreground">Defina como ela aparece na rotina.</p></div><button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted" aria-label="Fechar"><X className="h-4 w-4" /></button></div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px]">
                <label className="space-y-1.5 text-xs font-bold text-foreground">Nome da atividade<input className={field} maxLength={70} placeholder="Ex.: Lanche da manhã" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
                <label className="space-y-1.5 text-xs font-bold text-foreground">Horário<input type="time" className={field} value={time} onChange={(event) => setTime(event.target.value)} /></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-xs font-bold text-foreground">Categoria<select className={field} value={category} onChange={(event) => { const value = event.target.value as RoutineCategory; setCategory(value); setPictogram(categoryInfo(value).emoji); }}>{categories.map((item) => <option key={item.id} value={item.id}>{item.emoji} {item.label}</option>)}</select></label>
                <label className="space-y-1.5 text-xs font-bold text-foreground">Pictograma / emoji<input className={field} maxLength={8} value={pictogram} onChange={(event) => setPictogram(event.target.value)} /></label>
              </div>
              <label className="block space-y-1.5 text-xs font-bold text-foreground">Orientação ou descrição<textarea className={field + " min-h-20 resize-y"} rows={2} maxLength={240} placeholder="Ex.: oferecer água no copo azul, sentado à mesa..." value={description} onChange={(event) => setDescription(event.target.value)} /></label>
              <div><p className="mb-2 text-xs font-bold text-foreground">Repetir nos dias</p><div className="flex flex-wrap gap-2">{days.map((day) => <button type="button" key={day.value} onClick={() => setWeekdays((value) => value.includes(day.value) ? value.filter((item) => item !== day.value) : [...value, day.value].sort())} aria-pressed={weekdays.includes(day.value)} className={"grid h-10 w-10 place-items-center rounded-xl border text-xs font-bold transition " + (weekdays.includes(day.value) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground")}>{day.label}</button>)}</div></div>
              {formError && <p role="alert" className="text-xs font-semibold text-destructive">{formError}</p>}
              <div className="flex flex-wrap justify-end gap-2"><button type="button" className={quietButton} onClick={() => { setShowForm(false); resetForm(); }}>Cancelar</button><button type="submit" className={primaryButton}><Check className="h-4 w-4" />{editingTaskId ? "Salvar atividade" : "Adicionar à rotina"}</button></div>
            </form>
          )}

          <div className="overflow-hidden rounded-[1.7rem] border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-muted/25 px-4 py-3 sm:px-5">
              <div><p className="text-sm font-bold capitalize text-foreground">{todayLabel(selectedDate)}</p><p className="text-[11px] text-muted-foreground">{timeline.length} atividades programadas</p></div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-extrabold text-primary">{completed} concluídas</span>
            </div>
            {timeline.length ? <div className="divide-y divide-border/70">
              {timeline.map((item) => {
                const done = item.kind === "medication" ? item.status === "tomado" : item.log?.status === "concluido" || item.log?.status === "parcial";
                const task = item.kind === "task" ? item.task : null;
                const info = task ? categoryInfo(task.category) : null;
                return (
                  <article key={item.key} className="flex min-w-0 items-center gap-3 px-4 py-3.5 transition hover:bg-muted/25 sm:px-5">
                    <div className="w-12 shrink-0 text-center"><p className="text-sm font-extrabold tabular-nums text-foreground">{item.time}</p></div>
                    <div className={"grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl " + (done ? "bg-primary/10" : "bg-muted/75")}>{task?.pictogram ?? "💊"}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{task ? (task.description || info?.label) : item.description}</p>
                      {task && item.log && <p className="mt-1 text-[10px] font-semibold text-muted-foreground">{item.log.offeredAmount !== undefined ? "Oferecido: " + item.log.offeredAmount + " " + item.log.unit + " · Aceito: " + item.log.acceptedAmount + " " + item.log.unit : item.log.status === "nao_realizado" ? "Não realizado" : "Registrado"}</p>}
                    </div>
                    {item.kind === "medication" ? <span className={"shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold " + (done ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{done ? "Tomado" : "Medicamento"}</span>
                      : <div className="flex shrink-0 items-center gap-1">
                        <button type="button" title={item.log ? "Editar registro" : "Registrar atividade"} aria-label={item.log ? "Editar registro de " + task?.title : "Registrar " + task?.title} onClick={() => task && (task.category === "hidratacao" || task.category === "alimentacao" ? openLog(task) : markTask(task, "concluido"))} className={"grid h-9 w-9 place-items-center rounded-xl transition " + (done ? "bg-primary/10 text-primary hover:bg-primary/15" : "bg-muted text-foreground hover:bg-primary/10 hover:text-primary")}>{done ? <CheckCircle2 className="h-4 w-4" /> : <Check className="h-4 w-4" />}</button>
                        <button type="button" title="Marcar como não realizada" aria-label={"Marcar " + task?.title + " como não realizada"} onClick={() => task && markTask(task, "nao_realizado")} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-amber-500/10 hover:text-amber-700"><CircleMinus className="h-4 w-4" /></button>
                        <button type="button" title="Editar atividade" aria-label={"Editar " + task?.title} onClick={() => task && beginEdit(task)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                        <button type="button" title="Remover atividade" aria-label={"Remover " + task?.title} onClick={() => task && window.confirm("Remover esta atividade da rotina? Os registros anteriores serão preservados.") && setState((state) => ({ ...state, routines: state.routines.filter((entry) => entry.id !== task.id) }))} className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><X className="h-4 w-4" /></button>
                      </div>}
                  </article>
                );
              })}
            </div> : <div className="px-5 py-12 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><CalendarDays className="h-7 w-7" /></span><h3 className="mt-4 font-display text-lg font-bold text-foreground">Um dia com espaço para organizar</h3><p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Adicione alimentação, hidratação, higiene, terapias e outras atividades. Os medicamentos cadastrados aparecem automaticamente.</p><button type="button" className={primaryButton + " mt-4"} onClick={() => setShowForm(true)}><Plus className="h-4 w-4" />Criar primeira atividade</button></div>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><Heart className="h-4 w-4" /></span><div><p className="text-sm font-bold text-foreground">Medicamentos conectados</p><p className="text-xs text-muted-foreground">Os horários vêm do cadastro de medicamentos.</p></div></div>
            <button type="button" className={quietButton} onClick={onOpenMedicines}>Abrir medicamentos</button>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-[1.7rem] border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-300"><Droplets className="h-5 w-5" /></span><div><h2 className="font-display text-lg font-bold text-foreground">Hidratação</h2><p className="text-xs text-muted-foreground">Acompanhamento diário</p></div></div>
            <div className="mt-5 flex items-end justify-between gap-3"><p className="font-display text-3xl font-bold text-foreground">{waterAccepted}<span className="ml-1 text-sm font-semibold text-muted-foreground">ml aceitos</span></p><span className="text-xs font-bold text-muted-foreground">{waterGoal ? waterPercent + "%" : "Sem meta"}</span></div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: waterPercent + "%" }} /></div>
            <label className="mt-4 block space-y-1.5 text-xs font-bold text-foreground">Meta diária definida pelo responsável (ml)<input type="number" min="1" max="10000" step="50" className={field} placeholder="Ex.: 1500" value={goalDraft} onChange={(event) => setGoalDraft(event.target.value)} /></label>
            <button type="button" className={quietButton + " mt-2 w-full"} onClick={saveGoal}>Salvar meta de hidratação</button>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">A meta é definida pelo cuidador ou profissional responsável. O aplicativo registra os volumes, sem prescrever uma quantidade ideal.</p>
          </section>

          <section className="rounded-[1.7rem] border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-300"><Utensils className="h-5 w-5" /></span><div><h2 className="font-display text-lg font-bold text-foreground">Alimentação</h2><p className="text-xs text-muted-foreground">Oferecido x aceito</p></div></div>
            <div className="mt-4 space-y-2 text-sm"><div className="flex items-center justify-between"><span className="text-muted-foreground">Registros de hoje</span><strong className="text-foreground">{mealsLogged}</strong></div><div className="flex items-center justify-between"><span className="text-muted-foreground">Refeições programadas</span><strong className="text-foreground">{currentTasks.filter((task) => task.category === "alimentacao").length}</strong></div></div>
            <p className="mt-3 rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">Ao registrar uma refeição, informe quanto foi oferecido e quanto a pessoa aceitou. Recusas parciais também ficam no histórico.</p>
          </section>

          <section className="rounded-[1.7rem] border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-primary" /><h2 className="font-display text-lg font-bold text-foreground">Resumo dos registros</h2></div>
            <div className="mt-4 space-y-3">
              {[
                { label: "Atividades concluídas", value: String(completed) + " / " + timeline.length },
                { label: "Hidratação aceita", value: waterAccepted + " ml" },
                { label: "Refeições registradas", value: String(mealsLogged) },
                { label: "Registros parciais", value: String(currentLogs.filter((log) => log.status === "parcial").length) },
              ].map((item) => <div key={item.label} className="flex items-center justify-between gap-3 border-b border-border/70 pb-2 last:border-0 last:pb-0"><span className="text-xs text-muted-foreground">{item.label}</span><strong className="text-sm tabular-nums text-foreground">{item.value}</strong></div>)}
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">Os registros são separados por paciente e por data. Selecione outro dia na agenda para consultar o histórico.</p>
          </section>

          {patients.length > 1 && <label className="block space-y-1.5 text-xs font-bold text-foreground">Trocar paciente<select className={field} value={selectedPatientId} onChange={(event) => { setSelectedPatientId(event.target.value); onSelectPatient(event.target.value); }}>{patients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        </aside>
      </div>

      {logTask && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-foreground/55 p-3 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLogTask(null); }}>
          <form role="dialog" aria-modal="true" aria-labelledby="routine-log-title" onSubmit={saveLog} className="my-auto w-full max-w-md space-y-4 rounded-[1.7rem] border border-border bg-card p-5 text-card-foreground shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-2xl">{logTask.pictogram}</span><div><h2 id="routine-log-title" className="font-display text-xl font-bold text-foreground">Registrar {categoryInfo(logTask.category).label.toLocaleLowerCase("pt-BR")}</h2><p className="text-xs text-muted-foreground">{logTask.title} · {selectedDate.split("-").reverse().join("/")}</p></div></div><button type="button" onClick={() => setLogTask(null)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted" aria-label="Fechar"><X className="h-4 w-4" /></button></div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5 text-xs font-bold text-foreground">Quantidade oferecida<input autoFocus type="number" min="0" step="any" className={field} value={offered} onChange={(event) => setOffered(event.target.value)} /></label>
              <label className="space-y-1.5 text-xs font-bold text-foreground">Quantidade aceita<input type="number" min="0" step="any" className={field} value={accepted} onChange={(event) => setAccepted(event.target.value)} /></label>
            </div>
            {logTask.category === "alimentacao" && <label className="block space-y-1.5 text-xs font-bold text-foreground">Unidade de medida<select className={field} value={amountUnit} onChange={(event) => setAmountUnit(event.target.value)}><option value="porção">Porção</option><option value="g">Gramas (g)</option><option value="unidade">Unidade</option><option value="ml">Mililitros (ml)</option></select></label>}
            <p className="text-[11px] text-muted-foreground">{logTask.category === "hidratacao" ? "Volumes em mililitros (ml)." : "Informe o alimento ou a refeição nas observações e mantenha a mesma unidade ao comparar as quantidades."}</p>
            <label className="block space-y-1.5 text-xs font-bold text-foreground">Alimentos oferecidos / observações<textarea rows={3} className={field + " min-h-20 resize-y"} placeholder="Ex.: aceitou melhor com o copo azul..." value={logNotes} onChange={(event) => setLogNotes(event.target.value)} /></label>
            {logError && <p role="alert" className="text-xs font-semibold text-destructive">{logError}</p>}
            <div className="flex flex-wrap justify-end gap-2"><button type="button" className={quietButton} onClick={() => { setAccepted("0"); }}>Aceitou 0</button><button type="button" className={quietButton} onClick={() => setLogTask(null)}>Cancelar</button><button type="submit" className={primaryButton}><Check className="h-4 w-4" />Salvar registro</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
