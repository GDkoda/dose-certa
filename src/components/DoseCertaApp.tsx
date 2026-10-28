import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell, BellRing, ClipboardList, Download, Headphones, History, Home, Leaf, LogOut, Moon, Pencil, Pill,
  Plus, Printer, Shield, Sun, Trash2, User as UserIcon, Users, X,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { AccountAdmin } from "./AccountAdmin";
import { TicketManagement } from "./TicketManagement";
import { PushSettings } from "./PushSettings";
import { removePushDevice } from "@/lib/push.functions";
import { registerAccount, finishPasswordChange } from "@/lib/accounts.functions";
import { cloudLogin, cloudLogout, initializeCloud, onCloudError, refreshCloud, updateOwnPassword } from "@/lib/cloud-store";
import lavender from "@/assets/lavender.png";
import { buildMissingDoses, findDueDose } from "@/lib/alarm-rules";
import { estimateStockDays, stockLevel } from "@/lib/stock-rules";
import { summarizeDoseStatuses } from "@/lib/report-rules";
import {
  canAddPatient, getState, MAX_PATIENTS, RESET_PASSWORD, setState, SNOOZE_MIN, uid, useStore,
  type Dose, type Role, type User,
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
const card = "rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]";

function useMe(): User | null {
  return useStore((s) => s.users.find((u) => u.id === s.sessionId) ?? null);
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
function useImage(k: string, fallback: string) { return useStore((s) => s.images[k]) ?? fallback; }
function ImageEditButton({ k, className }: { k: string; className?: string }) {
  const me = useMe();
  const ref = useRef<HTMLInputElement>(null);
  if (me?.role !== "mestre") return null;
  return (
    <>
      <button aria-label="Trocar imagem" onClick={() => ref.current?.click()} className={cls("no-print z-10 grid h-7 w-7 place-items-center rounded-full bg-card/80 text-foreground opacity-60 shadow hover:opacity-100", className)}>
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => {
        const f = e.target.files?.[0]; if (!f) return;
        const r = new FileReader(); r.onload = () => setState((s) => ({ ...s, images: { ...s.images, [k]: String(r.result) } })); r.readAsDataURL(f);
      }} />
    </>
  );
}
function Logo({ size = 40 }: { size?: number }) {
  const icon = useStore((s) => s.images["app-icon"]);
  return (
    <span className="relative inline-flex">
      {icon ? <img src={icon} alt="Ícone do app" style={{ width: size, height: size }} className="rounded-xl object-cover" />
        : <span style={{ width: size, height: size }} className="grid place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><Leaf className="h-1/2 w-1/2" /></span>}
      <ImageEditButton k="app-icon" className="absolute -right-2 -top-2 h-5 w-5" />
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

export type Palette = "verde" | "azul" | "rosa" | "lavanda";
export const PALETTES: { id: Palette; name: string; light: string; dark: string }[] = [
  { id: "verde", name: "Sálvia", light: "oklch(0.52 0.05 165)", dark: "oklch(0.66 0.06 165)" },
  { id: "azul", name: "Oceano", light: "oklch(0.52 0.11 245)", dark: "oklch(0.7 0.11 240)" },
  { id: "rosa", name: "Peônia", light: "oklch(0.56 0.15 8)", dark: "oklch(0.72 0.13 8)" },
  { id: "lavanda", name: "Lavanda", light: "oklch(0.54 0.12 292)", dark: "oklch(0.73 0.1 292)" },
];
function usePalette() {
  const [palette, setPaletteState] = useState<Palette>("verde");
  useEffect(() => {
    const saved = localStorage.getItem("dc-palette");
    const p: Palette = saved === "azul" || saved === "rosa" || saved === "lavanda" ? saved : "verde";
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
    <div className={cls(card, "max-w-md space-y-3")}>
      <h2 className="font-display text-lg text-foreground">Cor do aplicativo</h2>
      <p className="text-sm text-muted-foreground">Escolha a paleta deste aparelho. Ela combina com o modo claro e o noturno.</p>
      <div className="flex gap-3" role="radiogroup" aria-label="Cor do aplicativo">
        {PALETTES.map((p) => (
          <button key={p.id} role="radio" aria-checked={palette === p.id} onClick={() => setPalette(p.id)} className={cls("flex flex-col items-center gap-1 rounded-2xl border p-3 transition", palette === p.id ? "border-primary bg-accent" : "border-border bg-card hover:bg-muted")}>
            <span className="flex overflow-hidden rounded-full border border-border">
              <span className="h-6 w-6" style={{ background: p.light }} />
              <span className="h-6 w-6" style={{ background: p.dark }} />
            </span>
            <span className="text-xs text-foreground">{p.name}</span>
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

/* ---------------- sound ---------------- */
function beep() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.2, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
    });
  } catch { /* no audio */ }
}

/* ---------------- auth screens ---------------- */
function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup" | "recover">("login");
  const [login, setLogin] = useState(""); const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const bg = useImage("auth-bg", lavender);

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
      <img src={bg} alt="" className="pointer-events-none absolute -right-20 bottom-0 h-[90%] opacity-60" width={768} height={1152} />
      <img src={lavender} alt="" className="pointer-events-none absolute -left-24 -top-10 h-[60%] rotate-180 opacity-25" width={768} height={1152} />
      <ImageEditButton k="auth-bg" className="absolute right-4 top-20" />
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
        setActive(due); beep();
        const m = getState().meds.find((x) => x.id === due.medId);
        if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
          try { new Notification("Hora do seu medicamento", { body: m ? `${m.name} ${m.dose}` : "" }); } catch { /* Mobile background delivery uses Firebase messaging instead. */ }
        }
      }
    };
    const resume = () => { if (!document.hidden) tick(); };
    tick(); const id = setInterval(tick, 15000);
    document.addEventListener("visibilitychange", resume); window.addEventListener("focus", resume);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", resume); window.removeEventListener("focus", resume); };
  }, [me.id, me.role]);

  if (!active) return null;
  const d = doses.find((x) => x.id === active.id) ?? active; const m = meds.find((x) => x.id === d.medId); const p = patients.find((x) => x.id === d.patientId);
  const act = (kind: "tomado" | "snooze" | "nao") => {
    setState((s) => {
      let st = { ...s, doses: s.doses.map((x) => x.id !== d.id ? x : kind === "tomado" ? { ...x, status: "tomado" as const, takenAt: new Date().toISOString() } : kind === "nao" ? { ...x, status: "nao_tomado" as const } : { ...x, snoozeUntil: new Date(Date.now() + SNOOZE_MIN * 60000).toISOString() }) };
      if (kind === "tomado") st = { ...st, meds: st.meds.map((x) => (x.id === d.medId ? { ...x, stock: Math.max(0, x.stock - 1) } : x)) };
      if (kind === "nao") st = { ...st, alerts: [{ id: uid(), ownerId: d.ownerId, at: new Date().toISOString(), read: false, text: `⚠ ${p?.name ?? "Paciente"} informou que NÃO tomou ${m?.name ?? "o medicamento"} (${fmtTime(d.scheduledAt)}).` }, ...st.alerts] };
      return st;
    });
    setActive(null);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm">
      <div className={cls(card, "relative w-full max-w-sm overflow-hidden text-center")}>
        <img src={lavender} alt="" className="pointer-events-none absolute -right-10 -top-6 h-48 opacity-30" width={768} height={1152} />
        <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-accent"><BellRing className="h-8 w-8 animate-pulse text-secondary" /></div>
        <T k="alarm-title" as="h2" className="font-display text-2xl text-foreground">Hora do seu medicamento</T>
        <p className="mt-2 text-lg font-bold text-foreground">{m?.name} {m?.dose}</p>
        <p className="text-sm text-muted-foreground">{p?.name} · {fmtTime(d.scheduledAt)}</p>
        <div className="mt-5 space-y-2">
          <button className={cls(btnPrimary, "w-full")} onClick={() => act("tomado")}><T k="alarm-yes">Já tomei meu medicamento</T></button>
          <button className={cls(btnLavender, "w-full")} onClick={() => act("snooze")}><T k="alarm-snooze">Lembrar em 5 minutos</T></button>
          <button className={cls(btnOutline, "w-full")} onClick={() => act("nao")}><T k="alarm-no">Não tomei</T></button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Se não houver resposta, o alarme repete a cada 5 minutos.</p>
      </div>
    </div>
  );
}

function PermissionPrompt() {
  const [show, setShow] = useState(false);
  useEffect(() => { if (typeof Notification !== "undefined" && Notification.permission === "default" && !sessionStorage.getItem("dc-perm")) setShow(true); }, []);
  if (!show) return null;
  const close = () => { sessionStorage.setItem("dc-perm", "1"); setShow(false); };
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-foreground/30 p-4">
      <div className={cls(card, "w-full max-w-sm text-center")}>
        <Bell className="mx-auto h-10 w-10 text-primary" />
        <T k="perm-title" as="h2" className="mt-2 font-display text-xl text-foreground">Vamos cuidar juntos 💜</T>
        <T k="perm-body" as="p" className="mt-2 text-sm text-muted-foreground">Para lembrar você na hora certa de cada dose, permita os avisos e pop-ups do Dose Certa. Prometemos só avisar o que importa.</T>
        <div className="mt-4 flex gap-2">
          <button className={cls(btnOutline, "flex-1")} onClick={close}>Agora não</button>
          <button className={cls(btnPrimary, "flex-1")} onClick={async () => { try { await Notification.requestPermission(); } catch { /* */ } close(); }}>Permitir avisos</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- pages ---------------- */
type Page = "inicio" | "pacientes" | "medicamentos" | "historico" | "suporte" | "perfil" | "admin";

function Dashboard({ me, go }: { me: User; go: (p: Page) => void }) {
  const doses = useStore((s) => s.doses.filter((d) => d.ownerId === me.id && new Date(d.scheduledAt).toDateString() === new Date().toDateString()));
  const meds = useStore((s) => s.meds); const patients = useStore((s) => s.patients);
  const taken = doses.filter((d) => d.status === "tomado").length;
  const pend = doses.filter((d) => d.status === "pendente").length;
  const miss = doses.filter((d) => d.status === "nao_tomado").length;
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const heroImg = useImage("dash-bg", lavender);
  return (
    <div className="space-y-6">
      <div className={cls(card, "relative overflow-hidden")}>
        <img src={heroImg} alt="" className="pointer-events-none absolute -right-6 -top-10 h-64 opacity-50" width={768} height={1152} />
        <ImageEditButton k="dash-bg" className="absolute right-3 top-3" />
        <h1 className="font-display text-3xl text-foreground">{hello}, {me.login}</h1>
        <T k="dash-sub" as="p" className="text-muted-foreground">Seu cuidado hoje faz toda a diferença.</T>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[{ l: "Doses tomadas", v: `${taken}/${doses.length}`, c: "text-primary" }, { l: "Pendentes", v: pend, c: "text-warning" }, { l: "Não tomadas", v: miss, c: "text-destructive" }].map((x) => (
          <div key={x.l} className={card}><p className="text-sm text-muted-foreground">{x.l}</p><p className={cls("text-3xl font-extrabold", x.c)}>{x.v}</p></div>
        ))}
      </div>
      <div className={card}>
        <div className="mb-3 flex items-center justify-between"><T k="dash-next" as="h2" className="font-display text-xl text-foreground">Próximos medicamentos</T>
          <button className="text-sm text-primary" onClick={() => go("medicamentos")}>Ver todos</button></div>
        {doses.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma dose hoje. {patients.filter((p) => p.ownerId === me.id).length === 0 ? "Comece cadastrando um paciente." : "Cadastre medicamentos e horários."}</p> :
          <ul className="divide-y divide-border">
            {[...doses].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).map((d) => { const m = meds.find((x) => x.id === d.medId); return (
              <li key={d.id} className="flex items-center gap-3 py-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent"><Pill className="h-5 w-5 text-secondary" /></span>
                <div className="min-w-0 flex-1"><p className="truncate font-semibold text-foreground">{m?.name} {m?.dose}</p><p className="text-xs text-muted-foreground">{fmtTime(d.scheduledAt)} · {patients.find((p) => p.id === d.patientId)?.name}</p></div>
                <StatusBadge s={d.status} />
              </li>); })}
          </ul>}
      </div>
    </div>
  );
}
function StatusBadge({ s }: { s: Dose["status"] }) {
  const map = { tomado: ["Confirmado", "bg-primary/15 text-primary"], pendente: ["Pendente", "bg-warning/20 text-foreground"], nao_tomado: ["Não tomado", "bg-destructive/15 text-destructive"] } as const;
  return <span className={cls("shrink-0 rounded-full px-3 py-1 text-xs font-bold", map[s][1])}>{map[s][0]}</span>;
}

function Patients({ me }: { me: User }) {
  const patients = useStore((s) => s.patients.filter((p) => me.role === "mestre" || p.ownerId === me.id));
  const [f, setF] = useState({ name: "", age: "", notes: "" }); const [err, setErr] = useState("");
  return (
    <div className="space-y-6">
      <T k="pat-title" as="h1" className="font-display text-3xl text-foreground">Pacientes</T>
      <p className="text-sm text-muted-foreground">{patients.length} de {MAX_PATIENTS} pacientes cadastrados.</p>
      {patients.length < MAX_PATIENTS && (
        <form className={cls(card, "grid gap-3 sm:grid-cols-[1fr_120px]")} onSubmit={(e) => {
          e.preventDefault(); setErr("");
          if (!f.name.trim() || !Number(f.age)) return setErr("Informe nome e idade.");
          if (!canAddPatient(getState(), me.id)) return setErr(`Limite de ${MAX_PATIENTS} pacientes.`);
          setState((s) => ({ ...s, patients: [...s.patients, { id: uid(), ownerId: me.id, name: f.name.trim(), age: Number(f.age), notes: f.notes.trim() }] }));
          setF({ name: "", age: "", notes: "" });
        }}>
          <input className={input} placeholder="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input className={input} type="number" placeholder="Idade" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value })} />
          <textarea className={cls(input, "sm:col-span-2")} placeholder="Observações" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          {err && <p className="text-sm text-destructive sm:col-span-2">{err}</p>}
          <button className={cls(btnPrimary, "sm:col-span-2")}><Plus className="h-4 w-4" />Adicionar paciente</button>
        </form>)}
      <div className="grid gap-4 md:grid-cols-3">
        {patients.map((p) => (
          <div key={p.id} className={card}>
            <div className="flex items-start justify-between"><div><p className="font-display text-lg text-foreground">{p.name}</p><p className="text-sm text-muted-foreground">{p.age} anos</p></div>
              <button aria-label="Excluir paciente" className="text-destructive" onClick={() => { if (confirm(`Excluir ${p.name} e seus medicamentos?`)) setState((s) => ({ ...s, patients: s.patients.filter((x) => x.id !== p.id), meds: s.meds.filter((m) => m.patientId !== p.id) })); }}><Trash2 className="h-4 w-4" /></button></div>
            {p.notes && <p className="mt-2 text-sm text-foreground">{p.notes}</p>}
          </div>))}
      </div>
    </div>
  );
}

function Meds({ me }: { me: User }) {
  const patients = useStore((s) => s.patients.filter((p) => me.role === "mestre" || p.ownerId === me.id));
  const meds = useStore((s) => s.meds.filter((m) => me.role === "mestre" || m.ownerId === me.id));
  const [f, setF] = useState({ patientId: "", name: "", dose: "", times: "08:00", stock: "30", tolerance: "15" }); const [err, setErr] = useState("");
  return (
    <div className="space-y-6">
      <T k="med-title" as="h1" className="font-display text-3xl text-foreground">Medicamentos</T>
      {patients.length === 0 ? <p className="text-muted-foreground">Cadastre um paciente primeiro.</p> : (
        <form className={cls(card, "grid gap-3 sm:grid-cols-2")} onSubmit={(e) => {
          e.preventDefault(); setErr("");
          const times = f.times.split(",").map((t) => t.trim()).filter((t) => /^\d{2}:\d{2}$/.test(t));
          const patient = patients.find((p) => p.id === f.patientId) ?? patients[0];
          if (!patient) return;
          const pid = patient.id;
          if (!f.name.trim() || !times.length) return setErr("Informe nome e ao menos um horário (HH:MM).");
          setState((s) => ({ ...s, meds: [...s.meds, { id: uid(), ownerId: patient.ownerId, patientId: pid, name: f.name.trim(), dose: f.dose.trim(), times, stock: Number(f.stock) || 0, tolerance: Number(f.tolerance) || 0 }] }));
          setF({ ...f, name: "", dose: "" });
        }}>
          <select className={input} value={f.patientId} onChange={(e) => setF({ ...f, patientId: e.target.value })}>{patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input className={input} placeholder="Nome do medicamento" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input className={input} placeholder="Dose (ex.: 50mg, 1 comprimido)" value={f.dose} onChange={(e) => setF({ ...f, dose: e.target.value })} />
          <input className={input} placeholder="Horários: 08:00, 20:00" value={f.times} onChange={(e) => setF({ ...f, times: e.target.value })} />
          <label className="text-sm text-muted-foreground">Estoque (comprimidos)<input className={input} type="number" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} /></label>
          <label className="text-sm text-muted-foreground">Tolerância de atraso (min)<input className={input} type="number" value={f.tolerance} onChange={(e) => setF({ ...f, tolerance: e.target.value })} /></label>
          {err && <p className="text-sm text-destructive sm:col-span-2">{err}</p>}
          <button className={cls(btnPrimary, "sm:col-span-2")}><Plus className="h-4 w-4" />Cadastrar medicamento</button>
        </form>)}
      <div className="grid gap-4 md:grid-cols-2">
        {meds.map((m) => (
          <div key={m.id} className={card}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="font-display text-lg text-foreground">{m.name} <span className="text-sm text-muted-foreground">{m.dose}</span></p>
                <p className="text-sm text-muted-foreground">{patients.find((p) => p.id === m.patientId)?.name} · {m.times.join(", ")} · tolerância {m.tolerance} min</p></div>
              <button aria-label="Excluir medicamento" className="text-destructive" onClick={() => setState((s) => ({ ...s, meds: s.meds.filter((x) => x.id !== m.id) }))}><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className={cls("rounded-full px-3 py-1 font-bold", stockLevel(m) !== "ok" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary")}>Estoque: {m.stock}</span>
              <span className="text-xs text-muted-foreground">{stockLevel(m) === "empty" ? "Estoque esgotado" : stockLevel(m) === "low" ? "Estoque baixo" : "Estoque suficiente"}</span>
              <button className={btnOutline} onClick={() => setState((s) => ({ ...s, meds: s.meds.map((x) => (x.id === m.id ? { ...x, stock: x.stock + 30 } : x)) }))}>+30</button>
              <label className="ml-auto flex items-center gap-1 text-muted-foreground">Tol.<input className="w-16 rounded-lg border border-input bg-card px-2 py-1" type="number" value={m.tolerance} onChange={(e) => setState((s) => ({ ...s, meds: s.meds.map((x) => (x.id === m.id ? { ...x, tolerance: Number(e.target.value) } : x)) }))} /></label>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Estimativa: {estimateStockDays(m) === null ? "cadastre horários para estimar a duração" : String(estimateStockDays(m)) + " dia(s) restantes, considerando uma unidade por horário"}.
            </p>
          </div>))}
      </div>
    </div>
  );
}

function HistoryPage({ me }: { me: User }) {
  const all = useStore((s) => s.doses); const meds = useStore((s) => s.meds); const patients = useStore((s) => s.patients);
  const [pid, setPid] = useState(""); const [st, setSt] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const rows = all.filter((d) => (me.role !== "cuidador" || d.ownerId === me.id) && (!pid || d.patientId === pid) && (!st || d.status === st)
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
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum registro.</p> :
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
        <form className={cls(card, "space-y-3")} onSubmit={(e) => { e.preventDefault(); if (!subject.trim() || !text.trim()) return;
          setState((s) => ({ ...s, tickets: [{ id: uid(), userId: me.id, subject: subject.trim(), status: "aberto", messages: [{ from: me.login, text: text.trim(), at: new Date().toISOString() }] }, ...s.tickets] })); setSubject(""); setText(""); }}>
          <h2 className="font-display text-lg text-foreground">Abrir chamado</h2>
          <input className={input} placeholder="Assunto" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea className={input} placeholder="Descreva sua dúvida" value={text} onChange={(e) => setText(e.target.value)} />
          <button className={btnPrimary}>Enviar</button>
        </form>)}
      <div className={card}><h2 className="mb-2 font-display text-lg text-foreground">Perguntas frequentes</h2>
        {faq.map(([q, a], i) => <details key={q} className="border-b border-border py-2"><summary className="cursor-pointer font-semibold text-foreground"><T k={`faq-q${i}`}>{q!}</T></summary><T k={`faq-a${i}`} as="p" className="mt-1 text-sm text-muted-foreground">{a!}</T></details>)}</div>
      <div className="space-y-3">
        {mine.length === 0 && <p className="text-sm text-muted-foreground">Nenhum chamado ainda.</p>}
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
  const [cur, setCur] = useState(""); const [p1, setP1] = useState(""); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  return (
    <div className="space-y-6">
      <T k="prof-title" as="h1" className="font-display text-3xl text-foreground">Meu perfil</T>
      <div className={card}><p className="text-foreground"><b>Login:</b> {me.login}</p><p className="text-foreground"><b>Perfil:</b> {me.role}</p></div>
      <PalettePicker />
      {me.role === "cuidador" && <PushSettings />}
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
  const [page, setPage] = useState<Page>(me.role === "cuidador" ? "inicio" : "suporte");
  const items: { id: Page; label: string; icon: ReactNode; roles: Role[] }[] = [
    { id: "inicio", label: "Início", icon: <Home className="h-5 w-5" />, roles: ["cuidador", "mestre"] },
    { id: "pacientes", label: "Pacientes", icon: <Users className="h-5 w-5" />, roles: ["cuidador", "mestre"] },
    { id: "medicamentos", label: "Medicamentos", icon: <Pill className="h-5 w-5" />, roles: ["cuidador", "mestre"] },
    { id: "historico", label: "Histórico", icon: <History className="h-5 w-5" />, roles: ["cuidador", "operador", "mestre"] },
    { id: "suporte", label: "Atendimento", icon: <Headphones className="h-5 w-5" />, roles: ["cuidador", "operador", "mestre"] },
    { id: "admin", label: "Contas", icon: <ClipboardList className="h-5 w-5" />, roles: ["mestre"] },
    { id: "perfil", label: "Perfil", icon: <UserIcon className="h-5 w-5" />, roles: ["cuidador", "operador", "mestre"] },
  ].filter((i) => i.roles.includes(me.role)) as typeof items;
  const sideImg = useImage("side-bg", lavender);
  useEffect(() => { if (!items.some((item) => item.id === page)) setPage(me.role === "cuidador" ? "inicio" : "suporte"); }, [me.role, page]);
  const logout = async () => {
    const token = sessionStorage.getItem("dc-push-token");
    if (token) {
      try { await removeDevice({ data: { token } }); sessionStorage.removeItem("dc-push-token"); }
      catch { window.alert("Não foi possível desativar os avisos deste aparelho. Confira sua conexão e tente sair novamente."); return; }
    }
    await cloudLogout();
  };
  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="no-print relative hidden w-64 shrink-0 flex-col overflow-hidden bg-sidebar p-5 text-sidebar-foreground md:flex">
        <div className="mb-8 flex items-center gap-3"><Logo /><T k="brand" className="font-display text-2xl font-semibold">Dose Certa</T></div>
        <nav aria-label="Navegação principal" className="relative z-10 space-y-1">
          {items.map((i) => <button key={i.id} aria-current={page === i.id ? "page" : undefined} onClick={() => setPage(i.id)} className={cls("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition", page === i.id ? "bg-sidebar-primary text-sidebar-primary-foreground" : "hover:bg-sidebar-accent")}>{i.icon}{i.label}</button>)}
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-sidebar-accent"><LogOut className="h-5 w-5" />Sair</button>
        </nav>
        <img src={sideImg} alt="" className="pointer-events-none absolute -bottom-10 -left-10 h-80 opacity-40" width={768} height={1152} />
        <ImageEditButton k="side-bg" className="absolute bottom-4 right-4" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-2 md:hidden"><Logo size={32} /><span className="truncate font-display text-xl text-foreground">Dose Certa</span></div>
          <p className="hidden truncate text-sm text-muted-foreground md:block">{me.role === "mestre" ? "Modo Mestre · toque no lápis para editar" : <T k="header-hint">Organize. Acompanhe. Cuide.</T>}</p>
          <div className="flex items-center gap-2"><ThemeToggle />{me.role === "cuidador" && <AlertsBell me={me} />}
            <button aria-label="Sair" onClick={logout} className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-foreground md:hidden"><LogOut className="h-5 w-5" /></button></div>
        </header>
        <main className="flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-10">
          {page === "inicio" && <Dashboard me={me} go={setPage} />}
          {page === "pacientes" && <Patients me={me} />}
          {page === "medicamentos" && <Meds me={me} />}
          {page === "historico" && <HistoryPage me={me} />}
          {page === "suporte" && <Support me={me} />}
          {page === "perfil" && <Profile me={me} />}
          {page === "admin" && me.role === "mestre" && <AccountAdmin me={me} />}
        </main>
        <nav aria-label="Navegação móvel" className="no-print fixed inset-x-0 bottom-0 z-30 flex flex-wrap justify-around border-t border-border bg-card py-2 md:hidden">
          {items.map((i) => <button key={i.id} aria-current={page === i.id ? "page" : undefined} onClick={() => setPage(i.id)} className={cls("flex flex-col items-center gap-0.5 px-2 text-[11px] font-semibold", page === i.id ? "text-primary" : "text-muted-foreground")}>{i.icon}{i.label}</button>)}

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
    let disposed = false; let cleanup: (() => void) | undefined;
    onCloudError(setCloudError);
    initializeCloud().then((stop) => { if (disposed) stop(); else { cleanup = stop; setReady(true); } }).catch((error) => { setCloudError(error instanceof Error ? error.message : "Não foi possível carregar."); setReady(true); });
    return () => { disposed = true; cleanup?.(); };
  }, []);
  if (!ready) return <div className="min-h-screen bg-background" />;
  return (
    <>
      {cloudError && <div role="alert" className="fixed inset-x-4 top-4 z-50 rounded-lg border border-destructive bg-card p-3 text-sm text-destructive">{cloudError}<Button variant="ghost" size="sm" onClick={() => setCloudError("")}>Fechar</Button></div>}
      <PermissionPrompt />
      {!me ? <AuthScreen /> : me.mustChange ? <ForceChangePassword me={me} /> : <Shell me={me} />}
    </>
  );
}
