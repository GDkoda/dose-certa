import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Activity, AlarmClock, Archive, ArrowRight, Bell, BellRing, BookOpen, CalendarDays, Camera, CheckCircle2, ClipboardList, Clock3, Download, Headphones, History, Home, ImagePlus, LifeBuoy, LogOut, Moon, Pencil, PillBottle,
  CloudOff, CloudUpload, Pill, Plus, Palette as PaletteIcon, Printer, Shield, ShieldCheck, Smartphone, Sun, Trash2, UserRound, Users, UsersRound, Vibrate, Wifi, X,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { AccountAdmin } from "./AccountAdmin";
import { TicketManagement } from "./TicketManagement";
import { registerPushDevice, sendTestPush } from "@/lib/push.functions";
import { enablePush, registerAppServiceWorker } from "@/lib/push-browser";
import { removePushDevice } from "@/lib/push.functions";
import { DeviceSetupAssistant } from "./DeviceSetupAssistant";
import { PatientIdentityCard } from "./PatientIdentityCard";
import { RoutineCare } from "./RoutineCare";
import { SupportPage } from "./SupportPage";
import { DoseCertaMark } from "./DoseCertaMark";
import { getOfflineStatus, readOfflinePackage, requestPersistentOfflineStorage } from "@/lib/offline-cache";
import { useInstallPrompt } from "@/lib/install-prompt";
import { registerAccount, finishPasswordChange } from "@/lib/accounts.functions";
import { confirmDoseTaken } from "@/lib/dose.functions";
import { cloudLogin, cloudLogout, initializeCloud, onCloudError, refreshCloud, updateOwnPassword } from "@/lib/cloud-store";
import { buildMissingDoses, findDueDose } from "@/lib/alarm-rules";
import { estimateStockDays, stockLevel } from "@/lib/stock-rules";
import { summarizeDoseStatuses } from "@/lib/report-rules";
import {
  canAddPatient, getState, MAX_PATIENTS, RESET_PASSWORD, setState, SNOOZE_MIN, uid, useStore,
  type Dose, type DosePeriod, type DoseSchedule, type Med, type Role, type User,
} from "@/lib/store";

/* ---------------- helpers ---------------- */
const DOSE_PERIODS: { value: DosePeriod; label: string }[] = [
  { value: "manhã", label: "Manhã" }, { value: "tarde", label: "Tarde" }, { value: "noite", label: "Noite" }, { value: "madrugada", label: "Madrugada" },
  { value: "antes-almoco", label: "Antes do almoço" }, { value: "depois-almoco", label: "Depois do almoço" },
  { value: "antes-jantar", label: "Antes do jantar" }, { value: "depois-jantar", label: "Depois do jantar" },
  { value: "personalizado", label: "Personalizado" },
];
const DEFAULT_TIMES = ["08:00", "14:00", "20:00", "02:00", "11:00", "17:00"];
const DEFAULT_PERIODS: DosePeriod[] = ["manhã", "tarde", "noite", "madrugada", "personalizado", "personalizado"];
const STRENGTH_UNITS = ["mg", "g", "mcg", "mL", "mg/mL", "UI", "%", "gotas"];
const PRESENTATIONS = ["Comprimido", "Cápsula", "Drágea", "Solução oral", "Suspensão", "Gotas", "Sachê", "Ampola", "Spray", "Creme", "Pomada", "Outro"];
const QUANTITY_UNITS = ["Comprimido(s)", "Cápsula(s)", "Drágea(s)", "mL", "Gota(s)", "Sachê(s)", "Ampola(s)", "Jato(s)", "Aplicação(ões)", "Unidade(s)"];
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const fmtDate = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const csvCell = (value: string) => {
  const safe = /^[=+@\-\t\r]/.test(value) ? "'" + value : value;
  return `"${safe.replace(/"/g, '""')}"`;
};
const cls = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");
const btn = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50";
const btnPrimary = `${btn} bg-primary text-primary-foreground hover:opacity-90`;
const btnLavender = `${btn} bg-secondary text-secondary-foreground hover:opacity-90`;
const btnOutline = `${btn} border border-border bg-card text-foreground hover:bg-muted`;
const input = "w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";
const card = "dc-surface-texture rounded-[1.5rem] border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)]";

function useMe(): User | null {
  return useStore((s) => s.users.find((u) => u.id === s.sessionId) ?? null);
}

function EmptyState({ icon, title, description, actionLabel, onAction }: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <section className="rounded-[1.5rem] border border-dashed border-primary/30 bg-primary/[0.035] px-5 py-7 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span>
      <h2 className="mt-3 font-display text-lg font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      <button type="button" onClick={onAction} className={cls(btnPrimary, "mt-4 rounded-full")}>
        {actionLabel}<ArrowRight className="h-4 w-4" />
      </button>
    </section>
  );
}

/* ---------------- master inline editing ---------------- */
function T({ k, children, as: Tag = "span", className }: { k: string; children: string; as?: "span" | "h1" | "h2" | "h3" | "p"; className?: string }) {
  const text = useStore((s) => s.texts[k]) ?? children;
  const me = useMe();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(text);
  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input autoFocus className="rounded-md border border-input bg-card px-2 py-0.5 text-sm text-foreground" value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { setState((s) => ({ ...s, texts: { ...s.texts, [k]: val } })); setEditing(false); } if (e.key === "Escape") setEditing(false); }} />
        <button className="text-xs font-bold text-primary" onClick={() => { setState((s) => ({ ...s, texts: { ...s.texts, [k]: val } })); setEditing(false); }}>OK</button>
      </span>
    );
  }
  return (
    <Tag className={className}>
      {text}
      {me?.role === "mestre" && (
        <button aria-label="Editar texto" onClick={() => { setVal(text); setEditing(true); }} className="no-print ml-1 inline-flex align-middle opacity-40 hover:opacity-100">
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </Tag>
  );
}
type GeometricVariant = "dense" | "sparse";

type GeometryTile = { x: number; y: number; size: number; opacity: number; rotation: number };

function createGeometryTiles(variant: GeometricVariant): GeometryTile[] {
  const tiles: GeometryTile[] = [];
  for (let row = 0; row < 12; row += 1) {
    for (let column = 0; column < 12; column += 1) {
      const noise = ((column * 37 + row * 61 + column * row * 13) % 101) / 101;
      const flow = (row + column) / 22;
      const threshold = variant === "dense" ? 0.58 + flow * 0.3 : 0.12 + flow * 0.48;
      if (noise > threshold) continue;
      const size = 4 + ((column * 11 + row * 7) % 10) * 1.12;
      const jitterX = ((column * 17 + row * 5) % 17) - 8;
      const jitterY = ((row * 19 + column * 3) % 17) - 8;
      tiles.push({
        x: column * 51 + 8 + jitterX,
        y: row * 51 + 8 + jitterY,
        size,
        opacity: Math.min(0.58, 0.14 + flow * 0.4) * (variant === "dense" ? 1 : 0.82),
        rotation: ((column * 13 + row * 9) % 28) - 14,
      });
    }
  }
  return tiles;
}

const DENSE_GEOMETRY = createGeometryTiles("dense");
const SPARSE_GEOMETRY = createGeometryTiles("sparse");

function GeometricDissolve({ variant = "dense", className }: {
  variant?: GeometricVariant;
  className?: string;
}) {
  const tiles = variant === "dense" ? DENSE_GEOMETRY : SPARSE_GEOMETRY;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 620 620"
      preserveAspectRatio="xMidYMid meet"
      className={cls("pointer-events-none absolute", className)}
      fill="none"
    >
      <g stroke="currentColor" strokeWidth="1.15" opacity={variant === "dense" ? 0.14 : 0.09}>
        <path d="M42 112 112 42h396l70 70v396l-70 70H112l-70-70Z" />
        <path d="M112 182 182 112h256l70 70v256l-70 70H182l-70-70Z" />
        <path d="M182 252 252 182h116l70 70v116l-70 70H252l-70-70Z" />
        <path d="M310 18v584M18 310h584" opacity="0.32" />
        <path d="M62 62 558 558M558 62 62 558" opacity="0.28" />
        <circle cx="310" cy="310" r="210" />
        <circle cx="310" cy="310" r="142" strokeDasharray="4 9" />
        <circle cx="310" cy="310" r="74" />
      </g>
      <g fill="currentColor" opacity={variant === "dense" ? 0.11 : 0.075}>
        <path d="m310 56 58 58-58 58-58-58z" />
        <path d="m564 310-58 58-58-58 58-58z" />
        <path d="m310 564-58-58 58-58 58 58z" />
        <path d="m56 310 58-58 58 58-58 58z" />
        <path d="m310 244 66 66-66 66-66-66z" opacity="0.55" />
        <circle cx="310" cy="310" r="24" />
        <circle cx="112" cy="112" r="5" />
        <circle cx="508" cy="112" r="5" />
        <circle cx="112" cy="508" r="5" />
        <circle cx="508" cy="508" r="5" />
      </g>
      <g fill="currentColor">
        {tiles.map((tile, index) => (
          <rect
            key={index}
            x={tile.x}
            y={tile.y}
            width={tile.size}
            height={tile.size}
            rx={tile.size > 9 ? 2.5 : 1.25}
            opacity={tile.opacity}
            transform={`rotate(${tile.rotation} ${tile.x + tile.size / 2} ${tile.y + tile.size / 2})`}
          />
        ))}
      </g>
      <g stroke="currentColor" strokeWidth="1.25" opacity={variant === "dense" ? 0.11 : 0.07}>
        <path d="M330 44h166v166H330z" />
        <path d="M382 96h62v62h-62z" />
        <path d="M116 362h118v118H116z" />
        <path d="m175 362 59 59-59 59-59-59z" />
      </g>
    </svg>
  );
}

function Logo({ size = 40 }: { size?: number }) {
  return (
    <span
      className="dc-logo-mark grid shrink-0 place-items-center rounded-[30%] bg-gradient-to-br from-primary/20 via-primary/10 to-secondary/20 text-primary"
      style={{ width: size, height: size }}
    >
      <DoseCertaMark className="h-[78%] w-[78%]" />
    </span>
  );
}

/* ---------------- theme ---------------- */
function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => { const d = localStorage.getItem("dc-theme") === "dark"; setDark(d); document.documentElement.classList.toggle("dark", d); }, []);
  const toggle = () => { const d = !dark; setDark(d); localStorage.setItem("dc-theme", d ? "dark" : "light"); document.documentElement.classList.toggle("dark", d); };
  return { dark, toggle };
}

export type Palette = "verde" | "azul" | "rosa" | "lavanda" | "ruby" | "dourado" | "onix" | "cobre";
export const PALETTES: { id: Palette; name: string; light: string; dark: string }[] = [
  // Ordem visual aproximada do espectro: vermelho, tons quentes, amarelo,
  // verde, azul e violeta. Peônia (rosa) fica junto dos tons magenta;
  // Ônix, por ser neutro, fecha a sequência.
  { id: "ruby", name: "Ruby", light: "oklch(0.48 0.19 25)", dark: "oklch(0.68 0.17 25)" },
  { id: "rosa", name: "Peônia", light: "oklch(0.56 0.15 8)", dark: "oklch(0.72 0.13 8)" },
  { id: "cobre", name: "Cobre", light: "oklch(0.53 0.12 43)", dark: "oklch(0.72 0.12 55)" },
  { id: "dourado", name: "Dourado", light: "oklch(0.68 0.14 78)", dark: "oklch(0.78 0.13 82)" },
  { id: "verde", name: "Sálvia", light: "oklch(0.52 0.05 165)", dark: "oklch(0.66 0.06 165)" },
  { id: "azul", name: "Oceano", light: "oklch(0.52 0.11 245)", dark: "oklch(0.7 0.11 240)" },
  { id: "lavanda", name: "Lavanda", light: "oklch(0.54 0.12 292)", dark: "oklch(0.73 0.1 292)" },
  { id: "onix", name: "Ônix", light: "oklch(0.32 0.015 265)", dark: "oklch(0.76 0.012 265)" },
];
function usePalette() {
  const [palette, setPaletteState] = useState<Palette>("verde");
  useEffect(() => {
    const saved = localStorage.getItem("dc-palette");
    const p: Palette = saved === "azul" || saved === "rosa" || saved === "lavanda" || saved === "ruby" || saved === "dourado" || saved === "onix" || saved === "cobre" ? saved : "verde";
    setPaletteState(p);
    if (p === "verde") delete document.documentElement.dataset['palette'];
    else document.documentElement.dataset['palette'] = p;
  }, []);
  const setPalette = (p: Palette) => {
    setPaletteState(p);
    localStorage.setItem("dc-palette", p);
    if (p === "verde") delete document.documentElement.dataset['palette'];
    else document.documentElement.dataset['palette'] = p;
  };
  return { palette, setPalette };
}

function AppearanceQuickAccess() {
  const { dark, toggle } = useTheme();
  const { palette, setPalette } = usePalette();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const dialog = open && typeof document !== "undefined"
    ? createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/35 p-3 backdrop-blur-sm sm:p-5" onClick={() => setOpen(false)} role="presentation">
          <section role="dialog" aria-modal="true" aria-label="Aparência do Dose Certa" className={cls(card, "w-[min(26rem,calc(100vw-1.5rem))] max-h-[min(82dvh,42rem)] overflow-y-auto !p-4 shadow-2xl sm:!p-5")} onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><p className="font-display text-lg font-semibold text-foreground">Aparência</p><p className="mt-0.5 text-xs text-muted-foreground">Tema de cores e modo de exibição deste aparelho.</p></div>
              <button type="button" aria-label="Fechar aparência" onClick={() => setOpen(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="mb-4 rounded-2xl border border-border bg-background/70 p-3">
              <p className="mb-2 text-xs font-bold text-foreground">Modo de exibição</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" aria-pressed={!dark} onClick={() => { if (dark) toggle(); }} className={cls("flex min-h-11 items-center justify-center gap-2 rounded-xl border text-xs font-bold transition", !dark ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted")}><Sun className="h-4 w-4" />Claro</button>
                <button type="button" aria-pressed={dark} onClick={() => { if (!dark) toggle(); }} className={cls("flex min-h-11 items-center justify-center gap-2 rounded-xl border text-xs font-bold transition", dark ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted")}><Moon className="h-4 w-4" />Escuro</button>
              </div>
            </div>
            <p className="mb-2 text-xs font-bold text-foreground">Paleta de cores</p>
            <div className="grid grid-cols-2 gap-2.5">
              {PALETTES.map((p) => (
                <button key={p.id} type="button" aria-pressed={palette === p.id} onClick={() => setPalette(p.id)} className={cls("flex min-h-12 min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition", palette === p.id ? "border-primary bg-accent" : "border-border bg-card hover:bg-muted")}>
                  <span className="flex shrink-0 overflow-hidden rounded-full border border-border"><span className="h-4 w-4" style={{ background: p.light }} /><span className="h-4 w-4" style={{ background: p.dark }} /></span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{p.name}</span>
                  {palette === p.id && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              ))}
            </div>
          </section>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button type="button" aria-label="Aparência: tema e modo" aria-haspopup="dialog" aria-expanded={open} title="Tema e modo de exibição" onClick={() => setOpen((value) => !value)} className="no-print grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-foreground hover:bg-muted">
        <PaletteIcon className="h-5 w-5" />
      </button>
      {dialog}
    </>
  );
}

function QuickGuideAccess({ onNavigate, hasPatient }: { onNavigate: (page: Page) => void; hasPatient: boolean }) {
  const [open, setOpen] = useState(false);
  const entries: { title: string; description: string; icon: ReactNode; page: Page }[] = [
    { title: "Ativar notificações", description: "Permissões e teste de alertas", icon: <BellRing className="h-4 w-4" />, page: "perfil" },
    { title: "Organizar pacientes", description: "Cadastrar e escolher quem acompanhar", icon: <UsersRound className="h-4 w-4" />, page: "pacientes" },
    { title: "Cadastrar medicamento", description: "Dosagem, horários e estoque", icon: <PillBottle className="h-4 w-4" />, page: "medicamentos" },
    { title: "Montar rotina visual", description: "Alimentação, hidratação e atividades", icon: <CalendarDays className="h-4 w-4" />, page: hasPatient ? "rotina" : "pacientes" },
    { title: "Central de atendimento", description: "Dúvidas e suporte do aplicativo", icon: <LifeBuoy className="h-4 w-4" />, page: "suporte" },
  ];
  return (
    <div className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Abrir guia rápido" title="Guia rápido" onClick={() => setOpen((value) => !value)} className="no-print grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-foreground hover:bg-muted">
        <BookOpen className="h-5 w-5" />
      </button>
      {open && (
        <div role="menu" aria-label="Guia rápido" className="absolute right-0 z-40 mt-2 w-[min(21rem,calc(100vw-1.5rem))] rounded-2xl border border-border bg-card p-3 shadow-xl">
          <div className="mb-2 px-1"><p className="font-display text-base font-bold text-foreground">Guia rápido</p><p className="text-[10px] text-muted-foreground">Acesse direto as tarefas mais comuns.</p></div>
          <div className="space-y-1">
            {entries.map((entry) => (
              <button key={entry.title} type="button" role="menuitem" onClick={() => { onNavigate(entry.page); setOpen(false); }} className="group flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-muted">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{entry.icon}</span>
                <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-foreground">{entry.title}</span><span className="block text-[10px] text-muted-foreground">{entry.description}</span></span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- sound ---------------- */
let alarmAudioContext: AudioContext | null = null;
function beep() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!alarmAudioContext || alarmAudioContext.state === "closed") alarmAudioContext = new AudioContextClass();
    const ctx = alarmAudioContext;
    if (ctx.state === "suspended") void ctx.resume();
    [0, 0.24, 0.68, 0.92].forEach((t, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = index % 2 === 0 ? 880 : 660;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.001, ctx.currentTime + t);
      gain.gain.linearRampToValueAtTime(0.38, ctx.currentTime + t + 0.025);
      gain.gain.setValueAtTime(0.38, ctx.currentTime + t + 0.13);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      oscillator.start(ctx.currentTime + t);
      oscillator.stop(ctx.currentTime + t + 0.21);
    });
  } catch { /* áudio indisponível ou bloqueado pelo navegador */ }
}

/* ---------------- auth screens ---------------- */
function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup" | "recover">("login");
  const [login, setLogin] = useState(""); const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const register = useServerFn(registerAccount);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    setBusy(true);
    try {
      if (mode === "recover") { setMsg({ ok: false, text: "Peça ao Mestre para redefinir sua senha. A resposta secreta antiga não é usada nas contas compartilhadas." }); return; }
      if (mode === "signup") await register({ data: { login, password: pass } });
      await cloudLogin(login, pass);
    } catch (error) { setMsg({ ok: false, text: error instanceof Error ? error.message : "Não foi possível entrar." }); }
    finally { setBusy(false); }
  };

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-background p-4">
      <GeometricDissolve variant="dense" className="-right-24 -bottom-24 h-[38rem] w-[38rem] dc-geometry-ink opacity-65" />
      <GeometricDissolve variant="sparse" className="-left-28 -top-28 h-[29rem] w-[29rem] dc-geometry-ink opacity-45" />
      <div className="absolute right-4 top-4"><AppearanceQuickAccess /></div>
      <div className={cls(card, "relative w-full max-w-md")}>
        <div className="mb-6 flex items-center gap-3">
          <Logo size={48} />
          <div>
            <T k="brand" as="h1" className="font-display text-3xl font-semibold text-foreground">Dose Certa</T>
            <T k="tagline" as="p" className="text-sm text-muted-foreground">Equilíbrio e Bem-Estar</T>
          </div>
        </div>
        <h2 className="mb-4 font-display text-xl text-foreground">
          {mode === "login" ? <T k="auth-login-title">Bem-vindo de volta</T> : mode === "signup" ? <T k="auth-signup-title">Cadastro rápido do cuidador</T> : <T k="auth-rec-title">Recuperar senha</T>}
        </h2>
        <form onSubmit={submit} className="space-y-3">
          <input className={input} aria-label="Login" autoComplete="username" required placeholder="Login" value={login} onChange={(e) => setLogin(e.target.value)} />
          {mode !== "recover" && <input className={input} aria-label="Senha" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : undefined} type="password" placeholder="Senha" value={pass} onChange={(e) => setPass(e.target.value)} />}
          {msg && <p className={cls("text-sm", msg.ok ? "text-primary" : "text-destructive")}>{msg.text}</p>}
          <Button disabled={busy} className={cls("w-full rounded-xl py-6 text-base font-bold shadow-md transition-all focus-visible:ring-4 focus-visible:ring-primary/30", mode === "signup" ? "bg-primary text-primary-foreground shadow-primary/30 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/30" : "")}>{busy ? "Aguarde…" : mode === "login" ? "Entrar" : mode === "signup" ? "Criar minha conta" : "Solicitar recuperação"}</Button>
        </form>
        {mode === "signup" && (
          <aside className="mt-5 space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4" aria-labelledby="signup-tips-title">
            <div>
              <h3 id="signup-tips-title" className="font-semibold text-foreground">Dicas para criar uma conta segura</h3>
              <p className="mt-1 text-sm text-muted-foreground">Alguns cuidados ajudam a proteger seus dados.</p>
            </div>
            <ul className="space-y-2.5 text-sm text-foreground">
              <li className="flex gap-2"><Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><strong>Escolha um login único.</strong> Evite usar seu nome completo ou data de nascimento.</span></li>
              <li className="flex gap-2"><Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><strong>Crie uma senha forte.</strong> Use pelo menos 8 caracteres; misturar letras maiúsculas e minúsculas, números e símbolos ajuda.</span></li>
              <li className="flex gap-2"><Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><strong>Evite senhas óbvias.</strong> Não use sequências como 123456, palavras comuns ou uma senha que já usa em outro serviço.</span></li>
              <li className="flex gap-2"><Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><strong>Mantenha a senha em segurança.</strong> Guarde-a em um local confiável e não a compartilhe.</span></li>
            </ul>
            <p className="rounded-xl border border-primary/20 bg-background/80 p-3 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">Importante:</strong> o sistema pode recusar senhas consideradas fracas ou fáceis de adivinhar. Se isso acontecer, tente outra senha mais exclusiva.</p>
          </aside>
        )}
        <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
          {mode !== "login" && <button className="rounded-xl px-3 py-2 font-medium text-primary hover:bg-primary/10 hover:underline" onClick={() => setMode("login")}>Já tenho conta</button>}
          {mode !== "signup" && <button className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-primary bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30" onClick={() => { setMsg(null); setMode("signup"); }}><Plus className="h-4 w-4" />Criar conta de cuidador</button>}
          {mode !== "recover" && <button className="rounded-xl px-3 py-2 font-medium text-secondary hover:bg-secondary/10 hover:underline" onClick={() => setMode("recover")}>Esqueci minha senha</button>}
        </div>
        <LegacyAccountsHint />
      </div>
    </div>
  );
}

function LegacyAccountsHint() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("dose-certa-v1");
      const users = raw ? (JSON.parse(raw) as { users?: unknown[] }).users : [];
      setCount(Array.isArray(users) ? users.length : 0);
    } catch { setCount(0); }
  }, []);
  if (count === 0) return null;
  return <p className="mt-4 rounded-xl border border-border bg-muted p-3 text-xs text-muted-foreground">Este aparelho tem {count} {count === 1 ? "conta antiga" : "contas antigas"} do sistema anterior. Entre como Mestre e use <b>Contas → Importar contas deste aparelho</b> para integrá-las ao sistema compartilhado.</p>;
}

function ForceChangePassword({ me }: { me: User }) {
  const finish = useServerFn(finishPasswordChange);
  const [current, setCurrent] = useState("");
  const [p1, setP1] = useState(""); const [p2, setP2] = useState(""); const [err, setErr] = useState("");
  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <form className={cls(card, "w-full max-w-md space-y-3")} onSubmit={async (e) => {
        e.preventDefault();
        if (p1.length < 8 || p1 === RESET_PASSWORD) return setErr("A nova senha precisa ter pelo menos 8 caracteres e ser única.");
        if (p1 !== p2) return setErr("As senhas não conferem.");
        try { await updateOwnPassword(current, p1); await finish({ data: { newPassword: p1 } }); await refreshCloud(); } catch (error) { setErr(error instanceof Error ? error.message : "Não foi possível alterar."); }
      }}>
        <Shield className="h-8 w-8 text-primary" />
        <h2 className="font-display text-xl text-foreground">Cadastre uma nova senha</h2>
        <p className="text-sm text-muted-foreground">Você entrou com a senha temporária. Defina uma nova senha para continuar.</p>
        <input className={input} type="password" placeholder="Senha temporária atual" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <input className={input} type="password" placeholder="Nova senha" value={p1} onChange={(e) => setP1(e.target.value)} />
        <input className={input} type="password" placeholder="Confirmar nova senha" value={p2} onChange={(e) => setP2(e.target.value)} />
        {err && <p className="text-sm text-destructive">{err}</p>}
        <button className={cls(btnPrimary, "w-full")}>Salvar e continuar</button>
      </form>
    </div>
  );
}

/* ---------------- alarm engine ---------------- */
function ensureTodayDoses(ownerId: string) {
  const s = getState();
  const add = buildMissingDoses(s.meds, s.doses, ownerId, new Date());
  if (add.length) setState((st) => ({ ...st, doses: [...st.doses, ...add] }));
}

function AlarmEngine({ me }: { me: User }) {
  const [active, setActive] = useState<Dose | null>(null);
  const activeRef = useRef<Dose | null>(null);
  const confirmDose = useServerFn(confirmDoseTaken);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const doses = useStore((s) => s.doses); const meds = useStore((s) => s.meds); const patients = useStore((s) => s.patients);
  useEffect(() => {
    if (me.role !== "cuidador") return;
    const tick = () => {
      ensureTodayDoses(me.id);
      const s = getState(); const now = Date.now();
      const currentTime = new Date(now);
      const todayKey = [currentTime.getFullYear(), String(currentTime.getMonth() + 1).padStart(2, "0"), String(currentTime.getDate()).padStart(2, "0")].join("-");
      const todayDay = currentTime.getDay();
      const minuteOfDay = currentTime.getHours() * 60 + currentTime.getMinutes();
      const routineReminders = s.routines.filter((task) => {
        if (!task.enabled || task.ownerId !== me.id || !task.weekdays.includes(todayDay)) return false;
        const [hours, minutes] = task.time.split(":").map(Number);
        const scheduledMinute = (hours ?? 0) * 60 + (minutes ?? 0);
        const sourceKey = "routine:" + task.id + ":" + todayKey;
        const alreadyLogged = s.routineLogs.some((log) => log.taskId === task.id && log.date === todayKey);
        return minuteOfDay >= scheduledMinute && minuteOfDay < scheduledMinute + 5
          && !alreadyLogged && !s.alerts.some((alert) => alert.sourceKey === sourceKey);
      });
      if (routineReminders.length) {
        const alerts = routineReminders.map((task) => ({
          id: uid(), ownerId: me.id, at: new Date().toISOString(), read: false,
          sourceKey: "dc-routine-" + task.id + "-" + todayKey,
          text: "Lembrete de rotina · " + (s.patients.find((patient) => patient.id === task.patientId)?.name ?? "Paciente") + " · " + task.pictogram + " " + task.title,
        }));
        setState((state) => ({ ...state, alerts: [...alerts, ...state.alerts] }));
        if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
          for (const alert of alerts) {
            try { new Notification("Dose Certa • Rotina", { body: alert.text, tag: alert.sourceKey }); } catch { /* Notificações locais dependem do navegador. */ }
          }
        }
      }
      // tolerance alerts
      const late = s.doses.filter((d) => d.ownerId === me.id && d.status === "pendente" && !d.lateAlerted && (() => { const m = s.meds.find((x) => x.id === d.medId); return m && now > new Date(d.scheduledAt).getTime() + m.tolerance * 60000; })());
      if (late.length) setState((st) => ({
        ...st,
        doses: st.doses.map((d) => (late.some((l) => l.id === d.id) ? { ...d, lateAlerted: true } : d)),
        alerts: [...late.map((d) => ({ id: uid(), ownerId: me.id, at: new Date().toISOString(), read: false, text: `Dose atrasada além da tolerância: ${st.meds.find((m) => m.id === d.medId)?.name} (${st.patients.find((p) => p.id === d.patientId)?.name})` })), ...st.alerts],
      }));
      const due = findDueDose(getState().doses, me.id, now);
      // Keep one alarm on screen until it is resolved; never replace it every poll.
      if (due && !activeRef.current) {
        activeRef.current = due;
        setActive(due);
        setState((st) => ({ ...st, doses: st.doses.map((d) => (d.id === due.id ? { ...d, lastShown: new Date().toISOString() } : d)) }));
        const currentState = getState();
        const m = currentState.meds.find((x) => x.id === due.medId);
        const p = currentState.patients.find((x) => x.id === due.patientId);
        if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
          try {
            new Notification(`Dose Certa • ${p?.name ?? "Paciente"}`, {
              body: `${m?.name ?? "Medicamento"} ${m?.dose ?? ""} · Horário: ${fmtTime(due.scheduledAt)}`,
              tag: `dose-${due.id}`,
            });
          } catch { /* Mobile background delivery uses Firebase messaging instead. */ }
        }
      }
    };
    const resume = () => {
      if (document.hidden) return;
      // A notification action may have been completed while this tab was suspended.
      void refreshCloud().catch(() => undefined).finally(tick);
    };
    const onWorkerMessage = (event: MessageEvent<{ type?: string; owner?: string }>) => {
      if (event.data?.type === "DOSE_ACTION_COMPLETED" && event.data.owner === me.id) {
        void refreshCloud().catch(() => undefined);
      }
    };
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
    tick(); const id = setInterval(tick, 15000);
    document.addEventListener("visibilitychange", resume); window.addEventListener("focus", resume);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
    };
  }, [me.id, me.role]);

  useEffect(() => {
    if (!active) {
      activeRef.current = null;
      return;
    }
    const current = doses.find((dose) => dose.id === active.id);
    const snoozed = current?.snoozeUntil && Date.parse(current.snoozeUntil) > Date.now();
    if (!current || current.status !== "pendente" || snoozed) {
      activeRef.current = null;
      setActive(null);
    }
  }, [active?.id, doses]);

  useEffect(() => {
    if (!active) return;
    // 20 pulsos de 400 ms com 100 ms de intervalo (aprox. 10 segundos).
    const foregroundVibrationPattern = Array.from({ length: 20 }, () => [400, 100]).flat();
    const vibrate = () => {
      try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          navigator.vibrate(foregroundVibrationPattern);
        }
      } catch { /* Vibração pode não estar disponível. */ }
    };
    const stopVibration = () => {
      try { if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(0); } catch { /* Sem suporte. */ }
    };
    beep();
    vibrate();
    // Keep the existing sound cadence, while allowing the full vibration burst to finish.
    const soundLoop = window.setInterval(beep, 2400);
    const vibrationLoop = window.setInterval(vibrate, 10_500);
    return () => {
      window.clearInterval(soundLoop);
      window.clearInterval(vibrationLoop);
      stopVibration();
    };
  }, [active?.id]);

  if (!active) return null;
  const d = doses.find((x) => x.id === active.id) ?? active; const m = meds.find((x) => x.id === d.medId); const p = patients.find((x) => x.id === d.patientId);
  const closeActive = () => {
    activeRef.current = null;
    setActive(null);
  };
  const act = async (kind: "tomado" | "snooze" | "nao") => {
    if (actionBusy) return;
    setActionError(null);

    if (kind === "tomado" && typeof navigator !== "undefined" && navigator.onLine) {
      setActionBusy(true);
      try {
        await confirmDose({ data: { doseId: d.id } });
        closeActive();
        await refreshCloud().catch(() => undefined);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Não foi possível registrar a dose.");
      } finally {
        setActionBusy(false);
      }
      return;
    }

    setState((s) => {
      const current = s.doses.find((dose) => dose.id === d.id);
      if (!current || current.status !== "pendente") return s;

      if (kind === "tomado") {
        const currentMed = s.meds.find((med) => med.id === current.medId);
        const consumed = Number.isFinite(currentMed?.quantityPerDose) && (currentMed?.quantityPerDose ?? 0) > 0
          ? currentMed!.quantityPerDose!
          : 1;
        return {
          ...s,
          doses: s.doses.map((dose) => dose.id === d.id ? { ...dose, status: "tomado" as const, takenAt: new Date().toISOString() } : dose),
          meds: s.meds.map((med) => med.id === current.medId ? { ...med, stock: Math.max(0, med.stock - consumed) } : med),
        };
      }

      if (kind === "snooze") {
        return {
          ...s,
          doses: s.doses.map((dose) => dose.id === d.id
            ? { ...dose, snoozeUntil: new Date(Date.now() + SNOOZE_MIN * 60000).toISOString() }
            : dose),
        };
      }

      return {
        ...s,
        doses: s.doses.map((dose) => dose.id === d.id ? { ...dose, status: "nao_tomado" as const } : dose),
        alerts: [{
          id: uid(),
          ownerId: d.ownerId,
          at: new Date().toISOString(),
          read: false,
          text: `⚠ ${p?.name ?? "Paciente"} informou que NÃO tomou ${m?.name ?? "o medicamento"} (${fmtTime(d.scheduledAt)}).`,
        }, ...s.alerts],
      };
    });
    closeActive();
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-foreground/65 p-3 backdrop-blur-md sm:p-6" role="alertdialog" aria-modal="true" aria-labelledby="dose-alarm-title" aria-describedby="dose-alarm-description">
      <section className="relative my-auto w-full max-w-lg overflow-hidden rounded-[2rem] border border-primary/25 bg-card text-card-foreground shadow-2xl shadow-primary/20">
        <div className="relative overflow-hidden bg-primary px-5 pb-6 pt-5 text-primary-foreground sm:px-7 sm:pb-7">
          <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full border-[22px] border-primary-foreground/10" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-extrabold tracking-[0.16em]">
              <AlarmClock className="h-5 w-5" /> DOSE CERTA
            </div>
            <span className="rounded-full border border-primary-foreground/30 bg-primary-foreground/15 px-3 py-1 text-[11px] font-extrabold tracking-wider">DOSE PENDENTE</span>
          </div>
          <div className="relative mt-6 flex flex-col items-center text-center">
            <span className="mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-primary-foreground/15 ring-1 ring-primary-foreground/25">
              <BellRing className="h-9 w-9 animate-pulse" />
            </span>
            <h2 id="dose-alarm-title" className="font-display text-3xl font-bold leading-tight sm:text-4xl">Hora do remédio!</h2>
            <p id="dose-alarm-description" className="mt-2 max-w-sm text-sm font-medium text-primary-foreground/85 sm:text-base">Está na hora de registrar esta dose.</p>
          </div>
        </div>

        <div className="space-y-3 p-4 sm:space-y-4 sm:p-6">
          <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary"><UserRound className="h-6 w-6" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-muted-foreground">Paciente</p>
                <p className="mt-0.5 break-words text-2xl font-extrabold leading-tight text-foreground sm:text-3xl">{p?.name ?? "Paciente não identificado"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/55 p-4 sm:p-5">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-muted-foreground">Medicamento</p>
            <p className="mt-1 break-words text-xl font-extrabold leading-snug text-foreground sm:text-2xl">{m?.name ?? "Medicamento não identificado"}</p>
            {m?.dose && <p className="mt-1 text-base font-semibold text-muted-foreground">{m.dose}</p>}
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-sm font-semibold text-muted-foreground">Horário programado</span>
              <span className="font-display text-3xl font-bold tabular-nums text-primary sm:text-4xl">{fmtTime(d.scheduledAt)}</span>
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            {actionError && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{actionError}</p>}
            <button disabled={actionBusy} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 text-base font-extrabold text-primary-foreground shadow-lg shadow-primary/25 transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:cursor-wait disabled:opacity-60 sm:min-h-16 sm:text-lg" onClick={() => void act("tomado")}>
              <CheckCircle2 className="h-5 w-5" /><T k="alarm-yes">Já tomei meu medicamento</T>
            </button>
            <button disabled={actionBusy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-primary/35 bg-primary/8 px-5 py-3.5 text-sm font-bold text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:opacity-60 sm:text-base" onClick={() => void act("snooze")}>
              <Clock3 className="h-5 w-5" /><T k="alarm-snooze">Lembrar em 5 minutos</T>
            </button>
            <button disabled={actionBusy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-60" onClick={() => void act("nao")}>
              <X className="h-4 w-4" /><T k="alarm-no">Não tomei</T>
            </button>
          </div>
          <p className="flex items-center justify-center gap-2 px-2 text-center text-xs leading-relaxed text-muted-foreground">
            <Bell className="h-3.5 w-3.5 shrink-0 text-primary" />
            O alarme sonoro se repete enquanto este aviso estiver aberto. Se adiar, ele retorna em 5 minutos.
          </p>
        </div>
      </section>
    </div>
  );
}

/* ---------------- pages ---------------- */
type Page = "inicio" | "pacientes" | "medicamentos" | "historico" | "suporte" | "rotina" | "perfil" | "admin";

function Dashboard({ me, go, activePatientId = "" }: { me: User; go: (p: Page) => void; activePatientId?: string }) {
  const doses = useStore((s) => s.doses.filter((d) => d.ownerId === me.id && (!activePatientId || d.patientId === activePatientId) && new Date(d.scheduledAt).toDateString() === new Date().toDateString()));
  const meds = useStore((s) => s.meds.filter((med) => !med.archivedAt)); const patients = useStore((s) => s.patients);
  const taken = doses.filter((d) => d.status === "tomado").length;
  const pend = doses.filter((d) => d.status === "pendente").length;
  const miss = doses.filter((d) => d.status === "nao_tomado").length;
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const nextDoses = [...doses].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const progress = doses.length ? Math.round((taken / doses.length) * 100) : 0;
  return (
    <div className="mx-auto w-full max-w-7xl space-y-7">
      <section className="relative isolate overflow-hidden rounded-[2rem] bg-primary px-6 py-7 text-primary-foreground shadow-[var(--shadow-soft)] sm:px-9 sm:py-9">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary via-primary to-secondary opacity-95" />
        <GeometricDissolve variant="dense" className="-right-5 -top-10 -z-10 h-64 w-64 dc-geometry-ink opacity-70 sm:right-5 sm:top-0 sm:h-80 sm:w-80" />
        <p className="mb-2 text-sm font-bold uppercase tracking-[0.16em] opacity-80">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="max-w-2xl font-display text-3xl font-semibold leading-tight sm:text-4xl">{hello}, {me.login}.</h1>
        <T k="dash-sub" as="p" className="mt-2 max-w-lg text-sm leading-relaxed opacity-85 sm:text-base">Seu cuidado de hoje, organizado em um só lugar.</T>
        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={() => go("medicamentos")} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary-foreground px-5 py-3 text-sm font-bold text-primary shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"><Plus className="h-4 w-4" />Adicionar medicamento</button>
          <button onClick={() => go("pacientes")} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-primary-foreground/35 bg-primary-foreground/10 px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-foreground/20"><Users className="h-4 w-4" />Ver pacientes<ArrowRight className="h-4 w-4" /></button>
        </div>
      </section>


      <section aria-label="Resumo das doses de hoje" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1.5rem] border border-border/70 bg-card dc-surface-texture p-5 shadow-sm sm:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-sm font-semibold text-muted-foreground">Rotina de hoje</p><p className="mt-1 text-3xl font-bold tracking-tight text-foreground">{progress}% <span className="text-base font-medium text-muted-foreground">concluído</span></p></div>
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary"><ClipboardList className="h-5 w-5" /></span>
          </div>
          <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Progresso das doses de hoje" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} /></div>
          <p className="mt-2 text-xs text-muted-foreground">{taken} de {doses.length} doses registradas como tomadas</p>
        </div>
        {[
          { l: "Tomadas", v: taken, icon: <CheckCircle2 className="h-5 w-5" />, tone: "bg-primary/10 text-primary" },
          { l: "Pendentes", v: pend, icon: <Clock3 className="h-5 w-5" />, tone: "bg-warning/20 text-foreground" },
        ].map((x) => <div key={x.l} className="flex items-center gap-4 rounded-[1.5rem] border border-border/70 bg-card dc-surface-texture p-5 shadow-sm"><span className={cls("grid h-12 w-12 shrink-0 place-items-center rounded-2xl", x.tone)}>{x.icon}</span><div><p className="text-sm font-medium text-muted-foreground">{x.l}</p><p className="text-3xl font-bold tracking-tight text-foreground">{x.v}</p></div></div>)}
        <div className="flex items-center gap-4 rounded-[1.5rem] border border-border/70 bg-card dc-surface-texture p-5 shadow-sm"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-destructive/10 text-destructive"><BellRing className="h-5 w-5" /></span><div><p className="text-sm font-medium text-muted-foreground">Não tomadas</p><p className="text-3xl font-bold tracking-tight text-foreground">{miss}</p></div></div>
      </section>

      <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.8fr)]">
        <div className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-card dc-surface-texture shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-5 sm:px-6">
            <div><h2 className="font-display text-xl font-semibold text-foreground sm:text-2xl">Agenda de medicamentos</h2><p className="mt-1 text-sm text-muted-foreground">Confira os horários previstos para hoje.</p></div>
            <button className="shrink-0 rounded-full px-3 py-2 text-sm font-bold text-primary transition hover:bg-primary/10" onClick={() => go("medicamentos")}>Ver todos <ArrowRight className="ml-1 inline h-4 w-4" /></button>
          </div>
          {nextDoses.length === 0 ? <div className="px-6 py-10 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Pill className="h-6 w-6" /></span><p className="mt-4 font-semibold text-foreground">Sua agenda está livre por enquanto</p><p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{patients.filter((p) => p.ownerId === me.id).length === 0 ? "Cadastre um paciente para começar a organizar os cuidados." : "Cadastre medicamentos e horários para acompanhar as doses do dia."}</p><button onClick={() => go(patients.filter((p) => p.ownerId === me.id).length === 0 ? "pacientes" : "medicamentos")} className={cls(btnPrimary, "mt-4 rounded-full")}>{patients.filter((p) => p.ownerId === me.id).length === 0 ? "Cadastrar paciente" : "Cadastrar medicamento"}<ArrowRight className="h-4 w-4" /></button></div> :
            <ul className="divide-y divide-border/70">
              {nextDoses.map((d) => { const m = meds.find((x) => x.id === d.medId); return (
                <li key={d.id} className="flex items-center gap-3 px-5 py-4 transition hover:bg-muted/40 sm:px-6">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent text-primary"><Pill className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1"><p className="truncate font-bold text-foreground">{m?.name ?? "Medicamento"} <span className="font-medium text-muted-foreground">{m?.dose}</span></p><p className="mt-1 text-sm text-muted-foreground">{fmtTime(d.scheduledAt)} <span className="px-1">·</span> {patients.find((p) => p.id === d.patientId)?.name}</p></div>
                  <StatusBadge s={d.status} />
                </li>); })}
            </ul>}
        </div>
        <aside className="space-y-4">
          <div className="rounded-[1.75rem] border border-border/70 bg-card dc-surface-texture p-5 shadow-sm sm:p-6">
            <p className="text-sm font-semibold text-muted-foreground">Visão geral</p>
            <h2 className="mt-1 font-display text-xl font-semibold text-foreground">Seu cuidado em números</h2>
            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">Pacientes acompanhados</span><span className="font-bold tabular-nums text-foreground">{patients.filter((p) => p.ownerId === me.id).length}</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">Medicamentos cadastrados</span><span className="font-bold tabular-nums text-foreground">{meds.filter((m) => m.ownerId === me.id).length}</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">Doses previstas hoje</span><span className="font-bold tabular-nums text-foreground">{doses.length}</span></div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button onClick={() => go("pacientes")} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm font-bold text-foreground transition hover:bg-accent"><Users className="h-4 w-4" />Pacientes</button>
              <button onClick={() => go("historico")} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm font-bold text-foreground transition hover:bg-accent"><History className="h-4 w-4" />Histórico</button>
            </div>
          </div>
          {miss > 0 && <div className="rounded-[1.5rem] border border-destructive/20 bg-destructive/5 p-5"><div className="flex items-start gap-3"><BellRing className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><div><p className="font-bold text-foreground">Atenção às doses</p><p className="mt-1 text-sm text-muted-foreground">Há {miss} {miss === 1 ? "dose não tomada" : "doses não tomadas"} registradas hoje. Confira o histórico para acompanhar os registros.</p><button onClick={() => go("historico")} className="mt-3 text-sm font-bold text-destructive hover:underline">Abrir histórico <ArrowRight className="ml-1 inline h-4 w-4" /></button></div></div></div>}
        </aside>
      </section>
    </div>
  );
}
function StatusBadge({ s }: { s: Dose["status"] }) {
  const map = { tomado: ["Confirmado", "bg-primary/15 text-primary"], pendente: ["Pendente", "bg-warning/20 text-foreground"], nao_tomado: ["Não tomado", "bg-destructive/15 text-destructive"] } as const;
  return <span className={cls("shrink-0 rounded-full px-3 py-1 text-xs font-bold", map[s][1])}>{map[s][0]}</span>;
}

function getPatientAge(birthDate: string): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate + "T12:00:00");
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

function compressPatientPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Selecione um arquivo de imagem."));
    if (file.size > 8 * 1024 * 1024) return reject(new Error("A foto precisa ter no máximo 8 MB."));
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, 720 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Não foi possível processar a foto.");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL("image/jpeg", 0.76);
        URL.revokeObjectURL(url);
        if (data.length > 280_000) throw new Error("A foto ficou muito grande. Escolha outra imagem.");
        resolve(data);
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error instanceof Error ? error : new Error("Não foi possível processar a foto."));
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível abrir esta imagem."));
    };
    image.src = url;
  });
}

function Patients({ me, activePatientId = "", onSelectPatient, onOpenRoutine }: {
  me: User;
  activePatientId?: string;
  onSelectPatient: (patientId: string) => void;
  onOpenRoutine: (patientId: string) => void;
}) {
  const patients = useStore((s) => s.patients.filter((p) => me.role === "mestre" || p.ownerId === me.id));
  const [f, setF] = useState({ name: "", age: "", birthDate: "", susCard: "", healthPlan: "", identityNumber: "", cpf: "", notes: "", photoDataUrl: "" });
  const [err, setErr] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [showExtraFields, setShowExtraFields] = useState(false);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [viewingPatientCardId, setViewingPatientCardId] = useState<string | null>(null);
  const [editPatientForm, setEditPatientForm] = useState({ name: "", age: "", notes: "" });
  const [editPatientError, setEditPatientError] = useState("");

  const beginPatientEdit = (patient: { id: string; name: string; age: number; notes: string }) => {
    setEditingPatientId(patient.id);
    setEditPatientForm({ name: patient.name, age: String(patient.age), notes: patient.notes ?? "" });
    setEditPatientError("");
  };

  const savePatientEdit = (event: React.FormEvent, patientId: string) => {
    event.preventDefault();
    const name = editPatientForm.name.trim();
    const age = Number(editPatientForm.age);
    if (!name) return setEditPatientError("Informe o nome do paciente.");
    if (editPatientForm.age.trim() === "" || !Number.isFinite(age) || age < 0) {
      return setEditPatientError("Informe uma idade válida, igual ou maior que zero.");
    }
    setState((state) => ({
      ...state,
      patients: state.patients.map((patient) => patient.id === patientId
        ? { ...patient, name, age, notes: editPatientForm.notes.trim() }
        : patient),
    }));
    setEditingPatientId(null);
    setEditPatientError("");
  };

  const focusPatientForm = () => {
    document.getElementById("patient-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("patient-name")?.focus();
  };

  const updateBirthDate = (birthDate: string) => {
    const age = getPatientAge(birthDate);
    setF((current) => ({ ...current, birthDate, age: age === null ? current.age : String(age) }));
  };

  const addPhoto = async (file?: File) => {
    if (!file) return;
    setPhotoError("");
    try {
      const photoDataUrl = await compressPatientPhoto(file);
      setF((current) => ({ ...current, photoDataUrl }));
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Não foi possível adicionar a foto.");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <T k="pat-title" as="h1" className="font-display text-3xl text-foreground">Pacientes</T>
        <p className="mt-1 text-sm text-muted-foreground">{patients.length} de {MAX_PATIENTS} pacientes cadastrados.</p>
      </div>

      {patients.length === 0 && (
        <EmptyState
          icon={<UsersRound className="h-6 w-6" />}
          title="Comece cadastrando um paciente"
          description="Informe os dados básicos agora. Os dados de identificação podem ser preenchidos em seguida, se necessário."
          actionLabel="Cadastrar primeiro paciente"
          onAction={focusPatientForm}
        />
      )}

      {patients.length < MAX_PATIENTS && (
        <form id="patient-form" className={cls(card, "space-y-3 p-3 sm:p-4")} onSubmit={(event) => {
          event.preventDefault();
          setErr("");
          const name = f.name.trim();
          const calculatedAge = getPatientAge(f.birthDate);
          const age = calculatedAge ?? Number(f.age);
          if (!name || (f.birthDate !== "" && calculatedAge === null) || !Number.isFinite(age) || age < 0 || (f.birthDate === "" && f.age.trim() === "")) {
            setErr(f.birthDate && calculatedAge === null ? "Confira a data de nascimento." : "Informe o nome e a idade ou a data de nascimento.");
            return;
          }
          if (!canAddPatient(getState(), me.id)) return setErr(`Limite de ${MAX_PATIENTS} pacientes.`);
          const patientId = uid();
          setState((state) => ({
            ...state,
            patients: [...state.patients, {
              id: patientId,
              ownerId: me.id,
              name,
              age,
              notes: f.notes.trim(),
              ...(f.birthDate ? { birthDate: f.birthDate } : {}),
              ...(f.susCard.trim() ? { susCard: f.susCard.trim() } : {}),
              ...(f.healthPlan.trim() ? { healthPlan: f.healthPlan.trim() } : {}),
              ...(f.identityNumber.trim() ? { identityNumber: f.identityNumber.trim() } : {}),
              ...(f.cpf.trim() ? { cpf: f.cpf.trim() } : {}),
              ...(f.photoDataUrl ? { photoDataUrl: f.photoDataUrl } : {}),
            }],
          }));
          if (me.role === "cuidador") onSelectPatient(patientId);
          setF({ name: "", age: "", birthDate: "", susCard: "", healthPlan: "", identityNumber: "", cpf: "", notes: "", photoDataUrl: "" });
          setShowExtraFields(false);
          setPhotoError("");
        }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground">Novo paciente</h2>
              <p className="text-xs text-muted-foreground">Os dados preenchidos também serão usados no cartão de identificação.</p>
            </div>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">Campos essenciais</span>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(150px,1fr)_100px]">
            <label className="min-w-0 space-y-1 text-xs font-semibold text-foreground">
              Nome completo *
              <input id="patient-name" className={cls(input, "w-full")} placeholder="Nome do paciente" autoComplete="name" value={f.name} onChange={(event) => setF((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="min-w-0 space-y-1 text-xs font-semibold text-foreground">
              Data de nascimento
              <input className={cls(input, "w-full")} type="date" value={f.birthDate} onChange={(event) => updateBirthDate(event.target.value)} />
            </label>
            <label className="min-w-0 space-y-1 text-xs font-semibold text-foreground">
              Idade
              <input className={cls(input, "w-full")} type="number" min="0" max="130" step="1" placeholder="Anos" aria-label="Idade" value={f.age} disabled={Boolean(f.birthDate && getPatientAge(f.birthDate) !== null)} onChange={(event) => setF((current) => ({ ...current, age: event.target.value }))} />
            </label>
          </div>

          <button type="button" aria-expanded={showExtraFields} onClick={() => setShowExtraFields((current) => !current)} className="flex min-h-9 w-full items-center justify-between rounded-xl border border-border bg-background/70 px-3 py-2 text-left text-xs font-semibold text-foreground transition hover:bg-muted">
            <span>{showExtraFields ? "Ocultar dados adicionais" : "Adicionar dados do cartão e foto (opcional)"}</span>
            <span className="text-primary">{showExtraFields ? "−" : "+"}</span>
          </button>

          {showExtraFields && (
            <div className="space-y-3 rounded-xl border border-border bg-background/50 p-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <label className="min-w-0 space-y-1 text-xs font-semibold text-foreground">
                  Cartão do SUS (CNS)
                  <input className={cls(input, "w-full")} placeholder="Número do CNS" inputMode="numeric" value={f.susCard} onChange={(event) => setF((current) => ({ ...current, susCard: event.target.value }))} />
                </label>
                <label className="min-w-0 space-y-1 text-xs font-semibold text-foreground">
                  Plano de saúde
                  <input className={cls(input, "w-full")} placeholder="Operadora / número" value={f.healthPlan} onChange={(event) => setF((current) => ({ ...current, healthPlan: event.target.value }))} />
                </label>
                <label className="min-w-0 space-y-1 text-xs font-semibold text-foreground">
                  RG
                  <input className={cls(input, "w-full")} placeholder="Número da identidade" value={f.identityNumber} onChange={(event) => setF((current) => ({ ...current, identityNumber: event.target.value }))} />
                </label>
                <label className="min-w-0 space-y-1 text-xs font-semibold text-foreground">
                  CPF
                  <input className={cls(input, "w-full")} placeholder="000.000.000-00" inputMode="numeric" value={f.cpf} onChange={(event) => setF((current) => ({ ...current, cpf: event.target.value }))} />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted">
                  {f.photoDataUrl ? <img src={f.photoDataUrl} alt="Prévia da foto do paciente" className="h-full w-full object-cover" /> : <Camera className="h-5 w-5 text-muted-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                  <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted">
                    <ImagePlus className="h-4 w-4" />{f.photoDataUrl ? "Trocar foto" : "Adicionar foto"}
                    <input className="sr-only" type="file" accept="image/*" onChange={(event) => { void addPhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                  </label>
                  {f.photoDataUrl && <button type="button" onClick={() => setF((current) => ({ ...current, photoDataUrl: "" }))} className="ml-2 text-xs font-semibold text-destructive hover:underline">Remover</button>}
                  <p className="mt-1 text-[10px] text-muted-foreground">Opcional · imagem reduzida automaticamente.</p>
                </div>
              </div>
              {photoError && <p role="alert" className="text-xs font-semibold text-destructive">{photoError}</p>}
            </div>
          )}

          <label className="block space-y-1 text-xs font-semibold text-foreground">
            Observações para o cuidador (opcional)
            <textarea className={cls(input, "min-h-9 w-full")} rows={2} placeholder="Ex.: prefere tomar os medicamentos após o café." value={f.notes} onChange={(event) => setF((current) => ({ ...current, notes: event.target.value }))} />
          </label>
          {err && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">{err}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-[10px] text-muted-foreground">* Obrigatório. Idade ou nascimento.</p>
            <button className={cls(btnPrimary, "min-h-10 px-4")}><Plus className="h-4 w-4" />Adicionar paciente</button>
          </div>
        </form>
      )}

      {patients.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {patients.map((p) => {
            const isActive = activePatientId === p.id;
            return (
              <article key={p.id} className={cls(card, isActive && me.role === "cuidador" ? "border-primary/50 ring-1 ring-primary/15" : "")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-display text-lg font-semibold text-foreground">{p.name}</p>
                    <p className="text-sm text-muted-foreground">{p.age} anos</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" aria-label={`Editar paciente ${p.name}`} title="Editar paciente" className="grid h-9 w-9 place-items-center rounded-full text-primary hover:bg-primary/10" onClick={() => beginPatientEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" aria-label={`Excluir paciente ${p.name}`} className="grid h-9 w-9 place-items-center rounded-full text-destructive hover:bg-destructive/10" onClick={() => {
                      if (confirm(`Excluir ${p.name} e seus medicamentos?`)) {
                        setState((state) => ({ ...state, patients: state.patients.filter((x) => x.id !== p.id), meds: state.meds.filter((m) => m.patientId !== p.id), doses: state.doses.filter((d) => d.patientId !== p.id) }));
                        if (activePatientId === p.id) onSelectPatient("");
                      }
                    }}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                {editingPatientId === p.id ? (
                  <form className="mt-3 space-y-3 rounded-2xl border border-primary/25 bg-primary/[0.04] p-3" onSubmit={(event) => savePatientEdit(event, p.id)}>
                    <p className="text-sm font-bold text-foreground">Editar dados do paciente</p>
                    <label className="block space-y-1 text-xs font-semibold text-foreground">
                      Nome
                      <input autoFocus className={input} value={editPatientForm.name} onChange={(event) => setEditPatientForm((current) => ({ ...current, name: event.target.value }))} />
                    </label>
                    <label className="block space-y-1 text-xs font-semibold text-foreground">
                      Idade
                      <input className={input} type="number" min="0" step="1" value={editPatientForm.age} onChange={(event) => setEditPatientForm((current) => ({ ...current, age: event.target.value }))} />
                    </label>
                    <label className="block space-y-1 text-xs font-semibold text-foreground">
                      Observações
                      <textarea className={input} rows={3} value={editPatientForm.notes} onChange={(event) => setEditPatientForm((current) => ({ ...current, notes: event.target.value }))} />
                    </label>
                    {editPatientError && <p role="alert" className="text-xs font-semibold text-destructive">{editPatientError}</p>}
                    <div className="flex flex-wrap gap-2">
                      <button type="submit" className={cls(btnPrimary, "flex-1")}><CheckCircle2 className="h-4 w-4" />Salvar alterações</button>
                      <button type="button" className={btnOutline} onClick={() => { setEditingPatientId(null); setEditPatientError(""); }}>Cancelar</button>
                    </div>
                  </form>
                ) : (
                  <>
                    {p.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{p.notes}</p>}
                  </>
                )}
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <button type="button" onClick={() => setViewingPatientCardId(p.id)} className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-sm font-bold text-primary transition hover:bg-primary/10">
                    <UserRound className="h-4 w-4" />Ver cartão
                  </button>
                  <button type="button" onClick={() => onOpenRoutine(p.id)} className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:border-primary/30 hover:bg-primary/5">
                    <CalendarDays className="h-4 w-4 text-primary" />Rotina
                  </button>
                  {me.role === "cuidador" ? (
                    <button type="button" onClick={() => onSelectPatient(isActive ? "" : p.id)} className={cls("flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition", isActive ? "border-primary/25 bg-primary/10 text-primary" : "border-border text-foreground hover:bg-muted")}>
                      {isActive ? <><CheckCircle2 className="h-4 w-4" />Selecionado</> : "Selecionar"}
                    </button>
                  ) : (
                    <span className="flex min-h-10 items-center justify-center rounded-xl bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">Cadastro de paciente</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {viewingPatientCardId && patients.find((patient) => patient.id === viewingPatientCardId) && (
        <PatientIdentityCard
          patient={patients.find((patient) => patient.id === viewingPatientCardId)!}
          onClose={() => setViewingPatientCardId(null)}
          onSave={(updated) => {
            setState((state) => ({
              ...state,
              patients: state.patients.map((patient) => patient.id === updated.id ? updated : patient),
            }));
          }}
        />
      )}
    </div>
  );
}

function defaultQuantityUnit(presentation: string) {
  if (presentation === "Comprimido") return "Comprimido(s)";
  if (presentation === "Cápsula") return "Cápsula(s)";
  if (presentation === "Drágea") return "Drágea(s)";
  if (presentation === "Solução oral" || presentation === "Suspensão") return "mL";
  if (presentation === "Gotas") return "Gota(s)";
  if (presentation === "Sachê") return "Sachê(s)";
  if (presentation === "Ampola") return "Ampola(s)";
  if (presentation === "Spray") return "Jato(s)";
  if (presentation === "Creme" || presentation === "Pomada") return "Aplicação(ões)";
  return "Unidade(s)";
}

function TimeWheelColumn({ label, values, selected, onChange }: {
  label: string;
  values: string[];
  selected: string;
  onChange: (value: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const itemHeight = 44;
  const selectedIndex = Math.max(0, values.indexOf(selected));

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = selectedIndex * itemHeight;
  }, [selectedIndex]);

  const selectIndex = (index: number) => {
    const bounded = Math.max(0, Math.min(values.length - 1, index));
    listRef.current?.scrollTo({ top: bounded * itemHeight, behavior: "smooth" });
    onChange(values[bounded] ?? values[0] ?? "");
  };

  return (
    <div className="min-w-0 flex-1">
      <p className="mb-2 text-center text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="relative h-44 overflow-hidden rounded-2xl border border-border bg-background">
        <div className="pointer-events-none absolute inset-x-1 top-1/2 z-10 h-11 -translate-y-1/2 rounded-xl border border-primary/25 bg-primary/10" />
        <div
          ref={listRef}
          className="relative z-0 h-full overflow-y-auto overscroll-contain snap-y snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={(event) => {
            const index = Math.max(0, Math.min(values.length - 1, Math.round(event.currentTarget.scrollTop / itemHeight)));
            const next = values[index];
            if (next && next !== selected) onChange(next);
          }}
        >
          <div aria-hidden="true" className="h-[66px]" />
          {values.map((value, index) => (
            <button
              key={value}
              type="button"
              onClick={() => selectIndex(index)}
              className={cls(
                "flex h-11 w-full snap-center items-center justify-center text-lg tabular-nums transition-colors",
                value === selected ? "font-extrabold text-primary" : "font-medium text-muted-foreground/70"
              )}
              aria-pressed={value === selected}
            >
              {value}
            </button>
          ))}
          <div aria-hidden="true" className="h-[66px]" />
        </div>
      </div>
    </div>
  );
}

type MedicationEditorForm = {
  patientId: string;
  name: string;
  strengthValue: string;
  strengthUnit: string;
  presentation: string;
  quantityPerDose: string;
  quantityUnit: string;
  schedule: DoseSchedule[];
  stock: string;
  tolerance: string;
};

function MedicationEditor({ med, patients, onCancel, onSave }: {
  med: Med;
  patients: { id: string; name: string; ownerId: string }[];
  onCancel: () => void;
  onSave: (updated: Med) => void;
}) {
  const [form, setForm] = useState<MedicationEditorForm>(() => ({
    patientId: med.patientId,
    name: med.name,
    strengthValue: med.strengthValue === undefined ? "" : String(med.strengthValue),
    strengthUnit: med.strengthUnit ?? "mg",
    presentation: med.presentation ?? "Outro",
    quantityPerDose: String(med.quantityPerDose ?? 1),
    quantityUnit: med.quantityUnit ?? (med.presentation ? defaultQuantityUnit(med.presentation) : "Unidade(s)"),
    schedule: med.schedule?.length
      ? med.schedule.map((slot) => ({ ...slot }))
      : med.times.map((time) => ({ time, period: "personalizado" as DosePeriod })),
    stock: String(med.stock),
    tolerance: String(med.tolerance ?? 0),
  }));
  const [error, setError] = useState("");
  const [confirmedUnitChange, setConfirmedUnitChange] = useState(false);
  const originalQuantityUnit = med.quantityUnit ?? (med.presentation ? defaultQuantityUnit(med.presentation) : "Unidade(s)");
  const quantityUnitChanged = form.quantityUnit !== originalQuantityUnit;

  const updateSchedule = (index: number, patch: Partial<DoseSchedule>) => {
    setForm((current) => ({
      ...current,
      schedule: current.schedule.map((slot, slotIndex) => slotIndex === index ? { ...slot, ...patch } : slot),
    }));
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const name = form.name.trim();
    const quantity = Number(form.quantityPerDose);
    const stock = Number(form.stock);
    const strengthText = form.strengthValue.trim();
    const strength = strengthText === "" ? undefined : Number(strengthText);
    const times = form.schedule.map((slot) => slot.time);

    if (!name) return setError("Informe o nome do medicamento.");
    if (!patients.some((patient) => patient.id === form.patientId)) return setError("Selecione um paciente válido.");
    if (strengthText !== "" && (!Number.isFinite(strength) || (strength ?? 0) <= 0)) return setError("A concentração precisa ser maior que zero ou ficar em branco para manter o cadastro antigo.");
    if (!Number.isFinite(quantity) || quantity <= 0) return setError("Informe uma quantidade por dose maior que zero.");
    if (!Number.isFinite(stock) || stock < 0) return setError("Informe o estoque atual, igual ou maior que zero.");
    if (quantityUnitChanged && !confirmedUnitChange) return setError("Confirme que recalculou o estoque na nova unidade antes de salvar.");
    if (!form.schedule.length || form.schedule.length > 6
      || times.some((time) => !/^([01]\\d|2[0-3]):([0-5]\\d)$/.test(time))
      || new Set(times).size !== times.length) {
      return setError("Use de 1 a 6 horários válidos e diferentes.");
    }

    const orderedSchedule = [...form.schedule].sort((a, b) => a.time.localeCompare(b.time));
    const dose = strength === undefined
      ? med.dose
      : strength + " " + form.strengthUnit + " · " + quantity + " " + form.quantityUnit.toLowerCase();
    const selectedPatient = patients.find((patient) => patient.id === form.patientId);
    const updated: Med = {
      ...med,
      ownerId: selectedPatient?.ownerId ?? med.ownerId,
      patientId: form.patientId,
      name,
      dose,
      times: orderedSchedule.map((slot) => slot.time),
      schedule: orderedSchedule,
      ...(strength === undefined ? {} : { strengthValue: strength, strengthUnit: form.strengthUnit }),
      presentation: form.presentation,
      quantityPerDose: quantity,
      quantityUnit: form.quantityUnit,
      stock,
      initialStock: Math.max(med.initialStock ?? med.stock, stock),
      tolerance: Math.max(0, Number(form.tolerance) || 0),
    };
    onSave(updated);
  };

  return (
    <form className="space-y-3 rounded-2xl border border-primary/25 bg-primary/[0.04] p-3 sm:p-4" onSubmit={save}>
      <div>
        <p className="text-sm font-bold text-foreground">Editar medicamento</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Atualize os dados, o paciente, os horários e o estoque. O histórico de doses já registradas será preservado.</p>
      </div>
      <label className="block space-y-1 text-xs font-semibold text-foreground">
        Nome do medicamento
        <input autoFocus className={input} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block space-y-1 text-xs font-semibold text-foreground">
          Concentração
          <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
            <input className={input} type="number" min="0.001" step="any" inputMode="decimal" placeholder="Ex.: 500" value={form.strengthValue} onChange={(event) => setForm((current) => ({ ...current, strengthValue: event.target.value }))} />
            <select aria-label="Unidade da concentração" className={input} value={form.strengthUnit} onChange={(event) => setForm((current) => ({ ...current, strengthUnit: event.target.value }))}>
              {STRENGTH_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </div>
        </label>
        <label className="block space-y-1 text-xs font-semibold text-foreground">
          Apresentação
          <select className={input} value={form.presentation} onChange={(event) => {
            setConfirmedUnitChange(false);
            setForm((current) => ({ ...current, presentation: event.target.value, quantityUnit: defaultQuantityUnit(event.target.value) }));
          }}>
            {PRESENTATIONS.map((presentation) => <option key={presentation} value={presentation}>{presentation}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-xs font-semibold text-foreground">
          Quantidade por dose
          <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-2">
            <input className={input} type="number" min="0.01" step="0.01" inputMode="decimal" value={form.quantityPerDose} onChange={(event) => setForm((current) => ({ ...current, quantityPerDose: event.target.value }))} />
            <select aria-label="Unidade por dose" className={input} value={form.quantityUnit} onChange={(event) => {
              setConfirmedUnitChange(false);
              setForm((current) => ({ ...current, quantityUnit: event.target.value }));
            }}>
              {QUANTITY_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </div>
        </label>
        <label className="block space-y-1 text-xs font-semibold text-foreground">
          Paciente
          <select className={input} value={form.patientId} onChange={(event) => setForm((current) => ({ ...current, patientId: event.target.value }))}>
            {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
          </select>
        </label>
        <div className="space-y-2 rounded-2xl border border-primary/20 bg-primary/[0.045] p-3 sm:col-span-2">
          <label className="block space-y-1 text-xs font-semibold text-foreground">
            Total disponível agora ({form.quantityUnit.toLowerCase()})
            <input className={cls(input, "min-h-12 text-base font-bold tabular-nums")} type="number" min="0" step="0.01" inputMode="decimal" value={form.stock} onChange={(event) => setForm((current) => ({ ...current, stock: event.target.value }))} />
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] font-semibold text-muted-foreground">Somar reposição:</span>
            {[1, 10, 30].map((amount) => <button key={amount} type="button" className="rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-bold text-foreground hover:bg-muted" onClick={() => setForm((current) => ({ ...current, stock: String(Math.max(0, Number(current.stock) || 0) + amount) }))}>+{amount}</button>)}
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">Informe o total real que existe no momento. Os atalhos somam uma reposição ao valor atual; salvar não altera doses que já foram registradas.</p>
        </div>
        <label className="block space-y-1 text-xs font-semibold text-foreground">
          Tolerância do atraso (minutos)
          <input className={input} type="number" min="0" step="1" value={form.tolerance} onChange={(event) => setForm((current) => ({ ...current, tolerance: event.target.value }))} />
        </label>
      </div>

      {quantityUnitChanged && (
        <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs leading-relaxed text-foreground">
          <input type="checkbox" className="mt-0.5" checked={confirmedUnitChange} onChange={(event) => setConfirmedUnitChange(event.target.checked)} />
          <span>Recalculei o estoque atual de <strong>{originalQuantityUnit}</strong> para <strong>{form.quantityUnit}</strong>. O número informado acima representa a nova unidade.</span>
        </label>
      )}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-foreground">Horários e períodos</p>
          <button type="button" disabled={form.schedule.length >= 6} className={cls(btnOutline, "px-2.5 py-1.5 text-xs")} onClick={() => setForm((current) => ({
            ...current,
            schedule: [...current.schedule, { time: "", period: "personalizado" }],
          }))}><Plus className="h-3.5 w-3.5" />Adicionar horário</button>
        </div>
        {form.schedule.map((slot, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_2.25rem] items-center gap-2">
            <label className="sr-only" htmlFor={"med-edit-time-" + med.id + "-" + index}>Horário da dose {index + 1}</label>
            <input id={"med-edit-time-" + med.id + "-" + index} className={input} type="time" value={slot.time} onChange={(event) => updateSchedule(index, { time: event.target.value })} />
            <select className={input} aria-label={"Período da dose " + (index + 1)} value={slot.period} onChange={(event) => updateSchedule(index, { period: event.target.value as DosePeriod })}>
              {DOSE_PERIODS.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}
            </select>
            <button type="button" aria-label={"Remover horário " + (index + 1)} disabled={form.schedule.length <= 1} className="grid h-10 w-9 place-items-center rounded-xl text-destructive hover:bg-destructive/10 disabled:opacity-30" onClick={() => setForm((current) => ({ ...current, schedule: current.schedule.filter((_, slotIndex) => slotIndex !== index) }))}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {med.strengthValue === undefined && (
        <p className="rounded-xl bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          Este medicamento veio de um cadastro antigo. A concentração não foi presumida: deixe o campo em branco para manter a descrição original ou preencha conforme a embalagem.
        </p>
      )}
      {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2 border-t border-border/70 pt-3">
        <button type="submit" className={cls(btnPrimary, "flex-1")}><CheckCircle2 className="h-4 w-4" />Salvar alterações</button>
        <button type="button" className={btnOutline} onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

function Meds({ me, activePatientId = "", go }: {
  me: User;
  activePatientId?: string;
  go: (page: Page) => void;
}) {
  const patients = useStore((s) => s.patients.filter((p) => me.role === "mestre" || p.ownerId === me.id));
  const allMeds = useStore((s) => s.meds.filter((m) => (me.role === "mestre" || m.ownerId === me.id) && !m.archivedAt));
  const meds = allMeds.filter((m) => !activePatientId || m.patientId === activePatientId);
  const [step, setStep] = useState(1);
  const [timePickerIndex, setTimePickerIndex] = useState<number | null>(null);
  const [editingMedicationId, setEditingMedicationId] = useState<string | null>(null);
  const [stockEditorId, setStockEditorId] = useState<string | null>(null);
  const [stockMode, setStockMode] = useState<"add" | "set">("add");
  const [stockAmount, setStockAmount] = useState("30");
  const [stockError, setStockError] = useState("");
  const [f, setF] = useState<{
    patientId: string;
    name: string;
    strengthValue: string;
    strengthUnit: string;
    presentation: string;
    quantityPerDose: string;
    quantityUnit: string;
    schedule: DoseSchedule[];
    stock: string;
    tolerance: string;
  }>({
    patientId: activePatientId,
    name: "",
    strengthValue: "",
    strengthUnit: "mg",
    presentation: "Comprimido",
    quantityPerDose: "1",
    quantityUnit: "Comprimido(s)",
    schedule: [{ time: "08:00", period: "manhã" }],
    stock: "30",
    tolerance: "15",
  });
  const [err, setErr] = useState("");

  useEffect(() => {
    if (activePatientId) setF((current) => ({ ...current, patientId: activePatientId }));
  }, [activePatientId]);

  const selectedPatientId = patients.some((p) => p.id === f.patientId)
    ? f.patientId
    : activePatientId || patients[0]?.id || "";

  const updateSchedule = (index: number, patch: Partial<DoseSchedule>) => {
    setF((current) => ({
      ...current,
      schedule: current.schedule.map((slot, slotIndex) => slotIndex === index ? { ...slot, ...patch } : slot),
    }));
  };

  const setFrequency = (count: number) => {
    setF((current) => ({
      ...current,
      schedule: Array.from({ length: count }, (_, index) => current.schedule[index] ?? {
        time: DEFAULT_TIMES[index] ?? "08:00",
        period: DEFAULT_PERIODS[index] ?? "personalizado",
      }),
    }));
  };

  const validSchedule = () => {
    const values = f.schedule.map((slot) => slot.time);
    return values.length >= 1
      && values.length <= 6
      && values.every((time) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(time))
      && new Set(values).size === values.length;
  };

  const focusMedicationName = () => {
    setStep(1);
    document.getElementById("medication-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("medication-name")?.focus();
  };

  const nextStep = () => {
    setErr("");
    if (step === 1) {
      const strength = Number(f.strengthValue);
      const quantity = Number(f.quantityPerDose);
      if (!f.name.trim()) return setErr("Informe o nome do medicamento.");
      if (!Number.isFinite(strength) || strength <= 0) return setErr("Informe uma concentração ou dosagem numérica maior que zero.");
      if (!Number.isFinite(quantity) || quantity <= 0) return setErr("Informe quanto será utilizado em cada dose.");
    }
    if (step === 2 && !validSchedule()) {
      return setErr("Confira os horários. Cada dose precisa ter um horário válido e diferente.");
    }
    setStep((current) => Math.min(3, current + 1));
  };

  const saveMedication = (event: React.FormEvent) => {
    event.preventDefault();
    setErr("");
    const patient = patients.find((p) => p.id === selectedPatientId);
    if (!patient) return setErr("Selecione o paciente que receberá este medicamento.");
    const strength = Number(f.strengthValue);
    const quantity = Number(f.quantityPerDose);
    const stock = Number(f.stock);
    if (!f.name.trim() || !Number.isFinite(strength) || strength <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
      setStep(1);
      return setErr("Confira o nome, a dosagem e a quantidade usada por dose.");
    }
    if (!validSchedule()) { setStep(2); return setErr("Confira os horários informados."); }
    if (!Number.isFinite(stock) || stock < 0) return setErr("Informe uma quantidade disponível igual ou maior que zero.");
    const orderedSchedule = [...f.schedule].sort((a, b) => a.time.localeCompare(b.time));
    const times = orderedSchedule.map((slot) => slot.time);
    const medicationId = uid();
    const doseSummary = strength + " " + f.strengthUnit + " · " + quantity + " " + f.quantityUnit.toLowerCase();
    setState((s) => ({
      ...s,
      meds: [...s.meds, {
        id: medicationId,
        ownerId: patient.ownerId,
        patientId: patient.id,
        name: f.name.trim(),
        dose: doseSummary,
        times,
        schedule: orderedSchedule,
        strengthValue: strength,
        strengthUnit: f.strengthUnit,
        presentation: f.presentation,
        quantityPerDose: quantity,
        quantityUnit: f.quantityUnit,
        stock,
        initialStock: stock,
        tolerance: Math.max(0, Number(f.tolerance) || 0),
      }],
    }));
    setF({
      patientId: activePatientId || patient.id,
      name: "",
      strengthValue: "",
      strengthUnit: "mg",
      presentation: "Comprimido",
      quantityPerDose: "1",
      quantityUnit: "Comprimido(s)",
      schedule: [{ time: "08:00", period: "manhã" }],
      stock: "30",
      tolerance: "15",
    });
    setStep(1);
    setTimePickerIndex(null);
  };

  const applyStockAdjustment = (med: Med) => {
    const amount = Number(stockAmount);
    if (!Number.isFinite(amount) || amount < 0 || (stockMode === "add" && amount <= 0)) {
      setStockError(stockMode === "add" ? "Informe uma quantidade de reposição maior que zero." : "Informe um total válido, igual ou maior que zero.");
      return;
    }
    setState((state) => ({
      ...state,
      meds: state.meds.map((item) => {
        if (item.id !== med.id) return item;
        const currentBaseline = item.initialStock ?? item.stock;
        const nextStock = stockMode === "add" ? item.stock + amount : amount;
        return {
          ...item,
          stock: nextStock,
          initialStock: stockMode === "add" ? currentBaseline + amount : Math.max(currentBaseline, nextStock),
        };
      }),
    }));
    setStockEditorId(null);
    setStockError("");
    setStockAmount("30");
    setStockMode("add");
  };

  const pickerSlot = timePickerIndex === null ? null : f.schedule[timePickerIndex];
  const hourValues = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
  const minuteValues = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

  return (
    <div className="space-y-6">
      <div>
        <T k="med-title" as="h1" className="font-display text-3xl text-foreground">Medicamentos</T>
        <p className="mt-1 text-sm text-muted-foreground">Cadastre o medicamento, os horários e o paciente em três etapas.</p>
      </div>

      {patients.length === 0 ? (
        <EmptyState
          icon={<UsersRound className="h-6 w-6" />}
          title="Primeiro, cadastre um paciente"
          description="Cada medicamento precisa estar associado à pessoa que vai utilizá-lo. O cadastro do paciente leva poucos instantes."
          actionLabel="Ir para pacientes"
          onAction={() => go("pacientes")}
        />
      ) : (
        <form id="medication-form" className={cls(card, "space-y-4")} onSubmit={saveMedication}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">Novo medicamento</p>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">Etapa {step} de 3</span>
          </div>
          <div className="grid grid-cols-3 gap-2" aria-label="Progresso do cadastro">
            {["Medicamento", "Horários", "Paciente e estoque"].map((label, index) => (
              <div key={label} className="space-y-1.5">
                <div className={cls("h-1.5 rounded-full", step >= index + 1 ? "bg-primary" : "bg-muted")} />
                <p className={cls("text-[10px] leading-tight sm:text-xs", step >= index + 1 ? "font-semibold text-primary" : "text-muted-foreground")}>{label}</p>
              </div>
            ))}
          </div>

          {step === 1 && (
            <section className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/[0.06] p-3.5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
                  <Pill className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-xl font-semibold text-foreground">Identifique o medicamento</h2>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">Use as informações da embalagem ou da prescrição.</p>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-border/80 bg-background/65 p-4">
                <label className="block space-y-1.5 text-sm font-bold text-foreground">
                  Nome do medicamento
                  <input id="medication-name" className={cls(input, "min-h-12 text-base font-semibold")} autoComplete="off" required placeholder="Ex.: Losartana" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                  <span className="block text-xs font-normal text-muted-foreground">Digite o nome como aparece na embalagem.</span>
                </label>
              </div>

              <div className="space-y-3 rounded-2xl border border-border/80 bg-background/65 p-4">
                <div>
                  <p className="text-sm font-bold text-foreground">Dosagem e apresentação</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Essas informações ajudam a identificar exatamente qual versão do medicamento será usada.</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block min-w-0 space-y-1.5 text-sm font-semibold text-foreground">
                    Concentração da embalagem
                    <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
                      <input className={input} type="number" inputMode="decimal" min="0.001" step="any" required placeholder="Ex.: 500" value={f.strengthValue} onChange={(e) => setF({ ...f, strengthValue: e.target.value })} />
                      <select aria-label="Unidade da concentração" className={input} value={f.strengthUnit} onChange={(e) => setF({ ...f, strengthUnit: e.target.value })}>
                        {STRENGTH_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                      </select>
                    </div>
                  </label>

                  <label className="block min-w-0 space-y-1.5 text-sm font-semibold text-foreground">
                    Forma de apresentação
                    <select className={input} value={f.presentation} onChange={(e) => {
                      const presentation = e.target.value;
                      setF((current) => ({ ...current, presentation, quantityUnit: defaultQuantityUnit(presentation) }));
                    }}>
                      {PRESENTATIONS.map((presentation) => <option key={presentation} value={presentation}>{presentation}</option>)}
                    </select>
                  </label>

                  <label className="block min-w-0 space-y-1.5 text-sm font-semibold text-foreground sm:col-span-2">
                    Quantidade utilizada em cada horário
                    <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-2">
                      <input className={input} type="number" inputMode="decimal" min="0.01" step="0.01" required placeholder="Ex.: 1" value={f.quantityPerDose} onChange={(e) => setF({ ...f, quantityPerDose: e.target.value })} />
                      <select aria-label="Unidade utilizada em cada dose" className={input} value={f.quantityUnit} onChange={(e) => setF({ ...f, quantityUnit: e.target.value })}>
                        {QUANTITY_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                      </select>
                    </div>
                    <span className="block text-xs font-normal text-muted-foreground">Exemplo: 1 comprimido, 5 mL ou 2 gotas, conforme a orientação recebida.</span>
                  </label>
                </div>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="font-display text-xl font-semibold text-foreground">Horários das doses</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Escolha quantas vezes ao dia e configure cada alarme.</p>
                </div>
                <label className="w-full rounded-2xl border border-primary/35 bg-primary/[0.08] p-3 text-foreground shadow-sm sm:w-44">
                  <span className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-extrabold text-foreground">Vezes ao dia</span>
                    <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-extrabold tabular-nums text-primary-foreground">{f.schedule.length}x</span>
                  </span>
                  <select className={cls(input, "min-h-11 border-primary/35 bg-card py-2 text-sm font-bold text-foreground")} value={f.schedule.length} onChange={(e) => setFrequency(Number(e.target.value))}>
                    {[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} {count === 1 ? "vez ao dia" : "vezes ao dia"}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
                {f.schedule.map((slot, index) => (
                  <div key={index} className="min-w-0 rounded-2xl border border-border bg-background/80 p-2">
                    <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Dose {index + 1}</p>
                    <button
                      type="button"
                      onClick={() => setTimePickerIndex(index)}
                      aria-label={"Escolher horário da dose " + (index + 1)}
                      className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-primary/20 bg-primary/5 px-2 py-2 text-base font-extrabold tabular-nums text-primary transition hover:bg-primary/10"
                    >
                      <Clock3 className="h-4 w-4 shrink-0" />{slot.time}
                    </button>
                    <select
                      aria-label={"Período da dose " + (index + 1)}
                      className="mt-2 h-9 w-full min-w-0 rounded-lg border border-input bg-card px-1.5 text-[11px] font-semibold text-foreground"
                      value={slot.period}
                      onChange={(e) => updateSchedule(index, { period: e.target.value as DosePeriod })}
                    >
                      {DOSE_PERIODS.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <p className="rounded-xl bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                Os períodos ajudam a identificar cada dose. Os horários iniciais são apenas sugestões: ajuste todos conforme a prescrição ou orientação profissional.
              </p>
            </section>
          )}

          {step === 3 && (
            <section className="space-y-3">
              <div>
                <h2 className="font-display text-xl font-semibold text-foreground">Paciente e quantidade disponível</h2>
                <p className="mt-1 text-sm text-muted-foreground">Informe o estoque usando a mesma unidade escolhida para cada dose.</p>
              </div>
              <label className="block space-y-1.5 text-sm font-medium text-foreground">
                Paciente
                <select className={input} required value={selectedPatientId} onChange={(e) => setF({ ...f, patientId: e.target.value })}>
                  {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5 text-sm font-medium text-foreground">
                Quantidade disponível ({f.quantityUnit.toLowerCase()})
                <input className={input} type="number" inputMode="decimal" min="0" step="0.01" required value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} />
              </label>
              <label className="block space-y-1.5 text-sm font-medium text-foreground">
                Avisar após atraso (minutos)
                <input className={input} type="number" min="0" step="1" value={f.tolerance} onChange={(e) => setF({ ...f, tolerance: e.target.value })} />
              </label>
              <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                Quando restarem 10% ou menos do estoque inicial, a quantidade será destacada em vermelho e negrito.
              </p>
            </section>
          )}

          {err && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <button type="button" className={btnOutline} disabled={step === 1} onClick={() => { setErr(""); setStep((current) => Math.max(1, current - 1)); }}>Voltar</button>
            {step < 3
              ? <button type="button" className={btnPrimary} onClick={nextStep}>Continuar<ArrowRight className="h-4 w-4" /></button>
              : <button type="submit" className={btnPrimary}><Plus className="h-4 w-4" />Salvar medicamento</button>}
          </div>
        </form>
      )}

      {patients.length > 0 && meds.length === 0 && (
        <EmptyState
          icon={<PillBottle className="h-6 w-6" />}
          title={activePatientId ? "Nenhum medicamento para este paciente" : "Sua lista de medicamentos está vazia"}
          description={activePatientId ? "Cadastre o primeiro medicamento associado à pessoa selecionada." : "Depois do cadastro, horários e doses aparecem na agenda automaticamente."}
          actionLabel="Começar cadastro"
          onAction={focusMedicationName}
        />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {meds.map((m) => {
          const level = stockLevel(m);
          const schedule = m.schedule?.length
            ? m.schedule
            : m.times.map((time) => ({ time, period: "personalizado" as DosePeriod }));
          const summary = m.strengthValue !== undefined
            ? String(m.strengthValue) + " " + (m.strengthUnit ?? "mg") + " · " + (m.quantityPerDose ?? 1) + " " + (m.quantityUnit ?? "unidade(s)")
            : m.dose;
          return (
            <article key={m.id} className={cls(card, "space-y-3 !p-4 sm:!p-5")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-display text-lg font-semibold text-foreground">{m.name}</p>
                  <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{summary}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{patients.find((p) => p.id === m.patientId)?.name}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" aria-label={"Editar medicamento " + m.name} title="Editar medicamento" className="grid h-9 w-9 place-items-center rounded-full text-primary hover:bg-primary/10" onClick={() => setEditingMedicationId(m.id)}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label={"Arquivar medicamento " + m.name} title="Arquivar medicamento" className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => {
                    if (confirm("Arquivar " + m.name + "? O histórico de doses finalizadas será preservado e os lembretes pendentes serão removidos.")) {
                      setState((state) => ({
                        ...state,
                        meds: state.meds.map((item) => item.id === m.id ? { ...item, archivedAt: new Date().toISOString() } : item),
                        doses: state.doses.filter((dose) => dose.medId !== m.id || dose.status !== "pendente"),
                      }));
                    }
                  }}><Archive className="h-4 w-4" /></button>
                </div>
              </div>

              {editingMedicationId === m.id ? (
                <MedicationEditor
                  med={m}
                  patients={patients.map((patient) => ({ id: patient.id, name: patient.name, ownerId: patient.ownerId }))}
                  onCancel={() => setEditingMedicationId(null)}
                  onSave={(updated) => {
                    setState((state) => ({
                      ...state,
                      meds: state.meds.map((item) => item.id === updated.id ? updated : item),
                      // Keep completed records; recreate future pending reminders from the edited schedule.
                      doses: state.doses.filter((dose) => !(
                        dose.medId === updated.id
                        && dose.status === "pendente"
                        && new Date(dose.scheduledAt).getTime() > Date.now()
                      )),
                    }));
                    setEditingMedicationId(null);
                  }}
                />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {schedule.map((slot, index) => (
                      <div key={slot.time + "-" + index} className="rounded-xl border border-border/70 bg-background/60 px-2.5 py-2">
                        <p className="text-sm font-extrabold tabular-nums text-foreground">{slot.time}</p>
                        <p className="truncate text-[10px] font-semibold text-muted-foreground">{DOSE_PERIODS.find((period) => period.value === slot.period)?.label ?? "Personalizado"}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
                    <span className={cls(
                      "rounded-full px-3 py-1 text-sm tabular-nums",
                      level === "empty" || level === "low"
                        ? "bg-destructive/15 font-extrabold text-destructive"
                        : "bg-primary/15 font-semibold text-primary"
                    )}>
                      Estoque: {m.stock} {m.quantityUnit ?? "un."}
                    </span>
                    <span className={cls("text-[11px] font-semibold", level === "low" || level === "empty" ? "font-extrabold text-destructive" : "text-muted-foreground")}>
                      {level === "empty" ? "Estoque esgotado" : level === "low" ? (m.initialStock ? "10% ou menos restante" : "Estoque baixo") : "Estoque suficiente"}
                    </span>
                    <button type="button" className={cls(btnOutline, "ml-auto px-3 py-1.5 text-xs")} onClick={() => {
                      setStockEditorId((current) => current === m.id ? null : m.id);
                      setStockMode("add");
                      setStockAmount("30");
                      setStockError("");
                    }}>{stockEditorId === m.id ? "Fechar ajuste" : "Ajustar estoque"}</button>
                  </div>
                  {stockEditorId === m.id && (
                    <form className="space-y-3 rounded-2xl border border-primary/20 bg-primary/[0.045] p-3" onSubmit={(event) => { event.preventDefault(); applyStockAdjustment(m); }}>
                      <div><p className="text-xs font-bold text-foreground">Ajuste de estoque</p><p className="mt-0.5 text-[10px] text-muted-foreground">Escolha se está adicionando uma reposição ou corrigindo a contagem.</p></div>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" aria-pressed={stockMode === "add"} onClick={() => { setStockMode("add"); setStockError(""); }} className={cls("min-h-10 rounded-xl border px-2 text-[11px] font-bold", stockMode === "add" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground")}>Adicionar reposição</button>
                        <button type="button" aria-pressed={stockMode === "set"} onClick={() => { setStockMode("set"); setStockAmount(String(m.stock)); setStockError(""); }} className={cls("min-h-10 rounded-xl border px-2 text-[11px] font-bold", stockMode === "set" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground")}>Corrigir total atual</button>
                      </div>
                      <label className="block space-y-1 text-[11px] font-bold text-foreground">
                        {stockMode === "add" ? "Quantidade recebida" : "Quantidade que existe agora"} ({m.quantityUnit ?? "un."})
                        <input autoFocus className={cls(input, "min-h-11 font-bold tabular-nums")} type="number" min={stockMode === "add" ? "0.01" : "0"} step="0.01" inputMode="decimal" value={stockAmount} onChange={(event) => setStockAmount(event.target.value)} />
                      </label>
                      {stockMode === "add" && <div className="flex flex-wrap gap-1.5">{[1, 10, 30].map((amount) => <button key={amount} type="button" className="rounded-lg border border-border bg-card px-3 py-1.5 text-[10px] font-bold text-foreground hover:bg-muted" onClick={() => setStockAmount(String(amount))}>+{amount}</button>)}</div>}
                      <p className="text-[10px] leading-relaxed text-muted-foreground">{stockMode === "add" ? "A quantidade recebida será somada ao estoque que já existe." : "O valor substituirá a contagem atual. O histórico de doses permanece intacto."}</p>
                      {stockError && <p role="alert" className="text-[10px] font-semibold text-destructive">{stockError}</p>}
                      <div className="flex justify-end gap-2"><button type="button" className={btnOutline + " px-3 py-1.5 text-xs"} onClick={() => { setStockEditorId(null); setStockError(""); }}>Cancelar</button><button type="submit" className={btnPrimary + " px-3 py-1.5 text-xs"}>Salvar estoque</button></div>
                    </form>
                  )}
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{schedule.length} {schedule.length === 1 ? "dose" : "doses"} por dia</span>
                    <span className="text-right">Estoque estimado: {estimateStockDays(m) === null ? "—" : String(estimateStockDays(m)) + " dia(s)"}</span>
                  </div>
                  <label className="flex items-center justify-end gap-2 border-t border-border/70 pt-2 text-xs text-muted-foreground">
                    Tolerância
                    <input className="w-16 rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground" type="number" min="0" step="1" value={m.tolerance} onChange={(e) => setState((state) => ({ ...state, meds: state.meds.map((item) => (item.id === m.id ? { ...item, tolerance: Number(e.target.value) } : item)) }))} />
                    min
                  </label>
                </>
              )}
            </article>
          );
        })}
      </div>

      {pickerSlot && timePickerIndex !== null && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-foreground/55 p-3 backdrop-blur-sm"
          role="presentation"
          onClick={() => setTimePickerIndex(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dose-time-picker-title"
            className="w-full max-w-sm rounded-[1.75rem] border border-border bg-card p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Dose {timePickerIndex + 1}</p>
                <h3 id="dose-time-picker-title" className="font-display text-xl font-semibold text-foreground">Escolher horário</h3>
              </div>
              <span className="rounded-xl bg-primary/10 px-3 py-2 font-mono text-xl font-extrabold tabular-nums text-primary">{pickerSlot.time}</span>
            </div>
            <div className="flex gap-3">
              <TimeWheelColumn
                label="Hora"
                values={hourValues}
                selected={pickerSlot.time.slice(0, 2)}
                onChange={(hour) => updateSchedule(timePickerIndex, { time: hour + ":" + pickerSlot.time.slice(3, 5) })}
              />
              <TimeWheelColumn
                label="Minuto"
                values={minuteValues}
                selected={pickerSlot.time.slice(3, 5)}
                onChange={(minute) => updateSchedule(timePickerIndex, { time: pickerSlot.time.slice(0, 2) + ":" + minute })}
              />
            </div>
            <p className="my-3 text-center text-[11px] text-muted-foreground">Deslize as colunas para cima ou para baixo para ajustar.</p>
            <Button className="w-full" onClick={() => setTimePickerIndex(null)}>Confirmar horário</Button>
          </section>
        </div>,
        document.body
      )}
    </div>
  );
}

function HistoryPage({ me, activePatientId = "", go }: { me: User; activePatientId?: string; go: (page: Page) => void }) {
  const all = useStore((s) => s.doses); const meds = useStore((s) => s.meds); const patients = useStore((s) => s.patients);
  const [pid, setPid] = useState(activePatientId); const [st, setSt] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  useEffect(() => { setPid(activePatientId); }, [activePatientId]);
  const visibleDoses = all.filter((d) => me.role !== "cuidador" || d.ownerId === me.id);
  const rows = visibleDoses.filter((d) => (!pid || d.patientId === pid) && (!st || d.status === st)
    && (!from || d.scheduledAt.slice(0, 10) >= from) && (!to || d.scheduledAt.slice(0, 10) <= to)).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  const myPatients = patients.filter((p) => me.role !== "cuidador" || p.ownerId === me.id);
  const medById = new Map(meds.map((med) => [med.id, med]));
  const patientById = new Map(patients.map((patient) => [patient.id, patient]));
  const csv = () => {
    const lines = [["Data", "Paciente", "Medicamento", "Status"], ...rows.map((d) => [fmtDate(d.scheduledAt), patientById.get(d.patientId)?.name ?? "", medById.get(d.medId)?.name ?? "", d.status])];
    const blob = new Blob(["\uFEFF", lines.map((l) => l.map(csvCell).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "historico-dose-certa.csv"; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const report = summarizeDoseStatuses(rows.map((row) => row.status));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><T k="hist-title" as="h1" className="font-display text-3xl text-foreground">Histórico de doses</T>
        <div className="no-print flex gap-2"><button className={btnOutline} onClick={csv}><Download className="h-4 w-4" />CSV</button><button className={btnPrimary} onClick={() => window.print()}><Printer className="h-4 w-4" />Relatório</button></div></div>
      <div className="no-print grid gap-3 sm:grid-cols-4">
        <select className={input} aria-label="Filtrar por paciente" value={pid} onChange={(e) => setPid(e.target.value)}><option value="">Todos os pacientes</option>{myPatients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select className={input} aria-label="Filtrar por status da dose" value={st} onChange={(e) => setSt(e.target.value)}><option value="">Todos os status</option><option value="tomado">Tomado</option><option value="pendente">Pendente</option><option value="nao_tomado">Não tomado</option></select>
        <input className={input} aria-label="Data inicial" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className={input} aria-label="Data final" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className={card}>
        <p className="mb-2 text-sm text-muted-foreground">Adesão registrada: {report.adherencePercent}% ({report.taken} tomadas de {report.finalized} doses finalizadas)</p>
        <div className="mb-4 h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Adesão registrada" aria-valuemin={0} aria-valuemax={100} aria-valuenow={report.adherencePercent}><div className="h-full bg-primary" style={{ width: `${report.adherencePercent}%` }} /></div>
        <div className="mb-4 grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-xl bg-primary/10 p-3"><p className="text-muted-foreground">Tomadas</p><p className="text-lg font-bold text-foreground">{report.taken}</p></div>
          <div className="rounded-xl bg-destructive/10 p-3"><p className="text-muted-foreground">Não tomadas</p><p className="text-lg font-bold text-foreground">{report.missed}</p></div>
          <div className="rounded-xl bg-muted p-3"><p className="text-muted-foreground">Pendentes</p><p className="text-lg font-bold text-foreground">{report.pending}</p></div>
        </div>
        {rows.length === 0 ? (visibleDoses.length === 0 ? <EmptyState icon={<History className="h-6 w-6" />} title="Seu histórico ainda está vazio" description="Depois que você cadastrar medicamentos e registrar as doses, os acompanhamentos aparecerão aqui." actionLabel="Cadastrar medicamento" onAction={() => go("medicamentos")} /> : <p className="text-sm text-muted-foreground">Nenhum registro corresponde aos filtros selecionados.</p>) :
          <ul className="divide-y divide-border">{rows.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2 text-sm"><span className="w-32 shrink-0 text-muted-foreground">{fmtDate(d.scheduledAt)}</span>
              <span className="min-w-0 flex-1 truncate text-foreground">{medById.get(d.medId)?.name ?? "—"} · {patientById.get(d.patientId)?.name ?? "—"}</span><StatusBadge s={d.status} /></li>))}</ul>}
      </div>
    </div>
  );
}

function Support({ me }: { me: User }) {
  const tickets = useStore((s) => s.tickets);
  const users = useStore((s) => s.users);
  const mine = me.role === "cuidador" ? tickets.filter((ticket) => ticket.userId === me.id) : tickets;
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [faqSearch, setFaqSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "aberto" | "respondido" | "fechado">("todos");
  const faq: [string, string][] = [
    ["Como cadastrar um medicamento?", "Acesse Medicamentos, escolha Adicionar medicamento e preencha nome, dosagem, horários e quantidade disponível."],
    ["O alarme não apareceu. O que fazer?", "Confira as permissões de notificação do navegador ou celular, mantenha o aplicativo instalado e abra a área de Perfil para verificar a configuração do dispositivo."],
    ["Como acompanhar outro paciente?", "Na área Pacientes, selecione o cadastro desejado. Os medicamentos e o histórico exibidos passam a considerar esse paciente."],
    ["Posso tirar dúvidas sobre um medicamento?", "A equipe de atendimento pode orientar sobre o uso do aplicativo. Para decisões clínicas, interações ou mudanças de tratamento, consulte um farmacêutico ou profissional de saúde."],
    ["Como acompanho uma resposta?", "Abra o chamado na lista abaixo. Quando a equipe responder, a conversa e a situação serão atualizadas no mesmo lugar."],
  ];
  const filteredFaq = faq.filter(([question, answer]) => (question + " " + answer).toLocaleLowerCase("pt-BR").includes(faqSearch.toLocaleLowerCase("pt-BR")));
  const visibleTickets = mine.filter((ticket) => statusFilter === "todos" || ticket.status === statusFilter);
  const openCount = mine.filter((ticket) => ticket.status === "aberto").length;
  const answeredCount = mine.filter((ticket) => ticket.status === "respondido").length;
  const closedCount = mine.filter((ticket) => ticket.status === "fechado").length;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className={cls(card, "relative overflow-hidden p-4 sm:p-5")}>
        <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Headphones className="h-5 w-5" /></div>
            <div className="min-w-0">
              <T k="sup-title" as="h1" className="font-display text-xl font-bold text-foreground sm:text-2xl">Central de Atendimento</T>
              <T k="sup-sub" as="p" className="mt-0.5 text-xs text-muted-foreground sm:text-sm">Ajuda com o aplicativo e acompanhamento das suas solicitações.</T>
            </div>
          </div>
          {me.role === "cuidador" && <button type="button" onClick={() => { document.getElementById("support-form")?.scrollIntoView({ behavior: "smooth", block: "center" }); document.querySelector<HTMLInputElement>("#support-form input")?.focus(); }} className={cls(btnPrimary, "min-h-9 px-3 text-xs")}><Plus className="h-4 w-4" /> Novo chamado</button>}
        </div>
        <div className="relative mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2"><p className="text-[10px] font-medium text-muted-foreground">Abertos</p><p className="text-lg font-bold tabular-nums text-foreground">{openCount}</p></div>
          <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2"><p className="text-[10px] font-medium text-muted-foreground">Respondidos</p><p className="text-lg font-bold tabular-nums text-foreground">{answeredCount}</p></div>
          <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2"><p className="text-[10px] font-medium text-muted-foreground">Encerrados</p><p className="text-lg font-bold tabular-nums text-foreground">{closedCount}</p></div>
        </div>
      </header>

      {me.role === "cuidador" && (
        <form id="support-form" className={cls(card, "space-y-3 p-3 sm:p-4")} onSubmit={(event) => {
          event.preventDefault();
          if (!subject.trim() || !text.trim()) return;
          setState((state) => ({ ...state, tickets: [{ id: uid(), userId: me.id, subject: subject.trim(), status: "aberto", messages: [{ from: me.login, text: text.trim(), at: new Date().toISOString() }] }, ...state.tickets] }));
          setSubject(""); setText("");
        }}>
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary"><LifeBuoy className="h-4 w-4" /></div>
            <div><h2 className="text-sm font-bold text-foreground">Como podemos ajudar?</h2><p className="text-[11px] text-muted-foreground">Envie sua dúvida. Nossa equipe responderá por aqui.</p></div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <label className="space-y-1 text-xs font-semibold text-foreground">Assunto
              <input required maxLength={100} className={cls(input, "w-full")} placeholder="Ex.: notificações, cadastro..." value={subject} onChange={(event) => setSubject(event.target.value)} />
            </label>
            <label className="space-y-1 text-xs font-semibold text-foreground">Mensagem
              <textarea required maxLength={2000} rows={2} className={cls(input, "w-full resize-y")} placeholder="Conte brevemente o que aconteceu ou qual é sua dúvida..." value={text} onChange={(event) => setText(event.target.value)} />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground">Não envie senhas ou dados bancários neste campo.</p>
            <button className={cls(btnPrimary, "min-h-9 px-4 text-xs")}><ArrowRight className="h-4 w-4" />Enviar solicitação</button>
          </div>
        </form>
      )}

      <section className={cls(card, "space-y-3 p-3 sm:p-4")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-sm font-bold text-foreground">Perguntas frequentes</h2><p className="text-[11px] text-muted-foreground">Respostas rápidas para as dúvidas mais comuns.</p></div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">{filteredFaq.length} tópicos</span>
        </div>
        <input aria-label="Buscar nas perguntas frequentes" className={cls(input, "min-h-9 w-full text-xs")} placeholder="Buscar uma dúvida..." value={faqSearch} onChange={(event) => setFaqSearch(event.target.value)} />
        <div className="divide-y divide-border">
          {filteredFaq.map(([question, answer]) => <details key={question} className="group py-2 first:pt-0 last:pb-0">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-foreground [&::-webkit-details-marker]:hidden">{question}<span className="text-base font-normal text-primary transition group-open:rotate-45">+</span></summary>
            <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">{answer}</p>
          </details>)}
          {filteredFaq.length === 0 && <p className="py-3 text-xs text-muted-foreground">Nenhuma pergunta encontrada. Tente outro termo ou abra um chamado.</p>}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><h2 className="text-sm font-bold text-foreground">{me.role === "cuidador" ? "Minhas solicitações" : "Fila de atendimento"}</h2><p className="text-[11px] text-muted-foreground">Consulte o andamento e continue uma conversa.</p></div>
          <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
            {(["todos", "aberto", "respondido", "fechado"] as const).map((status) => <button key={status} type="button" onClick={() => setStatusFilter(status)} className={cls("rounded-lg px-2.5 py-1.5 text-[10px] font-semibold capitalize transition", statusFilter === status ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{status === "todos" ? "Todos" : status === "fechado" ? "Encerrados" : status}</button>)}
          </div>
        </div>
        {visibleTickets.length === 0 && me.role === "cuidador" && mine.length === 0 && (
          <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Nenhuma solicitação ainda" description="Quando precisar de ajuda, envie uma mensagem. Você poderá acompanhar toda a conversa nesta página." actionLabel="Abrir primeiro chamado" onAction={() => { document.getElementById("support-form")?.scrollIntoView({ behavior: "smooth", block: "center" }); document.querySelector<HTMLInputElement>("#support-form input")?.focus(); }} />
        )}
        {visibleTickets.length === 0 && (mine.length > 0 || me.role !== "cuidador") && <p className={cls(card, "p-4 text-center text-xs text-muted-foreground")}>Nenhuma solicitação nesta situação.</p>}
        {visibleTickets.map((ticket) => (
          <article key={ticket.id} className={cls(card, "space-y-2 p-3 sm:p-4")}>
            <div className="flex items-center gap-2">
              <Button variant="ghost" className="h-auto min-w-0 flex-1 justify-between gap-2 whitespace-normal px-0 text-left hover:bg-transparent" onClick={() => setOpen(open === ticket.id ? null : ticket.id)}>
                <span className="min-w-0"><span className="block truncate text-xs font-bold text-foreground">{ticket.subject}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{me.role !== "cuidador" ? users.find((user) => user.id === ticket.userId)?.login : "Solicitação com " + ticket.messages.length + " mensagem(ns)"}</span></span>
                <span className={cls("shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold capitalize", ticket.status === "aberto" ? "bg-warning/20 text-foreground" : ticket.status === "respondido" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>{ticket.status === "fechado" ? "encerrado" : ticket.status}</span>
              </Button>
              <TicketManagement ticket={ticket} me={me} />
            </div>
            {open === ticket.id && <div className="space-y-2 border-t border-border pt-3">
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {ticket.messages.map((message, index) => <div key={index} className="max-w-[95%] rounded-xl bg-muted px-3 py-2 text-xs">
                  <p className="mb-1 text-[10px] font-bold text-muted-foreground">{message.from} · {fmtDate(message.at)}</p><p className="whitespace-pre-wrap leading-relaxed text-foreground">{message.text}</p>
                </div>)}
              </div>
              {ticket.status !== "fechado" && <form className="flex items-end gap-2" onSubmit={(event) => {
                event.preventDefault(); if (!reply.trim()) return;
                setState((state) => ({ ...state, tickets: state.tickets.map((item) => item.id === ticket.id ? { ...item, status: me.role === "cuidador" ? "aberto" : "respondido", messages: [...item.messages, { from: me.login + " (" + me.role + ")", text: reply.trim(), at: new Date().toISOString() }] } : item) }));
                setReply("");
              }}>
                <textarea aria-label="Responder solicitação" rows={1} className={cls(input, "min-h-9 flex-1 resize-y text-xs")} placeholder="Escreva uma resposta..." value={reply} onChange={(event) => setReply(event.target.value)} />
                <button className={cls(btnPrimary, "min-h-9 shrink-0 px-3 text-xs")}>Enviar</button>
              </form>}
              {me.role !== "cuidador" && ticket.status !== "fechado" && <button type="button" className="text-[10px] font-semibold text-muted-foreground underline underline-offset-2" onClick={() => setState((state) => ({ ...state, tickets: state.tickets.map((item) => item.id === ticket.id ? { ...item, status: "fechado" } : item) }))}>Encerrar solicitação</button>}
            </div>}
          </article>
        ))}
      </section>
    </div>
  );
}
function Profile({ me }: { me: User }) {
  const [cur, setCur] = useState("");
  const [p1, setP1] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [pushRegistered, setPushRegistered] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [vibrationMessage, setVibrationMessage] = useState("");
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [diagnostics, setDiagnostics] = useState<{ label: string; detail: string; ok: boolean; icon: typeof Wifi }[]>([]);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const installFlow = useInstallPrompt();
  const registerDevice = useServerFn(registerPushDevice);
  const testPush = useServerFn(sendTestPush);

  useEffect(() => {
    const syncDeviceState = () => {
      setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
      try {
        const ready = localStorage.getItem("dc-push-ready-" + me.id) === "1";
        setPushRegistered(ready && Boolean(sessionStorage.getItem("dc-push-token")));
      } catch { setPushRegistered(false); }
    };
    const syncInstalledState = () => {
      const standalone = window.matchMedia?.("(display-mode: standalone)").matches === true
        || window.matchMedia?.("(display-mode: fullscreen)").matches === true
        || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      setIsStandalone(standalone);
    };
    syncDeviceState();
    syncInstalledState();
    window.addEventListener("dc-push-ready", syncDeviceState);
    window.addEventListener("focus", syncDeviceState);
    window.addEventListener("appinstalled", syncInstalledState);
    return () => {
      window.removeEventListener("dc-push-ready", syncDeviceState);
      window.removeEventListener("focus", syncDeviceState);
      window.removeEventListener("appinstalled", syncInstalledState);
    };
  }, [me.id]);

  const refreshDiagnostics = async () => {
    if (typeof window === "undefined") return;
    setDiagnosticsBusy(true);
    const online = navigator.onLine;
    const secure = window.isSecureContext;
    const permission = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
    let serviceWorker = false;
    try {
      serviceWorker = "serviceWorker" in navigator && (await navigator.serviceWorker.getRegistrations()).length > 0;
    } catch { serviceWorker = false; }
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches === true
      || window.matchMedia?.("(display-mode: fullscreen)").matches === true
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setDiagnostics([
      { label: "Conexão com a internet", detail: online ? "Aparelho conectado" : "Sem conexão no momento", ok: online, icon: Wifi },
      { label: "Permissão de notificações", detail: permission === "granted" ? "Permissão concedida" : permission === "denied" ? "Permissão bloqueada pelo navegador" : permission === "unsupported" ? "Não suportado neste navegador" : "Ainda não foi solicitada", ok: permission === "granted", icon: BellRing },
      { label: "Serviço de notificações", detail: serviceWorker ? "Serviço instalado neste navegador" : "Nenhum serviço registrado foi encontrado", ok: serviceWorker, icon: Activity },
      { label: "Contexto seguro", detail: secure ? "Navegador permite recursos seguros" : "Abra o aplicativo por HTTPS", ok: secure, icon: ShieldCheck },
      { label: "Aplicativo instalado", detail: standalone ? "Aberto como aplicativo" : "Aberto em uma aba do navegador", ok: standalone, icon: Smartphone },
    ]);
    setDiagnosticsBusy(false);
  };

  useEffect(() => {
    void refreshDiagnostics();
    window.addEventListener("online", refreshDiagnostics);
    window.addEventListener("offline", refreshDiagnostics);
    return () => {
      window.removeEventListener("online", refreshDiagnostics);
      window.removeEventListener("offline", refreshDiagnostics);
    };
  }, []);

  const activateNotifications = async () => {
    setPushBusy(true);
    setNotificationMessage("");
    try {
      const result = await enablePush();
      setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
      if (result.status !== "registered") {
        const messages: Record<"not-configured" | "unsupported" | "open-in-new-tab" | "denied", string> = {
          "not-configured": "O serviço de notificações ainda não está configurado neste ambiente.",
          unsupported: "Este navegador não oferece suporte às notificações em segundo plano.",
          "open-in-new-tab": "Abra o Dose Certa em uma aba própria do navegador para ativar os avisos.",
          denied: "A permissão foi recusada ou está bloqueada. Libere as notificações nas configurações do navegador ou do aparelho.",
        };
        setNotificationMessage(messages[result.status]);
        return;
      }
      await registerDevice({
        data: {
          token: result.token,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      try {
        sessionStorage.setItem("dc-push-token", result.token);
        localStorage.setItem("dc-push-ready-" + me.id, "1");
      } catch { /* O vínculo remoto segue ativo mesmo sem armazenamento local. */ }
      setPushRegistered(true);
      setPermission("granted");
      setNotificationMessage("Notificações ativadas e este aparelho vinculado à sua conta.");
      window.dispatchEvent(new Event("dc-push-ready"));
    } catch (error) {
      setNotificationMessage(error instanceof Error ? error.message : "Não foi possível ativar as notificações agora.");
    } finally {
      setPushBusy(false);
    }
  };

  const sendBackgroundTest = async () => {
    setTestBusy(true);
    setNotificationMessage("");
    try {
      const token = sessionStorage.getItem("dc-push-token");
      if (!token) {
        setPushRegistered(false);
        setNotificationMessage("Este aparelho precisa ser vinculado novamente. Toque em Ativar notificações antes de testar.");
        return;
      }
      const result = await testPush({ data: { token } });
      if (result.sent > 0) {
        setNotificationMessage("Notificação enviada. Bloqueie a tela ou deixe o Dose Certa em segundo plano para conferir a chegada.");
      } else if (result.devices === 0) {
        setNotificationMessage("Nenhum aparelho está vinculado. Ative as notificações antes de testar.");
      } else {
        setNotificationMessage("O serviço não confirmou o envio. Confira a conexão e tente novamente.");
      }
    } catch (error) {
      setNotificationMessage(error instanceof Error ? error.message : "Não foi possível enviar o teste.");
    } finally {
      setTestBusy(false);
    }
  };

  const testVibration = () => {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
      setVibrationMessage("Este navegador não oferece vibração acionável pela página. A vibração de notificações em segundo plano depende do sistema.");
      return;
    }
    const pattern = Array.from({ length: 20 }, () => [400, 100]).flat();
    const accepted = navigator.vibrate(pattern);
    setVibrationMessage(accepted
      ? "Teste solicitado: 20 ciclos de 400 ms vibrando e 100 ms de pausa."
      : "O aparelho ou navegador não aceitou o teste de vibração.");
  };

  const startInstallation = async () => {
    if (installFlow.step === "native") {
      const result = await installFlow.install();
      if (result === "unavailable") setShowInstallHelp(true);
      return;
    }
    if (installFlow.step === "own-tab") installFlow.openOwnTab();
    setShowInstallHelp(true);
  };

  const isIos = typeof navigator !== "undefined" && (/iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1));
  const isAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  const notificationIsActive = permission === "granted" && pushRegistered;
  const roleLabel = me.role === "cuidador" ? "Cuidador(a)" : me.role === "mestre" ? "Mestre" : "Operador";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-primary">Preferências e aparelho</p>
          <T k="prof-title" as="h1" className="mt-1 font-display text-3xl text-foreground">Meu perfil</T>
          <p className="mt-1 text-sm text-muted-foreground">Organize sua conta, aparência e configurações do Dose Certa.</p>
        </div>
        <span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground">{roleLabel}</span>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(260px,.82fr)_minmax(0,1.18fr)]">
        <div className="space-y-4">
          <section className={cls(card, "space-y-3 !p-4 sm:!p-5")}>
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><UserRound className="h-6 w-6" /></span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Conta conectada</p>
                <h2 className="truncate font-display text-xl font-semibold text-foreground">{me.login}</h2>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
              <div className="rounded-xl bg-background/70 p-3">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Login</p>
                <p className="mt-1 break-all text-sm font-bold text-foreground">{me.login}</p>
              </div>
              <div className="rounded-xl bg-background/70 p-3">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Acesso</p>
                <p className="mt-1 text-sm font-bold text-foreground">{roleLabel}</p>
              </div>
            </div>
          </section>

          <form className={cls(card, "space-y-3 !p-4 sm:!p-5")} onSubmit={async (event) => {
            event.preventDefault();
            try {
              await updateOwnPassword(cur, p1);
              setCur("");
              setP1("");
              setMsg({ ok: true, t: "Senha alterada com sucesso." });
            } catch (error) {
              setMsg({ ok: false, t: error instanceof Error ? error.message : "Não foi possível alterar." });
            }
          }}>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-semibold text-foreground">Segurança da conta</h2>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">Altere sua senha para manter o acesso protegido.</p>
            <label className="block space-y-1 text-xs font-bold text-foreground">
              Senha atual
              <input className={input} type="password" autoComplete="current-password" placeholder="Digite a senha atual" value={cur} onChange={(event) => setCur(event.target.value)} />
            </label>
            <label className="block space-y-1 text-xs font-bold text-foreground">
              Nova senha
              <input className={input} type="password" autoComplete="new-password" placeholder="Digite a nova senha" value={p1} onChange={(event) => setP1(event.target.value)} />
            </label>
            {msg && <p role="status" className={cls("rounded-xl px-3 py-2 text-xs font-semibold", msg.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>{msg.t}</p>}
            <button className={btnPrimary + " w-full"}>Salvar nova senha</button>
          </form>
        </div>

        <div className="space-y-4">
          <section className={cls(card, "space-y-3 !p-4 sm:!p-5")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><Activity className="h-4 w-4" /></span><div><h2 className="font-display text-lg font-semibold text-foreground">Diagnóstico rápido</h2><p className="text-[10px] text-muted-foreground">Verificação deste aparelho e navegador</p></div></div>
              <button type="button" title="Atualizar diagnóstico" aria-label="Executar diagnóstico novamente" onClick={() => void refreshDiagnostics()} disabled={diagnosticsBusy} className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted disabled:opacity-50"><Activity className={"h-4 w-4 " + (diagnosticsBusy ? "animate-pulse" : "")} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {diagnostics.map((item) => <div key={item.label} className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-background/60 p-3"><span className={cls("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg", item.ok ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-700 dark:text-amber-300")}><item.icon className="h-3.5 w-3.5" /></span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-foreground">{item.label}</p><p className="text-[10px] leading-relaxed text-muted-foreground">{item.detail}</p></div><span className={cls("mt-1 h-2 w-2 shrink-0 rounded-full", item.ok ? "bg-primary" : "bg-amber-500")} /></div>)}
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">O diagnóstico é informativo. Permissões de bateria, som e execução em segundo plano podem depender do fabricante do aparelho.</p>
          </section>

          <section className={cls(card, "space-y-4 !p-4 sm:!p-5")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><BellRing className="h-5 w-5" /></span>
                <div>
                  <h2 className="font-display text-xl font-semibold text-foreground">Alertas deste aparelho</h2>
                  <p className="mt-0.5 max-w-lg text-xs leading-relaxed text-muted-foreground">Ative notificações, teste a vibração e confira se o aviso chega com o aplicativo em segundo plano.</p>
                </div>
              </div>
              <span className={cls("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold", notificationIsActive ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : permission === "denied" ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground")}>
                <span className={cls("h-2 w-2 rounded-full", notificationIsActive ? "bg-emerald-500" : permission === "denied" ? "bg-destructive" : "bg-muted-foreground")} />
                {notificationIsActive ? "Notificações ativas" : permission === "denied" ? "Permissão bloqueada" : permission === "unsupported" ? "Não compatível" : "Não ativadas"}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-background/65 p-3.5">
                <div className="flex items-center gap-2 text-foreground">
                  <Bell className="h-4 w-4 text-primary" />
                  <p className="text-sm font-extrabold">Permissão de notificação</p>
                </div>
                <p className="mt-1.5 min-h-9 text-xs leading-relaxed text-muted-foreground">Vincule este aparelho à sua conta para receber lembretes.</p>
                <button type="button" onClick={() => void activateNotifications()} disabled={pushBusy} className={cls(btnPrimary, "mt-3 w-full px-3 text-xs")}>
                  <BellRing className="h-4 w-4" />{pushBusy ? "Ativando..." : notificationIsActive ? "Atualizar aparelho" : "Ativar notificações"}
                </button>
              </div>

              <div className="rounded-2xl border border-border bg-background/65 p-3.5">
                <div className="flex items-center gap-2 text-foreground">
                  <Vibrate className="h-4 w-4 text-primary" />
                  <p className="text-sm font-extrabold">Teste de vibração</p>
                </div>
                <p className="mt-1.5 min-h-9 text-xs leading-relaxed text-muted-foreground">Solicita 20 pulsos de 400 ms, com 100 ms de pausa.</p>
                <button type="button" onClick={testVibration} className={cls(btnOutline, "mt-3 w-full px-3 text-xs")}>
                  <Vibrate className="h-4 w-4" />Testar vibração
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-primary/20 bg-primary/[0.045] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BellRing className="h-4 w-4 text-primary" />
                  <p className="text-sm font-extrabold text-foreground">Teste em segundo plano</p>
                </div>
                <span className="rounded-full bg-background/80 px-2.5 py-1 text-[10px] font-bold text-muted-foreground">Push real</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Envia um aviso para este aparelho após três segundos. Bloqueie a tela para conferir se o sistema reproduz o alerta.</p>
              <button type="button" onClick={() => void sendBackgroundTest()} disabled={testBusy || !pushRegistered} className={cls(btnOutline, "mt-3 w-full sm:w-auto")}>
                <Bell className="h-4 w-4" />{testBusy ? "Enviando teste..." : "Enviar notificação de teste"}
              </button>
              {!pushRegistered && <p className="mt-2 text-[11px] font-semibold text-muted-foreground">Ative as notificações neste aparelho antes de testar.</p>}
            </div>

            {notificationMessage && <p role="status" className="rounded-xl bg-muted px-3 py-2.5 text-xs leading-relaxed text-foreground">{notificationMessage}</p>}
            {vibrationMessage && <p role="status" className="rounded-xl bg-muted px-3 py-2.5 text-xs leading-relaxed text-foreground">{vibrationMessage}</p>}
            <p className="text-[11px] leading-relaxed text-muted-foreground">O sistema do aparelho, o modo silencioso e a economia de bateria podem limitar a vibração e o som.</p>
          </section>

          <section className={cls(card, "space-y-3 !p-4 sm:!p-5")}>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Download className="h-5 w-5" /></span>
              <div className="min-w-0">
                <h2 className="font-display text-xl font-semibold text-foreground">Instalação do aplicativo</h2>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Adicione o Dose Certa à tela inicial ou ao computador para abrir como aplicativo.</p>
              </div>
            </div>
            {isStandalone ? (
              <p className="rounded-xl bg-primary/10 px-3 py-2.5 text-sm font-semibold text-primary">O Dose Certa já está instalado neste aparelho.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {installFlow.step === "native" && <button type="button" onClick={() => void startInstallation()} className={btnPrimary}><Download className="h-4 w-4" />Instalar agora</button>}
                <button type="button" onClick={() => setShowInstallHelp((open) => !open)} className={btnOutline}><Download className="h-4 w-4" />{showInstallHelp ? "Ocultar instruções" : "Instalação manual"}</button>
                {installFlow.step === "own-tab" && <button type="button" onClick={() => installFlow.openOwnTab()} className={btnOutline}>Abrir em nova aba</button>}
              </div>
            )}
            {showInstallHelp && !isStandalone && (
              <div className="rounded-xl border border-primary/20 bg-primary/[0.06] p-3 text-xs leading-relaxed text-foreground">
                {isIos ? (
                  <ol className="list-decimal space-y-1.5 pl-5">
                    <li>Abra esta página no Safari.</li>
                    <li>Toque em <b>Compartilhar</b>.</li>
                    <li>Escolha <b>Adicionar à Tela de Início</b> e confirme em <b>Adicionar</b>.</li>
                  </ol>
                ) : isAndroid ? (
                  <ol className="list-decimal space-y-1.5 pl-5">
                    <li>Abra o menu do navegador (⋮).</li>
                    <li>Toque em <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>.</li>
                    <li>Confirme e abra pelo novo ícone.</li>
                  </ol>
                ) : (
                  <p>No Chrome ou Edge, use o ícone de instalação na barra de endereço ou o menu do navegador e escolha <b>Instalar Dose Certa</b>.</p>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}


function AlertsBell({ me }: { me: User }) {
  const alerts = useStore((s) => s.alerts.filter((a) => a.ownerId === me.id));
  const [open, setOpen] = useState(false); const unread = alerts.filter((a) => !a.read).length;
  return (
    <div className="relative">
      <button aria-label="Alertas" onClick={() => { setOpen(!open); setState((s) => ({ ...s, alerts: s.alerts.map((a) => (a.ownerId === me.id ? { ...a, read: true } : a)) })); }} className="relative grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-foreground hover:bg-muted">
        <Bell className="h-5 w-5" />{unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground">{unread}</span>}
      </button>
      {open && <div className={cls(card, "absolute right-0 z-30 mt-2 max-h-80 w-80 overflow-auto p-3")}>
        {alerts.length === 0 ? <p className="text-sm text-muted-foreground">Sem alertas.</p> : alerts.map((a) => <div key={a.id} className="border-b border-border py-2 text-sm"><p className="text-foreground">{a.text}</p><p className="text-xs text-muted-foreground">{fmtDate(a.at)}</p></div>)}
      </div>}
    </div>
  );
}
function UrgentAlertToast({ me }: { me: User }) {
  const urgent = useStore((s) => s.alerts.find((a) => a.ownerId === me.id && !a.read && a.text.startsWith("⚠")));
  if (!urgent) return null;
  return (
    <div className="fixed left-1/2 top-4 z-50 w-[92%] max-w-md -translate-x-1/2 rounded-2xl border-2 border-destructive bg-card p-4 shadow-xl">
      <div className="flex items-start gap-3"><BellRing className="h-6 w-6 shrink-0 text-destructive" /><p className="flex-1 text-sm font-semibold text-foreground">{urgent.text}</p>
        <button aria-label="Fechar" onClick={() => setState((s) => ({ ...s, alerts: s.alerts.map((a) => (a.id === urgent.id ? { ...a, read: true } : a)) }))}><X className="h-4 w-4 text-foreground" /></button></div>
    </div>
  );
}

/* ---------------- shell ---------------- */
function Shell({ me }: { me: User }) {
  const removeDevice = useServerFn(removePushDevice);
  const initialSyncStatus = getOfflineStatus();
  const [cloudConnected, setCloudConnected] = useState(initialSyncStatus.online);
  const [browserOnline, setBrowserOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [pendingSync, setPendingSync] = useState(initialSyncStatus.pending);
  const [syncError, setSyncError] = useState(initialSyncStatus.error ?? "");
  const [syncBusy, setSyncBusy] = useState(false);
  const [page, setPage] = useState<Page>(me.role === "mestre" ? "admin" : "inicio");
  const patientOptions = useStore((s) => s.patients.filter((p) => p.ownerId === me.id));
  const patientIdsKey = patientOptions.map((p) => p.id).join("|");
  useEffect(() => {
    const syncBrowserState = () => setBrowserOnline(navigator.onLine);
    const syncPendingState = (event?: Event) => {
      const detail = (event as CustomEvent<{ online?: boolean; pending?: number; error?: string | null }> | undefined)?.detail;
      if (typeof detail?.online === "boolean") setCloudConnected(detail.online);
      if (typeof detail?.pending === "number") setPendingSync(detail.pending);
      if (typeof detail?.error === "string") setSyncError(detail.error);
      else if (detail?.error === null) setSyncError("");
    };
    const initial = getOfflineStatus();
    setCloudConnected(initial.online);
    setPendingSync(initial.pending);
    setSyncError(initial.error ?? "");
    syncBrowserState();
    void readOfflinePackage(me.id).then((cached) => setPendingSync(cached?.pending.length ?? 0)).catch(() => undefined);
    window.addEventListener("online", syncBrowserState);
    window.addEventListener("offline", syncBrowserState);
    window.addEventListener("dc-offline-status", syncPendingState);
    return () => {
      window.removeEventListener("online", syncBrowserState);
      window.removeEventListener("offline", syncBrowserState);
      window.removeEventListener("dc-offline-status", syncPendingState);
    };
  }, [me.id]);
  const retryCloudSync = () => {
    setSyncBusy(true);
    void refreshCloud()
      .catch((error) => setSyncError(error instanceof Error ? error.message : "Não foi possível sincronizar agora."))
      .finally(() => setSyncBusy(false));
  };
  const [activePatientId, setActivePatientId] = useState("");
  useEffect(() => {
    const saved = localStorage.getItem(`dc-patient-${me.id}`);
    const next = saved && patientOptions.some((p) => p.id === saved)
      ? saved
      : patientOptions.length === 1 ? (patientOptions[0]?.id ?? "") : "";
    setActivePatientId(next);
    if (next) localStorage.setItem(`dc-patient-${me.id}`, next);
    else localStorage.removeItem(`dc-patient-${me.id}`);
  }, [me.id, patientIdsKey]);
  const selectPatient = (patientId: string) => {
    setActivePatientId(patientId);
    if (patientId) localStorage.setItem(`dc-patient-${me.id}`, patientId);
    else localStorage.removeItem(`dc-patient-${me.id}`);
  };
  const items: { id: Page; label: string; mobileLabel: string; icon: ReactNode; roles: Role[] }[] = [
    { id: "inicio", label: "Início", mobileLabel: "Início", icon: <Home className="h-[1.15rem] w-[1.15rem] stroke-[1.8]" />, roles: ["cuidador", "mestre"] },
    { id: "pacientes", label: "Pacientes", mobileLabel: "Pacientes", icon: <UsersRound className="h-[1.15rem] w-[1.15rem] stroke-[1.8]" />, roles: ["cuidador", "mestre"] },
    { id: "medicamentos", label: "Medicamentos", mobileLabel: "Medicamentos", icon: <PillBottle className="h-[1.15rem] w-[1.15rem] stroke-[1.8]" />, roles: ["cuidador", "mestre"] },
    { id: "historico", label: "Histórico", mobileLabel: "Histórico", icon: <CalendarDays className="h-[1.15rem] w-[1.15rem] stroke-[1.8]" />, roles: ["cuidador", "operador", "mestre"] },
    { id: "suporte", label: "Atendimento", mobileLabel: "Suporte", icon: <LifeBuoy className="h-[1.15rem] w-[1.15rem] stroke-[1.8]" />, roles: ["cuidador", "operador", "mestre"] },
    { id: "perfil", label: "Perfil", mobileLabel: "Perfil", icon: <UserRound className="h-[1.15rem] w-[1.15rem] stroke-[1.8]" />, roles: ["cuidador", "operador", "mestre"] },
    { id: "admin", label: "Painel do Mestre", mobileLabel: "Painel", icon: <ShieldCheck className="h-[1.15rem] w-[1.15rem] stroke-[1.8]" />, roles: ["mestre"] },
  ].filter((i) => i.roles.includes(me.role)) as typeof items;
  useEffect(() => { if (!items.some((item) => item.id === page) && page !== "rotina") setPage(me.role === "mestre" ? "admin" : "inicio"); }, [me.role, page]);
  const registerDevice = useServerFn(registerPushDevice);
  // Re-link this phone to the signed-in caregiver on every open, so tokens stay fresh and follow the account in use.
  useEffect(() => {
    if (me.role !== "cuidador" || typeof Notification === "undefined" || Notification.permission !== "granted" || window.top !== window.self) return;
    enablePush().then(async (result) => {
      if (result.status !== "registered") return;
      await registerDevice({ data: { token: result.token, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
      sessionStorage.setItem("dc-push-token", result.token);
      localStorage.setItem("dc-push-ready-" + me.id, "1");
      window.dispatchEvent(new Event("dc-push-ready"));
    }).catch(() => undefined);
  }, [me.id, me.role]);
  const logout = async () => {
    const token = sessionStorage.getItem("dc-push-token");
    if (token) {
      try { await removeDevice({ data: { token } }); sessionStorage.removeItem("dc-push-token"); }
      catch { window.alert("Não foi possível desativar os avisos deste aparelho. Confira sua conexão e tente sair novamente."); return; }
    }
    await cloudLogout();
  };
  return (
    <div className="dc-app flex min-h-screen w-full bg-background">
      <aside className="dc-sidebar no-print sticky top-0 hidden h-screen w-72 shrink-0 flex-col overflow-hidden bg-sidebar p-6 text-sidebar-foreground md:flex">
        <div className="mb-8 flex items-center gap-3"><Logo /><T k="brand" className="font-display text-2xl font-semibold tracking-tight">Dose Certa</T></div>
        <nav aria-label="Navegação principal" className="dc-nav relative z-10 flex flex-1 flex-col justify-center gap-1.5 py-8">
          {items.map((i) => <button key={i.id} aria-current={page === i.id ? "page" : undefined} onClick={() => setPage(i.id)} className={cls("flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition", page === i.id ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}>{i.icon}{i.label}</button>)}
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-sidebar-accent"><LogOut className="h-[1.15rem] w-[1.15rem] stroke-[1.8]" />Sair</button>
        </nav>
        <GeometricDissolve variant="sparse" className="-bottom-16 -left-16 h-96 w-96 dc-geometry-ink opacity-70" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="dc-header no-print sticky top-0 z-20 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 bg-background/85 px-4 py-3 backdrop-blur-xl md:px-8">
          <div className="flex min-w-0 items-center gap-2 md:hidden"><Logo size={32} /><span className="truncate font-display text-xl text-foreground">Dose Certa</span></div>
          <div className="hidden min-w-0 md:block"><p className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{me.role === "mestre" ? "Área de administração" : "Seu espaço de cuidado"}</p><p className="truncate font-display text-lg font-semibold text-foreground">{items.find((item) => item.id === page)?.label ?? "Dose Certa"}</p></div>
          <div className="flex items-center gap-2"><QuickGuideAccess onNavigate={setPage} hasPatient={Boolean(activePatientId)} /><AppearanceQuickAccess />{me.role === "cuidador" && <AlertsBell me={me} />}
            <button aria-label="Sair" onClick={logout} className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-foreground md:hidden"><LogOut className="h-5 w-5" /></button></div>
        </header>
        {(!browserOnline || !cloudConnected || pendingSync > 0 || !!syncError) && (
          <div role="status" aria-live="polite" className="no-print border-b border-border/70 bg-muted/70 px-4 py-2.5 md:px-8">
            <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-2.5">
              {browserOnline && cloudConnected && !syncError
                ? <CloudUpload className="h-4 w-4 shrink-0 text-primary" />
                : <CloudOff className="h-4 w-4 shrink-0 text-amber-600" />}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold leading-relaxed text-foreground">
                  {!browserOnline
                    ? "Sem internet. As alterações ficam guardadas neste aparelho e serão enviadas quando a conexão voltar."
                    : syncError
                      ? "Falha na sincronização: " + syncError
                      : !cloudConnected
                        ? "O aparelho está conectado à internet, mas não confirmou a conexão com a nuvem. Os dados locais continuam disponíveis."
                        : pendingSync > 0
                          ? pendingSync + (pendingSync === 1 ? " alteração aguardando sincronização." : " alterações aguardando sincronização.")
                          : "Conexão restabelecida."}
                </p>
              </div>
              {browserOnline && (!cloudConnected || pendingSync > 0 || !!syncError) && (
                <button type="button" onClick={retryCloudSync} disabled={syncBusy} className="shrink-0 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50">
                  {syncBusy ? "Conectando…" : "Tentar sincronizar"}
                </button>
              )}
            </div>
          </div>
        )}
        {me.role === "cuidador" && patientOptions.length > 0 && (
          <div className="no-print border-b border-border/60 bg-card/65 px-4 py-2.5 md:px-8">
            <div className="mx-auto flex w-full max-w-[1600px] items-center gap-2.5">
              <UserRound className="h-4 w-4 shrink-0 text-primary" />
              <label htmlFor="active-patient" className="shrink-0 text-xs font-semibold text-muted-foreground sm:text-sm">Paciente</label>
              <select
                id="active-patient"
                aria-label="Selecionar paciente para visualizar"
                className="min-h-10 min-w-0 flex-1 max-w-sm rounded-xl border border-input bg-background px-3 py-2 text-sm font-semibold text-foreground"
                value={activePatientId}
                onChange={(event) => selectPatient(event.target.value)}
              >
                <option value="">Todos os pacientes</option>
                {patientOptions.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
              </select>
              <span className="hidden text-xs text-muted-foreground sm:inline">{activePatientId ? "Visualização individual" : "Visão geral"}</span>
            </div>
          </div>
        )}
        <main className="dc-main flex-1 px-4 pb-40 pt-6 md:px-8 md:pb-10">
          <DeviceSetupAssistant role={me.role} accountId={me.id} />
          {page === "inicio" && <Dashboard me={me} go={setPage} activePatientId={activePatientId} />}
          {page === "pacientes" && <Patients me={me} activePatientId={activePatientId} onSelectPatient={selectPatient} onOpenRoutine={(patientId) => { selectPatient(patientId); setPage("rotina"); }} />}
          {page === "medicamentos" && <Meds me={me} activePatientId={activePatientId} go={setPage} />}
          {page === "historico" && <HistoryPage me={me} activePatientId={activePatientId} go={setPage} />}
          {page === "suporte" && <SupportPage me={me} />}
          {page === "rotina" && <RoutineCare me={me} patientId={activePatientId} onBack={() => setPage("pacientes")} onOpenMedicines={() => setPage("medicamentos")} onSelectPatient={selectPatient} />}
          {page === "perfil" && <Profile me={me} />}
          {page === "admin" && me.role === "mestre" && <AccountAdmin me={me} onNavigate={setPage} />}
        </main>
        <nav aria-label="Navegação móvel" className="dc-mobile-nav no-print fixed inset-x-0 bottom-0 z-30 flex flex-col gap-1.5 border-t border-border/70 bg-card/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_28px_-24px_rgba(0,0,0,0.35)] backdrop-blur-xl md:hidden">
          <div className="grid w-full grid-cols-6 items-stretch gap-1">
            {items.filter((item) => item.id !== "admin").slice(0, 6).map((i) => (
              <button key={i.id} aria-current={page === i.id ? "page" : undefined} onClick={() => setPage(i.id)} title={i.label}
                className={cls("flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-2 text-center text-[10px] font-semibold leading-tight transition-colors", page === i.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
                <span className="grid h-5 w-full place-items-center">{i.icon}</span>
                <span className="w-full truncate text-center">{i.mobileLabel}</span>
              </button>
            ))}
          </div>
          {me.role === "mestre" && items.some((item) => item.id === "admin") && (
            <div className="grid w-full grid-cols-6 items-stretch gap-1 border-t border-border/60 pt-1.5">
              {items.filter((item) => item.id === "admin").map((i) => (
                <button key={i.id} aria-current={page === i.id ? "page" : undefined} onClick={() => setPage(i.id)} title={i.label}
                  className={cls("col-start-3 col-span-2 flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-center text-[10px] font-semibold leading-tight transition-colors", page === i.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
                  <span className="grid h-5 w-full place-items-center">{i.icon}</span>
                  <span className="w-full truncate text-center">{i.mobileLabel}</span>
                </button>
              ))}
            </div>
          )}

        </nav>
      </div>
      <AlarmEngine me={me} />
      {me.role === "cuidador" && <UrgentAlertToast me={me} />}
    </div>
  );
}

export function DoseCertaApp() {
  const me = useMe();
  const [ready, setReady] = useState(false);
  const [cloudError, setCloudError] = useState("");
  useEffect(() => {
    // Restore the device's appearance before the app shell renders. The palette
    // and color mode use separate preferences, so switching modes never resets
    // the selected palette.
    const savedPalette = localStorage.getItem("dc-palette");
    if (savedPalette === "azul" || savedPalette === "rosa" || savedPalette === "lavanda" || savedPalette === "ruby" || savedPalette === "dourado" || savedPalette === "onix" || savedPalette === "cobre") {
      document.documentElement.dataset["palette"] = savedPalette;
    } else {
      delete document.documentElement.dataset["palette"];
    }
    document.documentElement.classList.toggle("dark", localStorage.getItem("dc-theme") === "dark");

    // Prepare offline app shell even when the user has not enabled notifications.
    void registerAppServiceWorker().catch(() => undefined);
    void requestPersistentOfflineStorage();

    let disposed = false; let cleanup: (() => void) | undefined;
    onCloudError(setCloudError);
    initializeCloud().then((stop) => { if (disposed) stop(); else { cleanup = stop; setReady(true); } }).catch((error) => { setCloudError(error instanceof Error ? error.message : "Não foi possível carregar."); setReady(true); });
    return () => { disposed = true; cleanup?.(); };
  }, []);
  if (!ready) return <div className="min-h-screen bg-background" />;
  return (
    <>
      {cloudError && <div role="alert" className="fixed inset-x-4 top-4 z-50 rounded-lg border border-destructive bg-card p-3 text-sm text-destructive">{cloudError}<Button variant="ghost" size="sm" onClick={() => setCloudError("")}>Fechar</Button></div>}
      {!me ? <AuthScreen /> : me.mustChange ? <ForceChangePassword me={me} /> : <Shell me={me} />}
    </>
  );
}
