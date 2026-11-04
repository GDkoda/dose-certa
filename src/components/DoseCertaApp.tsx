import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AlarmClock, ArrowRight, Bell, BellRing, CalendarDays, CheckCircle2, ClipboardList, Clock3, Download, Headphones, History, Home, LifeBuoy, LogOut, Moon, Pencil, PillBottle,
  Pill, Plus, Palette as PaletteIcon, Printer, Shield, ShieldCheck, Sun, Trash2, UserRound, Users, UsersRound, Vibrate, X,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { AccountAdmin } from "./AccountAdmin";
import { TicketManagement } from "./TicketManagement";
import { registerPushDevice, sendTestPush } from "@/lib/push.functions";
import { enablePush } from "@/lib/push-browser";
import { removePushDevice } from "@/lib/push.functions";
import { DeviceSetupAssistant } from "./DeviceSetupAssistant";
import { useInstallPrompt } from "@/lib/install-prompt";
import { registerAccount, finishPasswordChange } from "@/lib/accounts.functions";
import { cloudLogin, cloudLogout, initializeCloud, onCloudError, refreshCloud, updateOwnPassword } from "@/lib/cloud-store";
import { buildMissingDoses, findDueDose } from "@/lib/alarm-rules";
import { estimateStockDays, stockLevel } from "@/lib/stock-rules";
import { summarizeDoseStatuses } from "@/lib/report-rules";
import {
  canAddPatient, getState, MAX_PATIENTS, RESET_PASSWORD, setState, SNOOZE_MIN, uid, useStore,
  type Dose, type DosePeriod, type DoseSchedule, type Role, type User,
} from "@/lib/store";

/* ---------------- helpers ---------------- */
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
      <svg viewBox="0 0 32 32" width="78%" height="78%" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Dose Certa: cápsula protegida">
        <path d="M16 2.7 26.2 6.6v7.1c0 7.2-4.4 12.3-10.2 15.5C10.2 26 5.8 20.9 5.8 13.7V6.6L16 2.7Z" />
        <path d="M16 5.1 24 8.2v5.4c0 6-3.6 10.3-8 12.8-4.4-2.5-8-6.8-8-12.8V8.2l8-3.1Z" opacity="0.35" />
        <g transform="rotate(-45 16 16)">
          <rect x="11.7" y="9.2" width="8.6" height="13.6" rx="4.3" />
          <path d="M11.9 16h8.2" />
        </g>
        <path d="m22.1 7.8 2 2" opacity="0.7" />
      </svg>
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

function PalettePicker() {
  const { palette, setPalette } = usePalette();
  return (
    <div className={cls(card, "max-w-md !p-4 space-y-3 sm:!p-5")}>
      <h2 className="font-display text-lg text-foreground">Cor do aplicativo</h2>
      <p className="text-sm text-muted-foreground">Escolha a paleta deste aparelho. Ela combina com o modo claro e o noturno.</p>
      <div className="grid w-full grid-cols-4 gap-2 sm:gap-3" role="radiogroup" aria-label="Cor do aplicativo">
        {PALETTES.map((p) => (
          <button key={p.id} role="radio" aria-checked={palette === p.id} onClick={() => setPalette(p.id)} className={cls("flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border p-2 transition sm:p-3", palette === p.id ? "border-primary bg-accent" : "border-border bg-card hover:bg-muted")}>
            <span className="flex max-w-full shrink-0 overflow-hidden rounded-full border border-border">
              <span className="h-5 w-5 sm:h-6 sm:w-6" style={{ background: p.light }} />
              <span className="h-5 w-5 sm:h-6 sm:w-6" style={{ background: p.dark }} />
            </span>
            <span className="whitespace-nowrap text-[11px] leading-tight text-foreground sm:text-xs">{p.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
function ThemeToggle() {
  const { dark, toggle } = useTheme();
  return (
    <button onClick={toggle} aria-label="Alternar modo noturno" className="no-print grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-foreground hover:bg-muted">
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

function PaletteQuickAccess() {
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
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/35 p-3 backdrop-blur-sm sm:p-5"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Escolher tema de cores"
            className={cls(card, "w-[min(25rem,calc(100vw-1.5rem))] max-h-[min(82dvh,42rem)] overflow-y-auto !p-4 shadow-2xl sm:!p-5")}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-display text-lg font-semibold text-foreground">Tema de cores</p>
                <p className="mt-0.5 text-xs text-muted-foreground">A aparência muda neste aparelho.</p>
              </div>
              <button type="button" aria-label="Fechar temas" onClick={() => setOpen(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {PALETTES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={palette === p.id}
                  onClick={() => { setPalette(p.id); setOpen(false); }}
                  className={cls("flex min-h-12 min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition", palette === p.id ? "border-primary bg-accent" : "border-border bg-card hover:bg-muted")}
                >
                  <span className="flex shrink-0 overflow-hidden rounded-full border border-border">
                    <span className="h-4 w-4" style={{ background: p.light }} />
                    <span className="h-4 w-4" style={{ background: p.dark }} />
                  </span>
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
      <button
        type="button"
        aria-label="Escolher tema de cores"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Temas e cores"
        onClick={() => setOpen((value) => !value)}
        className="no-print grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-foreground hover:bg-muted"
      >
        <PaletteIcon className="h-5 w-5" />
      </button>
      {dialog}
    </>
  );
}

/* ---------------- sound ---------------- */
function beep() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextClass();
    void ctx.resume();
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
    window.setTimeout(() => { void ctx.close().catch(() => undefined); }, 1800);
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
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
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
        if (p1.length < 4 || p1 === RESET_PASSWORD) return setErr("A nova senha precisa ter pelo menos 4 caracteres e ser única.");
        if (p1 !== p2) return setErr("As senhas não conferem.");
        try { await updateOwnPassword(current, p1); await finish(); await refreshCloud(); } catch (error) { setErr(error instanceof Error ? error.message : "Não foi possível alterar."); }
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
  const add = buildMissingDoses(s.meds, s.doses, ownerId, new Date(), uid);
  if (add.length) setState((st) => ({ ...st, doses: [...st.doses, ...add] }));
}

function AlarmEngine({ me }: { me: User }) {
  const [active, setActive] = useState<Dose | null>(null);
  const doses = useStore((s) => s.doses); const meds = useStore((s) => s.meds); const patients = useStore((s) => s.patients);
  useEffect(() => {
    if (me.role !== "cuidador") return;
    const tick = () => {
      ensureTodayDoses(me.id);
      const s = getState(); const now = Date.now();
      // tolerance alerts
      const late = s.doses.filter((d) => d.ownerId === me.id && d.status === "pendente" && !d.lateAlerted && (() => { const m = s.meds.find((x) => x.id === d.medId); return m && now > new Date(d.scheduledAt).getTime() + m.tolerance * 60000; })());
      if (late.length) setState((st) => ({
        ...st,
        doses: st.doses.map((d) => (late.some((l) => l.id === d.id) ? { ...d, lateAlerted: true } : d)),
        alerts: [...late.map((d) => ({ id: uid(), ownerId: me.id, at: new Date().toISOString(), read: false, text: `Dose atrasada além da tolerância: ${st.meds.find((m) => m.id === d.medId)?.name} (${st.patients.find((p) => p.id === d.patientId)?.name})` })), ...st.alerts],
      }));
      const due = findDueDose(getState().doses, me.id, now);
      if (due) {
        setState((st) => ({ ...st, doses: st.doses.map((d) => (d.id === due.id ? { ...d, lastShown: new Date().toISOString() } : d)) }));
        setActive(due);
        const currentState = getState();
        const m = currentState.meds.find((x) => x.id === due.medId);
        const p = currentState.patients.find((x) => x.id === due.patientId);
        if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
          try {
            new Notification(`Dose Certa • ${p?.name ?? "Paciente"}`, {
              body: `${m?.name ?? "Medicamento"} ${m?.dose ?? ""} · Horário: ${fmtTime(due.scheduledAt)}`,
              tag: `dose-${due.id}`,
              renotify: true,
            });
          } catch { /* Mobile background delivery uses Firebase messaging instead. */ }
        }
      }
    };
    const resume = () => { if (!document.hidden) tick(); };
    tick(); const id = setInterval(tick, 15000);
    document.addEventListener("visibilitychange", resume); window.addEventListener("focus", resume);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", resume); window.removeEventListener("focus", resume); };
  }, [me.id, me.role]);

  useEffect(() => {
    if (!active) return;
    const vibrate = () => {
      try { if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate([350, 160, 350, 160, 650]); } catch { /* Vibração pode não estar disponível. */ }
    };
    const stopVibration = () => {
      try { if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(0); } catch { /* Sem suporte. */ }
    };
    beep();
    vibrate();
    const soundLoop = window.setInterval(beep, 2400);
    const vibrationLoop = window.setInterval(vibrate, 2400);
    return () => {
      window.clearInterval(soundLoop);
      window.clearInterval(vibrationLoop);
      stopVibration();
    };
  }, [active?.id]);

  if (!active) return null;
  const d = doses.find((x) => x.id === active.id) ?? active; const m = meds.find((x) => x.id === d.medId); const p = patients.find((x) => x.id === d.patientId);
  const act = (kind: "tomado" | "snooze" | "nao") => {
    setState((s) => {
      let st = { ...s, doses: s.doses.map((x) => x.id !== d.id ? x : kind === "tomado" ? { ...x, status: "tomado" as const, takenAt: new Date().toISOString() } : kind === "nao" ? { ...x, status: "nao_tomado" as const } : { ...x, snoozeUntil: new Date(Date.now() + SNOOZE_MIN * 60000).toISOString() }) };
      if (kind === "tomado") {
        const consumed = Number.isFinite(m?.quantityPerDose) && (m?.quantityPerDose ?? 0) > 0 ? m!.quantityPerDose! : 1;
        st = { ...st, meds: st.meds.map((x) => (x.id === d.medId ? { ...x, stock: Math.max(0, x.stock - consumed) } : x)) };
      }
      if (kind === "nao") st = { ...st, alerts: [{ id: uid(), ownerId: d.ownerId, at: new Date().toISOString(), read: false, text: `⚠ ${p?.name ?? "Paciente"} informou que NÃO tomou ${m?.name ?? "o medicamento"} (${fmtTime(d.scheduledAt)}).` }, ...st.alerts] };
      return st;
    });
    setActive(null);
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
            <button className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 text-base font-extrabold text-primary-foreground shadow-lg shadow-primary/25 transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 sm:min-h-16 sm:text-lg" onClick={() => act("tomado")}>
              <CheckCircle2 className="h-5 w-5" /><T k="alarm-yes">Já tomei meu medicamento</T>
            </button>
            <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-primary/35 bg-primary/8 px-5 py-3.5 text-sm font-bold text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 sm:text-base" onClick={() => act("snooze")}>
              <Clock3 className="h-5 w-5" /><T k="alarm-snooze">Lembrar em 5 minutos</T>
            </button>
            <button className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground" onClick={() => act("nao")}>
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
type Page = "inicio" | "pacientes" | "medicamentos" | "historico" | "suporte" | "perfil" | "admin";

function Dashboard({ me, go, activePatientId = "" }: { me: User; go: (p: Page) => void; activePatientId?: string }) {
  const doses = useStore((s) => s.doses.filter((d) => d.ownerId === me.id && (!activePatientId || d.patientId === activePatientId) && new Date(d.scheduledAt).toDateString() === new Date().toDateString()));
  const meds = useStore((s) => s.meds); const patients = useStore((s) => s.patients);
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

function Patients({ me, activePatientId = "", onSelectPatient }: {
  me: User;
  activePatientId?: string;
  onSelectPatient: (patientId: string) => void;
}) {
  const patients = useStore((s) => s.patients.filter((p) => me.role === "mestre" || p.ownerId === me.id));
  const [f, setF] = useState({ name: "", age: "", notes: "" });
  const [err, setErr] = useState("");

  const focusPatientForm = () => {
    document.getElementById("patient-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("patient-name")?.focus();
  };

  return (
    <div className="space-y-6">
      <div>
        <T k="pat-title" as="h1" className="font-display text-3xl text-foreground">Pacientes</T>
        <p className="mt-1 text-sm text-muted-foreground">{patients.length} de {MAX_PATIENTS} pacientes cadastrados.</p>
      </div>

      {patients.length === 0 && (
        <EmptyState
          icon={<UsersRound className="h-6 w-6" />}
          title="Comece cadastrando um paciente"
          description="Adicione a pessoa que receberá os cuidados. Depois, você poderá vincular medicamentos e horários ao cadastro dela."
          actionLabel="Cadastrar primeiro paciente"
          onAction={focusPatientForm}
        />
      )}

      {patients.length < MAX_PATIENTS && (
        <form id="patient-form" className={cls(card, "grid gap-3 sm:grid-cols-[1fr_120px]")} onSubmit={(e) => {
          e.preventDefault();
          setErr("");
          if (!f.name.trim() || !Number(f.age)) return setErr("Informe nome e idade.");
          if (!canAddPatient(getState(), me.id)) return setErr(`Limite de ${MAX_PATIENTS} pacientes.`);
          const patientId = uid();
          setState((s) => ({ ...s, patients: [...s.patients, { id: patientId, ownerId: me.id, name: f.name.trim(), age: Number(f.age), notes: f.notes.trim() }] }));
          if (me.role === "cuidador") onSelectPatient(patientId);
          setF({ name: "", age: "", notes: "" });
        }}>
          <input id="patient-name" className={input} placeholder="Nome do paciente" aria-label="Nome do paciente" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input className={input} type="number" min="0" placeholder="Idade" aria-label="Idade" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value })} />
          <textarea className={cls(input, "sm:col-span-2")} placeholder="Observações (opcional)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          {err && <p className="text-sm text-destructive sm:col-span-2">{err}</p>}
          <button className={cls(btnPrimary, "sm:col-span-2")}><Plus className="h-4 w-4" />Adicionar paciente</button>
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
                  <button aria-label={`Excluir paciente ${p.name}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-destructive hover:bg-destructive/10" onClick={() => {
                    if (confirm(`Excluir ${p.name} e seus medicamentos?`)) {
                      setState((s) => ({ ...s, patients: s.patients.filter((x) => x.id !== p.id), meds: s.meds.filter((m) => m.patientId !== p.id), doses: s.doses.filter((d) => d.patientId !== p.id) }));
                      if (activePatientId === p.id) onSelectPatient("");
                    }
                  }}><Trash2 className="h-4 w-4" /></button>
                </div>
                {p.notes && <p className="mt-2 text-sm text-muted-foreground">{p.notes}</p>}
                {me.role === "cuidador" && (
                  <button type="button" onClick={() => onSelectPatient(isActive ? "" : p.id)} className={cls("mt-4 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition", isActive ? "border-primary/25 bg-primary/10 text-primary" : "border-border text-foreground hover:bg-muted")}>
                    {isActive ? <><CheckCircle2 className="h-4 w-4" />Paciente selecionado</> : "Selecionar paciente"}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

const DOSE_PERIODS: { value: DosePeriod; label: string }[] = [
  { value: "manhã", label: "Manhã" },
  { value: "tarde", label: "Tarde" },
  { value: "noite", label: "Noite" },
  { value: "madrugada", label: "Madrugada" },
  { value: "antes-almoco", label: "Antes do almoço" },
  { value: "depois-almoco", label: "Depois do almoço" },
  { value: "antes-jantar", label: "Antes do jantar" },
  { value: "depois-jantar", label: "Depois do jantar" },
  { value: "personalizado", label: "Personalizado" },
];

const STRENGTH_UNITS = ["mcg", "mg", "g", "mL", "UI", "mg/mL", "mcg/mL", "UI/mL", "%"];
const PRESENTATIONS = ["Comprimido", "Cápsula", "Drágea", "Solução oral", "Suspensão", "Gotas", "Sachê", "Ampola", "Spray", "Creme", "Pomada", "Outro"];
const QUANTITY_UNITS = ["Comprimido(s)", "Cápsula(s)", "Drágea(s)", "mL", "Gota(s)", "Sachê(s)", "Ampola(s)", "Jato(s)", "Aplicação(ões)", "Unidade(s)"];
const DEFAULT_TIMES = ["08:00", "13:00", "20:00", "06:00", "10:00", "16:00"];
const DEFAULT_PERIODS: DosePeriod[] = ["manhã", "depois-almoco", "noite", "madrugada", "manhã", "tarde"];

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

function Meds({ me, activePatientId = "", go }: {
  me: User;
  activePatientId?: string;
  go: (page: Page) => void;
}) {
  const patients = useStore((s) => s.patients.filter((p) => me.role === "mestre" || p.ownerId === me.id));
  const allMeds = useStore((s) => s.meds.filter((m) => me.role === "mestre" || m.ownerId === me.id));
  const meds = allMeds.filter((m) => !activePatientId || m.patientId === activePatientId);
  const [step, setStep] = useState(1);
  const [timePickerIndex, setTimePickerIndex] = useState<number | null>(null);
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
                <button aria-label={"Excluir medicamento " + m.name} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-destructive hover:bg-destructive/10" onClick={() => setState((s) => ({ ...s, meds: s.meds.filter((x) => x.id !== m.id), doses: s.doses.filter((d) => d.medId !== m.id) }))}><Trash2 className="h-4 w-4" /></button>
              </div>

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
                <button
                  className={cls(btnOutline, "ml-auto px-3 py-1.5 text-xs")}
                  onClick={() => setState((s) => ({
                    ...s,
                    meds: s.meds.map((x) => x.id === m.id
                      ? { ...x, stock: x.stock + 30, initialStock: (x.initialStock ?? x.stock) + 30 }
                      : x),
                  }))}
                >+30</button>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{schedule.length} {schedule.length === 1 ? "dose" : "doses"} por dia</span>
                <span className="text-right">Estoque estimado: {estimateStockDays(m) === null ? "—" : String(estimateStockDays(m)) + " dia(s)"}</span>
              </div>
              <label className="flex items-center justify-end gap-2 border-t border-border/70 pt-2 text-xs text-muted-foreground">
                Tolerância
                <input className="w-16 rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground" type="number" min="0" step="1" value={m.tolerance} onChange={(e) => setState((s) => ({ ...s, meds: s.meds.map((x) => (x.id === m.id ? { ...x, tolerance: Number(e.target.value) } : x)) }))} />
                min
              </label>
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
  const csv = () => {
    const lines = [["Data", "Paciente", "Medicamento", "Status"], ...rows.map((d) => [fmtDate(d.scheduledAt), patients.find((p) => p.id === d.patientId)?.name ?? "", meds.find((m) => m.id === d.medId)?.name ?? "", d.status])];
    const blob = new Blob(["\uFEFF", lines.map((l) => l.map(csvCell).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "historico-dose-certa.csv"; a.click();
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
              <span className="min-w-0 flex-1 truncate text-foreground">{meds.find((m) => m.id === d.medId)?.name ?? "—"} · {patients.find((p) => p.id === d.patientId)?.name ?? "—"}</span><StatusBadge s={d.status} /></li>))}</ul>}
      </div>
    </div>
  );
}

function Support({ me }: { me: User }) {
  const tickets = useStore((s) => s.tickets); const users = useStore((s) => s.users);
  const mine = me.role === "cuidador" ? tickets.filter((t) => t.userId === me.id) : tickets;
  const [subject, setSubject] = useState(""); const [text, setText] = useState(""); const [open, setOpen] = useState<string | null>(null); const [reply, setReply] = useState("");
  const faq: [string, string][] = [["Dúvida sobre interação medicamentosa", "Converse com o farmacêutico ou abra um chamado."], ["Posso tomar com café?", "Depende do medicamento; consulte a bula."], ["Efeitos colaterais", "Em caso de reação, procure atendimento médico."]];
  return (
    <div className="space-y-6">
      <T k="sup-title" as="h1" className="font-display text-3xl text-foreground">Central de Atendimento</T>
      <T k="sup-sub" as="p" className="text-muted-foreground">Estamos aqui para ajudar com o app e dúvidas sobre bulas e medicamentos.</T>
      {me.role === "cuidador" && (
        <form id="support-form" className={cls(card, "space-y-3")} onSubmit={(e) => { e.preventDefault(); if (!subject.trim() || !text.trim()) return;
          setState((s) => ({ ...s, tickets: [{ id: uid(), userId: me.id, subject: subject.trim(), status: "aberto", messages: [{ from: me.login, text: text.trim(), at: new Date().toISOString() }] }, ...s.tickets] })); setSubject(""); setText(""); }}>
          <h2 className="font-display text-lg text-foreground">Abrir chamado</h2>
          <input className={input} placeholder="Assunto" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea className={input} placeholder="Descreva sua dúvida" value={text} onChange={(e) => setText(e.target.value)} />
          <button className={btnPrimary}>Enviar</button>
        </form>)}
      <div className={card}><h2 className="mb-2 font-display text-lg text-foreground">Perguntas frequentes</h2>
        {faq.map(([q, a], i) => <details key={q} className="border-b border-border py-2"><summary className="cursor-pointer font-semibold text-foreground"><T k={`faq-q${i}`}>{q!}</T></summary><T k={`faq-a${i}`} as="p" className="mt-1 text-sm text-muted-foreground">{a!}</T></details>)}</div>
      <div className="space-y-3">
        {mine.length === 0 && me.role === "cuidador" && (
          <EmptyState icon={<LifeBuoy className="h-6 w-6" />} title="Nenhum chamado por aqui" description="Quando surgir uma dúvida sobre o aplicativo, abra um chamado e acompanhe a resposta nesta área." actionLabel="Abrir primeiro chamado" onAction={() => {
            document.getElementById("support-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
            document.querySelector<HTMLInputElement>("#support-form input")?.focus();
          }} />
        )}
        {mine.length === 0 && me.role !== "cuidador" && <p className="text-sm text-muted-foreground">Nenhum chamado recebido ainda.</p>}
        {mine.map((t) => (
          <div key={t.id} className={card}>
            <div className="flex items-center gap-2">
            <Button variant="ghost" className="h-auto min-w-0 flex-1 justify-between gap-2 whitespace-normal px-0 text-left hover:bg-transparent" onClick={() => setOpen(open === t.id ? null : t.id)}>
              <span className="min-w-0 truncate font-semibold text-foreground">{t.subject} <span className="text-xs text-muted-foreground">· {users.find((u) => u.id === t.userId)?.login}</span></span>
              <span className={cls("rounded-full px-3 py-1 text-xs font-bold", t.status === "aberto" ? "bg-warning/20 text-foreground" : "bg-primary/15 text-primary")}>{t.status}</span>
            </Button>
            <TicketManagement ticket={t} me={me} />
            </div>
            {open === t.id && <div className="mt-3 space-y-2">
              {t.messages.map((m, i) => <div key={i} className="rounded-xl bg-muted p-3 text-sm"><p className="text-xs font-bold text-muted-foreground">{m.from} · {fmtDate(m.at)}</p><p className="text-foreground">{m.text}</p></div>)}
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!reply.trim()) return;
                setState((s) => ({ ...s, tickets: s.tickets.map((x) => x.id === t.id ? { ...x, status: me.role === "cuidador" ? "aberto" : "respondido", messages: [...x.messages, { from: `${me.login} (${me.role})`, text: reply.trim(), at: new Date().toISOString() }] } : x) })); setReply(""); }}>
                <input className={input} placeholder="Responder..." value={reply} onChange={(e) => setReply(e.target.value)} /><button className={btnPrimary}>Enviar</button>
              </form>
              {me.role !== "cuidador" && <button className="text-xs text-muted-foreground underline" onClick={() => setState((s) => ({ ...s, tickets: s.tickets.map((x) => x.id === t.id ? { ...x, status: "fechado" } : x) }))}>Fechar chamado</button>}
            </div>}
          </div>))}
      </div>
    </div>
  );
}

function Profile({ me }: { me: User }) {
  const [cur, setCur] = useState("");
  const [p1, setP1] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [pushRegistered, setPushRegistered] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [vibrationMessage, setVibrationMessage] = useState("");
  const [showInstallHelp, setShowInstallHelp] = useState(false);
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
        setNotificationMessage("Notificação de teste enviada. Bloqueie a tela ou deixe o Dose Certa em segundo plano e confira se o aviso chega.");
      } else if (result.devices === 0) {
        setNotificationMessage("Nenhum aparelho está vinculado ainda. Ative as notificações neste perfil primeiro.");
      } else {
        setNotificationMessage("O envio foi tentado, mas o serviço não confirmou a entrega. Confira a conexão e tente novamente.");
      }
    } catch (error) {
      setNotificationMessage(error instanceof Error ? error.message : "Não foi possível enviar o teste de notificação.");
    } finally {
      setTestBusy(false);
    }
  };

  const testVibration = () => {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
      setVibrationMessage("Este navegador não oferece vibração acionável pela página. O padrão das notificações ainda depende do Android e do navegador.");
      return;
    }
    const pattern = Array.from({ length: 20 }, () => [400, 100]).flat();
    const accepted = navigator.vibrate(pattern);
    setVibrationMessage(accepted
      ? "Teste solicitado: 20 ciclos de 400 ms vibrando e 100 ms de pausa. O navegador pode limitar a duração."
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

  return (
    <div className="space-y-6">
      <T k="prof-title" as="h1" className="font-display text-3xl text-foreground">Meu perfil</T>
      <div className={card}><p className="text-foreground"><b>Login:</b> {me.login}</p><p className="text-foreground"><b>Perfil:</b> {me.role}</p></div>
      <PalettePicker />

      <section className={cls(card, "space-y-4")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">Notificações e vibração</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">Gerencie os avisos deste aparelho e teste se o Dose Certa consegue chamar sua atenção.</p>
          </div>
          <span className={cls("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold", notificationIsActive ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : permission === "denied" ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground")}>
            <span className={cls("h-2 w-2 rounded-full", notificationIsActive ? "bg-emerald-500" : permission === "denied" ? "bg-destructive" : "bg-muted-foreground")} />
            {notificationIsActive ? "Ativas neste aparelho" : permission === "denied" ? "Permissão bloqueada" : permission === "unsupported" ? "Não compatível" : "Ainda não ativadas"}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-background/60 p-3.5">
            <div className="flex items-center gap-2 text-foreground">
              <BellRing className="h-5 w-5 text-primary" />
              <p className="text-sm font-bold">Notificações</p>
            </div>
            <p className="mt-1.5 min-h-10 text-xs leading-relaxed text-muted-foreground">Permita os avisos e registre este celular para receber os lembretes.</p>
            <button type="button" onClick={() => void activateNotifications()} disabled={pushBusy} className={cls(btnPrimary, "mt-3 w-full")}>
              <BellRing className="h-4 w-4" />{pushBusy ? "Ativando..." : notificationIsActive ? "Atualizar vínculo" : "Ativar notificações"}
            </button>
          </div>

          <div className="rounded-2xl border border-border bg-background/60 p-3.5">
            <div className="flex items-center gap-2 text-foreground">
              <Vibrate className="h-5 w-5 text-primary" />
              <p className="text-sm font-bold">Vibração</p>
            </div>
            <p className="mt-1.5 min-h-10 text-xs leading-relaxed text-muted-foreground">Faça um teste com 20 pulsos para verificar a resposta do aparelho.</p>
            <button type="button" onClick={testVibration} className={cls(btnOutline, "mt-3 w-full")}>
              <Vibrate className="h-4 w-4" />Testar vibração
            </button>
          </div>

          <div className="rounded-2xl border border-border bg-background/60 p-3.5 sm:col-span-2">
            <div className="flex items-center gap-2 text-foreground">
              <Bell className="h-5 w-5 text-primary" />
              <p className="text-sm font-bold">Teste de notificação em segundo plano</p>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Envia um push real para este aparelho. Depois de tocar no botão, bloqueie a tela ou deixe o aplicativo em segundo plano para conferir a chegada.</p>
            <button type="button" onClick={() => void sendBackgroundTest()} disabled={testBusy || !pushRegistered} className={cls(btnOutline, "mt-3 w-full sm:w-auto")}>
              <BellRing className="h-4 w-4" />{testBusy ? "Enviando teste..." : "Enviar notificação de teste"}
            </button>
            {!pushRegistered && <p className="mt-2 text-xs font-semibold text-muted-foreground">Ative as notificações neste aparelho antes de enviar o teste.</p>}
          </div>
        </div>

        {notificationMessage && <p role="status" className="rounded-xl bg-muted px-3 py-2.5 text-sm leading-relaxed text-foreground">{notificationMessage}</p>}
        {vibrationMessage && <p role="status" className="rounded-xl bg-muted px-3 py-2.5 text-sm leading-relaxed text-foreground">{vibrationMessage}</p>}
        <p className="text-xs leading-relaxed text-muted-foreground">A vibração depende das permissões e configurações do aparelho. O modo silencioso, a economia de bateria e as regras do navegador podem limitar os alertas.</p>
      </section>

      <section className={cls(card, "space-y-3")}>
        <div>
          <h2 className="font-display text-xl font-semibold text-foreground">Instalação do aplicativo</h2>
          <p className="mt-1 text-sm text-muted-foreground">Adicione o Dose Certa à tela inicial ou ao computador para abrir como aplicativo.</p>
        </div>
        {isStandalone ? (
          <p className="rounded-xl bg-primary/10 px-3 py-2.5 text-sm font-semibold text-primary">O Dose Certa já está instalado e aberto como aplicativo neste aparelho.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {installFlow.step === "native" && <button type="button" onClick={() => void startInstallation()} className={btnPrimary}><Download className="h-4 w-4" />Instalar agora</button>}
            <button type="button" onClick={() => setShowInstallHelp((open) => !open)} className={btnOutline}><Download className="h-4 w-4" />{showInstallHelp ? "Ocultar instruções" : "Instalação manual"}</button>
            {installFlow.step === "own-tab" && <button type="button" onClick={() => installFlow.openOwnTab()} className={btnOutline}>Abrir em nova aba</button>}
          </div>
        )}
        {showInstallHelp && !isStandalone && (
          <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-4 text-sm leading-relaxed text-foreground">
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
                <li>Confirme a instalação e abra pelo novo ícone.</li>
              </ol>
            ) : (
              <p>No Chrome ou Edge, use o ícone de instalação na barra de endereço ou abra o menu do navegador e escolha <b>Instalar Dose Certa</b>.</p>
            )}
          </div>
        )}
      </section>

      <form className={cls(card, "max-w-md space-y-3")} onSubmit={async (e) => { e.preventDefault();
        try { await updateOwnPassword(cur, p1); setCur(""); setP1(""); setMsg({ ok: true, t: "Senha alterada!" }); }
        catch (error) { setMsg({ ok: false, t: error instanceof Error ? error.message : "Não foi possível alterar." }); } }}>
        <h2 className="font-display text-lg text-foreground">Alterar senha</h2>
        <input className={input} type="password" placeholder="Senha atual" value={cur} onChange={(e) => setCur(e.target.value)} />
        <input className={input} type="password" placeholder="Nova senha" value={p1} onChange={(e) => setP1(e.target.value)} />
        {msg && <p className={cls("text-sm", msg.ok ? "text-primary" : "text-destructive")}>{msg.t}</p>}
        <button className={btnPrimary}>Salvar</button>
      </form>
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
  const [page, setPage] = useState<Page>(me.role === "mestre" ? "admin" : "inicio");
  const patientOptions = useStore((s) => s.patients.filter((p) => p.ownerId === me.id));
  const patientIdsKey = patientOptions.map((p) => p.id).join("|");
  const [activePatientId, setActivePatientId] = useState("");
  useEffect(() => {
    const saved = localStorage.getItem(`dc-patient-${me.id}`);
    const next = saved && patientOptions.some((p) => p.id === saved)
      ? saved
      : patientOptions.length === 1 ? patientOptions[0].id : "";
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
  useEffect(() => { if (!items.some((item) => item.id === page)) setPage(me.role === "mestre" ? "admin" : "inicio"); }, [me.role, page]);
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
          <div className="flex items-center gap-2"><PaletteQuickAccess /><ThemeToggle />{me.role === "cuidador" && <AlertsBell me={me} />}
            <button aria-label="Sair" onClick={logout} className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-foreground md:hidden"><LogOut className="h-5 w-5" /></button></div>
        </header>
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
          {page === "pacientes" && <Patients me={me} activePatientId={activePatientId} onSelectPatient={selectPatient} />}
          {page === "medicamentos" && <Meds me={me} activePatientId={activePatientId} go={setPage} />}
          {page === "historico" && <HistoryPage me={me} activePatientId={activePatientId} go={setPage} />}
          {page === "suporte" && <Support me={me} />}
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
