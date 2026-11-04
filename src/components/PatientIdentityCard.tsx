import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, CheckCircle2, ImagePlus, Pencil, UserRound, X } from "lucide-react";
import type { Patient, PatientCardTheme } from "@/lib/store";

const themes: { id: PatientCardTheme; name: string; className: string; swatches: string[] }[] = [
  { id: "rosas", name: "Rubi metálico", className: "dc-patient-card--rosas", swatches: ["#190e1c", "#8d2448", "#e8a0ba"] },
  { id: "coracoes", name: "Rosé acetinado", className: "dc-patient-card--coracoes", swatches: ["#321326", "#a84d78", "#e9b8cb"] },
  { id: "praia", name: "Champagne oceânico", className: "dc-patient-card--praia", swatches: ["#092b3a", "#138b8b", "#d5a56d"] },
  { id: "girassol", name: "Ouro solar", className: "dc-patient-card--girassol", swatches: ["#241a0d", "#a77725", "#f0ce75"] },
  { id: "folhas", name: "Esmeralda", className: "dc-patient-card--folhas", swatches: ["#071f1b", "#176449", "#9ccbb1"] },
  { id: "ondas", name: "Safira", className: "dc-patient-card--ondas", swatches: ["#071a35", "#126b9c", "#8bd9ef"] },
  { id: "lavanda", name: "Ametista", className: "dc-patient-card--lavanda", swatches: ["#1b1530", "#665185", "#c5b2e5"] },
  { id: "xadrez", name: "Platina", className: "dc-patient-card--xadrez", swatches: ["#15191f", "#737b89", "#e2e5eb"] },
];

function calculateAge(birthDate: string): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate + "T12:00:00");
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

function formattedDate(value?: string) {
  if (!value) return "";
  const date = new Date(value + "T12:00:00");
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR");
}

function CardMotif({ theme }: { theme: PatientCardTheme }) {
  const id = useId().replace(/:/g, "");
  const patternId = "patient-card-pattern-" + id;
  return (
    <svg aria-hidden="true" viewBox="0 0 600 360" preserveAspectRatio="xMidYMid slice" className="dc-patient-card-motif pointer-events-none absolute inset-0 h-full w-full">
      <defs>
        <pattern id={patternId} width="180" height="140" patternUnits="userSpaceOnUse">
          {theme === "rosas" && (
            <g fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M90 70C25 17 27 119 90 70C153 21 155 123 90 70Z" />
              <path d="M90 70C42 3 0 69 90 70C180 71 138 3 90 70Z" />
              <circle cx="90" cy="70" r="30" /><circle cx="90" cy="70" r="42" />
            </g>
          )}
          {theme === "coracoes" && (
            <g fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M90 45C55 10 22 57 90 105C158 57 125 10 90 45Z" />
              <path d="M90 56C67 32 47 61 90 91C133 61 113 32 90 56Z" />
            </g>
          )}
          {theme === "praia" && (
            <g fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="90" cy="54" r="23" /><circle cx="90" cy="54" r="31" />
              <path d="M-12 94Q12 77 36 94T84 94T132 94T180 94M-12 112Q12 95 36 112T84 112T132 112T180 112M-12 130Q12 113 36 130T84 130T132 130T180 130" />
            </g>
          )}
          {theme === "girassol" && (
            <g fill="none" stroke="currentColor" strokeWidth="1.5">
              {Array.from({ length: 16 }, (_, index) => <ellipse key={index} cx="90" cy="70" rx="12" ry="38" transform={"rotate(" + index * 22.5 + " 90 70)"} />)}
              <circle cx="90" cy="70" r="24" /><circle cx="90" cy="70" r="34" />
            </g>
          )}
          {theme === "folhas" && (
            <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M32 125Q88 78 147 14M59 103Q27 53 54 43Q85 46 59 103ZM87 75Q77 33 110 27Q135 43 87 75ZM111 49Q117 13 151 12Q164 42 111 49Z" />
              <path d="M28 136Q74 112 105 132" />
            </g>
          )}
          {theme === "ondas" && (
            <g fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M-15 42Q8 18 31 42T77 42T123 42T169 42T215 42M-15 67Q8 43 31 67T77 67T123 67T169 67T215 67M-15 92Q8 68 31 92T77 92T123 92T169 92T215 92M-15 117Q8 93 31 117T77 117T123 117T169 117T215 117" />
            </g>
          )}
          {theme === "lavanda" && (
            <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M87 130Q100 81 88 13M91 50Q48 42 57 19Q81 14 91 50ZM94 72Q135 62 124 39Q103 35 94 72ZM89 94Q49 89 55 66Q76 60 89 94ZM97 111Q131 105 121 84Q103 79 97 111Z" />
              <ellipse cx="57" cy="19" rx="8" ry="12" /><ellipse cx="124" cy="39" rx="8" ry="12" />
              <ellipse cx="55" cy="66" rx="8" ry="12" /><ellipse cx="121" cy="84" rx="8" ry="12" />
            </g>
          )}
          {theme === "xadrez" && (
            <g fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M0 0H180V140H0Z M30 0V140M60 0V140M90 0V140M120 0V140M150 0V140M0 28H180M0 56H180M0 84H180M0 112H180" />
              <path d="M0 0L180 140M180 0L0 140" opacity=".55" />
            </g>
          )}
        </pattern>
      </defs>
      <rect width="600" height="360" fill={"url(#" + patternId + ")"} />
    </svg>
  );
}

function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Selecione um arquivo de imagem."));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error("A foto precisa ter no máximo 8 MB."));
      return;
    }
    const objectUrl = URL.createObjectURL(file);
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
        const dataUrl = canvas.toDataURL("image/jpeg", 0.76);
        URL.revokeObjectURL(objectUrl);
        if (dataUrl.length > 280_000) throw new Error("A imagem ainda ficou muito grande. Escolha outra foto.");
        resolve(dataUrl);
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error instanceof Error ? error : new Error("Não foi possível processar a foto."));
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Não foi possível abrir esta imagem."));
    };
    image.src = objectUrl;
  });
}

function Detail({ label, value }: { label: string; value?: string }) {
  const shownValue = value?.trim() || "—";
  return (
    <div className="dc-patient-card-detail min-w-0">
      <p className="text-[8px] font-extrabold uppercase tracking-[0.12em] text-white/75 sm:text-[9px]">{label}</p>
      <p className="mt-0.5 min-h-3 break-words text-[10px] font-extrabold leading-tight text-white sm:text-xs">{shownValue}</p>
    </div>
  );
}

export function PatientIdentityCard({ patient, onClose, onSave }: {
  patient: Patient;
  onClose: () => void;
  onSave: (updated: Patient) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: patient.name,
    birthDate: patient.birthDate ?? "",
    susCard: patient.susCard ?? "",
    healthPlan: patient.healthPlan ?? "",
    identityNumber: patient.identityNumber ?? "",
    cpf: patient.cpf ?? "",
    photoDataUrl: patient.photoDataUrl ?? "",
    cardTheme: patient.cardTheme ?? "folhas" as PatientCardTheme,
  });
  const theme = themes.find((item) => item.id === (form.cardTheme ?? "folhas")) ?? themes[4];
  const age = calculateAge(form.birthDate) ?? patient.age;
  const dateLabel = formattedDate(form.birthDate);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Informe o nome do paciente.");
      return;
    }
    setSaving(true);
    const updated: Patient = {
      ...patient,
      name: form.name.trim(),
      ...(form.birthDate ? { birthDate: form.birthDate } : { birthDate: undefined }),
      ...(form.susCard.trim() ? { susCard: form.susCard.trim() } : { susCard: undefined }),
      ...(form.healthPlan.trim() ? { healthPlan: form.healthPlan.trim() } : { healthPlan: undefined }),
      ...(form.identityNumber.trim() ? { identityNumber: form.identityNumber.trim() } : { identityNumber: undefined }),
      ...(form.cpf.trim() ? { cpf: form.cpf.trim() } : { cpf: undefined }),
      ...(form.photoDataUrl ? { photoDataUrl: form.photoDataUrl } : { photoDataUrl: undefined }),
      cardTheme: form.cardTheme,
      ...(age === null ? {} : { age }),
    };
    onSave(updated);
    setSaving(false);
    setEditing(false);
    setError("");
  };

  const changePhoto = async (file?: File) => {
    if (!file) return;
    setError("");
    try {
      const photoDataUrl = await compressPhoto(file);
      setForm((current) => ({ ...current, photoDataUrl }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível adicionar a foto.");
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center overflow-y-auto bg-black/65 px-1 py-3 backdrop-blur-md sm:px-5 sm:py-5" role="presentation" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="patient-card-title" className="my-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:rounded-[1.75rem]" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-primary sm:text-[10px]">Dose Certa · Identificação do paciente</p>
            <h2 id="patient-card-title" className="truncate font-display text-lg font-semibold text-foreground sm:text-xl">{editing ? "Editar cartão" : "Cartão de " + patient.name}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar cartão" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-5 w-5" /></button>
        </header>

        {editing ? (
          <div className="max-h-[78vh] overflow-y-auto p-3 sm:p-5">
            <form className="mx-auto max-w-3xl space-y-4" onSubmit={save}>
              <div>
                <h3 className="font-display text-lg font-semibold text-foreground">Personalizar informações</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">A edição fica separada da visualização. Todos os campos são opcionais, exceto o nome.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block min-w-0 space-y-1 text-xs font-bold text-foreground sm:col-span-2">
                  Nome no cartão
                  <input className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label className="block min-w-0 space-y-1 text-xs font-bold text-foreground">
                  Data de nascimento
                  <input className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring" type="date" value={form.birthDate} onChange={(event) => setForm((current) => ({ ...current, birthDate: event.target.value }))} />
                </label>
                <label className="block min-w-0 space-y-1 text-xs font-bold text-foreground">
                  Cartão do SUS
                  <input className="w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring" placeholder="Número do CNS" value={form.susCard} onChange={(event) => setForm((current) => ({ ...current, susCard: event.target.value }))} />
                </label>
                <label className="block min-w-0 space-y-1 text-xs font-bold text-foreground">
                  Plano de saúde
                  <input className="w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring" placeholder="Operadora / número" value={form.healthPlan} onChange={(event) => setForm((current) => ({ ...current, healthPlan: event.target.value }))} />
                </label>
                <label className="block min-w-0 space-y-1 text-xs font-bold text-foreground">
                  Identidade (RG)
                  <input className="w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring" value={form.identityNumber} onChange={(event) => setForm((current) => ({ ...current, identityNumber: event.target.value }))} />
                </label>
                <label className="block min-w-0 space-y-1 text-xs font-bold text-foreground">
                  CPF
                  <input className="w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring" inputMode="numeric" value={form.cpf} onChange={(event) => setForm((current) => ({ ...current, cpf: event.target.value }))} />
                </label>
              </div>

              <div className="rounded-2xl border border-border bg-background/60 p-3">
                <p className="mb-2 text-xs font-extrabold text-foreground">Foto do paciente</p>
                <div className="flex items-center gap-3">
                  <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted">
                    {form.photoDataUrl ? <img src={form.photoDataUrl} alt="" className="h-full w-full object-cover" /> : <Camera className="h-6 w-6 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-muted">
                      <ImagePlus className="h-4 w-4" />Adicionar foto
                      <input className="sr-only" type="file" accept="image/*" onChange={(event) => void changePhoto(event.target.files?.[0])} />
                    </label>
                    {form.photoDataUrl && <button type="button" onClick={() => setForm((current) => ({ ...current, photoDataUrl: "" }))} className="ml-2 text-xs font-bold text-destructive hover:underline">Remover foto</button>}
                    <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">A imagem é reduzida antes de ser salva para ocupar menos espaço.</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-extrabold text-foreground">Acabamento metálico</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {themes.map((item) => (
                    <button key={item.id} type="button" aria-pressed={form.cardTheme === item.id} onClick={() => setForm((current) => ({ ...current, cardTheme: item.id }))} className={"flex min-h-11 min-w-0 items-center gap-2 rounded-xl border px-2 py-2 text-left text-xs font-bold transition-colors " + (form.cardTheme === item.id ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/30" : "border-border bg-background text-muted-foreground hover:bg-muted")}>
                      <span className="flex shrink-0 overflow-hidden rounded-lg border border-black/10">
                        {item.swatches.map((color) => <span key={color} className="h-5 w-3" style={{ backgroundColor: color }} />)}
                      </span>
                      <span className="truncate">{item.name}</span>
                      {form.cardTheme === item.id && <CheckCircle2 className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">{error}</p>}
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <button type="submit" disabled={saving} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60">
                  <CheckCircle2 className="h-4 w-4" />Salvar alterações
                </button>
                <button type="button" onClick={() => { setEditing(false); setError(""); }} className="min-h-10 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground hover:bg-muted">Cancelar</button>
              </div>
            </form>
          </div>
        ) : (
          <div className="space-y-3 p-1.5 sm:space-y-4 sm:p-5">
            <div className="dc-patient-card-print mx-auto w-full max-w-[760px]">
              <div className={"dc-patient-card " + theme.className}>
                <CardMotif theme={theme.id} />
                <div className="dc-patient-card-content relative z-10 flex h-full min-h-0 flex-col p-2.5 sm:p-4">
                  <div className="flex min-h-0 items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/80 sm:text-[9px]">Dose Certa <span className="mx-1 text-white/45">/</span> Cartão de cuidado</p>
                      <h3 className="mt-1 line-clamp-2 break-words font-display text-base font-extrabold leading-tight text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.45)] sm:text-2xl">{form.name || patient.name}</h3>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="dc-card-chip" aria-hidden="true"><i /><i /><i /><i /></span>
                        <p className="min-w-0 text-[9px] font-bold leading-tight text-white/90 sm:text-xs">
                          {dateLabel ? "Nasc. " + dateLabel : "Identificação do paciente"}
                          {age !== null ? "  ·  " + age + " anos" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="dc-card-photo grid h-[58px] w-[50px] shrink-0 place-items-center overflow-hidden rounded-lg sm:h-[82px] sm:w-[70px]">
                      {form.photoDataUrl ? (
                        <img src={form.photoDataUrl} alt={"Foto de " + form.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex flex-col items-center gap-0.5 text-center text-white/80">
                          <UserRound className="h-5 w-5 sm:h-7 sm:w-7" />
                          <span className="text-[7px] font-bold uppercase tracking-wider">Sem foto</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-auto grid grid-cols-2 gap-1.5 pt-2 sm:gap-2">
                    <Detail label="Cartão Nacional de Saúde · SUS" value={form.susCard} />
                    <Detail label="Plano de saúde" value={form.healthPlan} />
                    <Detail label="Identidade · RG" value={form.identityNumber} />
                    <Detail label="CPF" value={form.cpf} />
                  </div>
                  <div className="mt-1.5 flex items-end justify-between gap-2 border-t border-white/25 pt-1.5">
                    <span className="text-[7px] font-bold uppercase tracking-[0.13em] text-white/70 sm:text-[8px]">Informações cadastradas pelo cuidador</span>
                    <span className="shrink-0 text-[8px] font-bold tracking-[0.12em] text-white/75">DC · {patient.id.slice(-6).toUpperCase()}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mx-auto flex w-full max-w-[760px] flex-wrap gap-2">
              <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground hover:opacity-90">
                <Pencil className="h-4 w-4" />Editar informações
              </button>
              <button type="button" onClick={() => window.print()} className="min-h-11 rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold text-foreground hover:bg-muted">Imprimir cartão</button>
            </div>
          </div>
        )}

        <footer className="border-t border-border bg-muted/40 px-3 py-2.5 text-[9px] leading-relaxed text-muted-foreground sm:px-5 sm:text-[10px]">
          Este cartão é um resumo informativo preenchido pelo cuidador. Não substitui documentos oficiais ou avaliação profissional. Como pode conter CPF e dados de saúde, use somente informações necessárias. A cópia offline fica no armazenamento deste navegador; evite aparelhos compartilhados e proteja sua sessão.
        </footer>
      </section>
    </div>,
    document.body,
  );
}
