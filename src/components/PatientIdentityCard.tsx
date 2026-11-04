import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, CheckCircle2, ImagePlus, Pencil, UserRound, X } from "lucide-react";
import type { Patient, PatientCardTheme } from "@/lib/store";

const themes: { id: PatientCardTheme; name: string; className: string; swatches: string[] }[] = [
  { id: "rosas", name: "Pétalas rubras", className: "dc-patient-card--rosas", swatches: ["#951d2c", "#171116"] },
  { id: "coracoes", name: "Corações", className: "dc-patient-card--coracoes", swatches: ["#f4bfd0", "#a44365"] },
  { id: "praia", name: "Sol e praia", className: "dc-patient-card--praia", swatches: ["#ed8b36", "#f6d49b"] },
  { id: "girassol", name: "Girassol", className: "dc-patient-card--girassol", swatches: ["#f1c84a", "#5a3b1c"] },
  { id: "folhas", name: "Folhas", className: "dc-patient-card--folhas", swatches: ["#356c50", "#f3f6ed"] },
  { id: "ondas", name: "Ondas", className: "dc-patient-card--ondas", swatches: ["#a9d9ed", "#165b85"] },
  { id: "lavanda", name: "Lavanda antiga", className: "dc-patient-card--lavanda", swatches: ["#eeebf5", "#8f7aa8"] },
  { id: "xadrez", name: "Xadrez", className: "dc-patient-card--xadrez", swatches: ["#ffffff", "#171717"] },
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
    <svg aria-hidden="true" viewBox="0 0 600 360" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 h-full w-full">
      <defs>
        <pattern id={patternId} width="150" height="120" patternUnits="userSpaceOnUse">
          {theme === "rosas" && (
            <g fill="currentColor" stroke="currentColor" strokeWidth="1.2" opacity=".8">
              <path d="M43 28C20 5 12 34 43 54 74 34 66 5 43 28Z" />
              <path d="M43 28C20 5 12 34 43 54 74 34 66 5 43 28Z" transform="rotate(72 43 42)" />
              <path d="M43 28C20 5 12 34 43 54 74 34 66 5 43 28Z" transform="rotate(144 43 42)" />
              <path d="M43 28C20 5 12 34 43 54 74 34 66 5 43 28Z" transform="rotate(216 43 42)" />
              <path d="M43 28C20 5 12 34 43 54 74 34 66 5 43 28Z" transform="rotate(288 43 42)" />
              <circle cx="43" cy="42" r="7" />
            </g>
          )}
          {theme === "coracoes" && <path d="M44 28C23 7 2 37 44 66 86 37 65 7 44 28Z" fill="currentColor" opacity=".65" />}
          {theme === "praia" && (
            <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".75">
              <circle cx="42" cy="37" r="19" />
              <path d="M7 77Q25 62 43 77T79 77M-8 93Q12 78 32 93T72 93" />
              <path d="M42 7V1M42 73v-5M12 37H5M79 37h-7M21 16l-5-5M64 64l-5-5" />
            </g>
          )}
          {theme === "girassol" && (
            <g fill="currentColor" opacity=".72">
              {Array.from({ length: 12 }, (_, index) => <ellipse key={index} cx="44" cy="23" rx="8" ry="17" transform={"rotate(" + index * 30 + " 44 47)"} />)}
              <circle cx="44" cy="47" r="14" />
            </g>
          )}
          {theme === "folhas" && (
            <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".7">
              <path d="M12 92Q49 57 80 12M27 77Q6 48 24 39Q44 40 27 77ZM48 54Q37 29 57 22Q74 32 48 54ZM62 34Q63 12 85 12Q91 31 62 34Z" />
            </g>
          )}
          {theme === "ondas" && (
            <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".72">
              <path d="M-10 36Q8 19 26 36T62 36T98 36T134 36T170 36M-10 59Q8 42 26 59T62 59T98 59T134 59T170 59M-10 82Q8 65 26 82T62 82T98 82T134 82T170 82" />
            </g>
          )}
          {theme === "lavanda" && (
            <g fill="currentColor" stroke="currentColor" strokeWidth="1.5" opacity=".78">
              <path d="M42 102Q53 68 43 19M43 38Q17 34 24 19Q38 14 43 38ZM46 53Q72 48 66 32Q51 28 46 53ZM40 68Q14 64 19 49Q33 45 40 68ZM47 82Q70 78 65 63Q52 59 47 82Z" fill="none" strokeWidth="3" />
              <ellipse cx="24" cy="19" rx="6" ry="9" />
              <ellipse cx="66" cy="32" rx="6" ry="9" />
              <ellipse cx="19" cy="49" rx="6" ry="9" />
              <ellipse cx="65" cy="63" rx="6" ry="9" />
            </g>
          )}
          {theme === "xadrez" && (
            <g>
              <rect x="0" y="0" width="75" height="60" fill="currentColor" opacity=".75" />
              <rect x="75" y="60" width="75" height="60" fill="currentColor" opacity=".75" />
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
  return (
    <div className="min-w-0 border-b border-current/15 pb-1.5">
      <p className="text-[9px] font-extrabold uppercase tracking-[0.15em] opacity-70">{label}</p>
      <p className="mt-0.5 min-h-4 break-words text-xs font-bold leading-snug sm:text-sm">{value ?? ""}</p>
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
    <div className="fixed inset-0 z-[130] flex items-center justify-center overflow-y-auto bg-black/60 px-3 py-5 backdrop-blur-sm sm:px-5" role="presentation" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="patient-card-title" className="my-auto w-full max-w-4xl overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary">Dose Certa · Informações do paciente</p>
            <h2 id="patient-card-title" className="truncate font-display text-xl font-semibold text-foreground">Cartão de {patient.name}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar cartão" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-5 w-5" /></button>
        </header>

        <div className="grid gap-4 p-3 sm:p-5 lg:grid-cols-[1.1fr_.9fr]">
          <div className="min-w-0 dc-patient-card-print">
            <div className={"dc-patient-card " + theme.className}>
              <CardMotif theme={theme.id} />
              <div className="relative z-10 flex h-full min-h-[285px] flex-col p-4 sm:min-h-[340px] sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] opacity-75">Dose Certa · Cartão de cuidado</p>
                    <h3 className="mt-1 break-words font-display text-xl font-bold leading-tight sm:text-2xl">{form.name || patient.name}</h3>
                    <p className="mt-1 text-[11px] font-semibold opacity-80">{dateLabel ? "Nascimento: " + dateLabel : "Informações pessoais"}</p>
                    {age !== null && <p className="text-[11px] font-semibold opacity-80">{age} anos</p>}
                  </div>
                  <div className="grid h-[86px] w-[76px] shrink-0 place-items-center overflow-hidden rounded-xl border border-current/20 bg-black/10 sm:h-[104px] sm:w-[92px]">
                    {form.photoDataUrl ? (
                      <img src={form.photoDataUrl} alt={"Foto de " + form.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-center opacity-65">
                        <UserRound className="h-8 w-8" />
                        <span className="text-[8px] font-bold uppercase tracking-wider">Sem foto</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-x-4 gap-y-3 pt-4">
                  <Detail label="Cartão Nacional de Saúde · SUS" value={form.susCard} />
                  <Detail label="Plano de saúde" value={form.healthPlan} />
                  <Detail label="Identidade · RG" value={form.identityNumber} />
                  <Detail label="CPF" value={form.cpf} />
                </div>
                <div className="mt-3 flex items-end justify-between gap-3 border-t border-current/20 pt-2">
                  <span className="text-[8px] font-extrabold uppercase tracking-[0.18em] opacity-70">Informações cadastradas pelo cuidador</span>
                  <span className="text-[9px] font-bold opacity-70">ID {patient.id.slice(-6).toUpperCase()}</span>
                </div>
              </div>
            </div>

            {!editing && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground hover:opacity-90">
                  <Pencil className="h-4 w-4" />Editar informações
                </button>
                <button type="button" onClick={() => window.print()} className="min-h-10 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground hover:bg-muted">Imprimir</button>
              </div>
            )}
          </div>

          {editing ? (
            <form className="min-w-0 space-y-3" onSubmit={save}>
              <div>
                <h3 className="font-display text-lg font-semibold text-foreground">Personalizar cartão</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Todos os campos são opcionais, exceto o nome. Você pode voltar e completar depois.</p>
              </div>

              <label className="block space-y-1 text-xs font-bold text-foreground">
                Nome no cartão
                <input className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="block space-y-1 text-xs font-bold text-foreground">
                Data de nascimento
                <input className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring" type="date" value={form.birthDate} onChange={(event) => setForm((current) => ({ ...current, birthDate: event.target.value }))} />
              </label>

              <div className="grid grid-cols-2 gap-2">
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
                <p className="mb-2 text-xs font-extrabold text-foreground">Tema visual</p>
                <div className="grid grid-cols-2 gap-2">
                  {themes.map((item) => (
                    <button key={item.id} type="button" aria-pressed={form.cardTheme === item.id} onClick={() => setForm((current) => ({ ...current, cardTheme: item.id }))} className={"flex min-w-0 items-center gap-2 rounded-xl border p-2 text-left text-xs font-bold transition " + (form.cardTheme === item.id ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/25" : "border-border bg-card text-muted-foreground hover:bg-muted")}>
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
                  <CheckCircle2 className="h-4 w-4" />Salvar cartão
                </button>
                <button type="button" onClick={() => { setEditing(false); setError(""); }} className="min-h-10 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground hover:bg-muted">Cancelar</button>
              </div>
            </form>
          ) : (
            <aside className="flex min-w-0 flex-col justify-center rounded-2xl border border-border bg-background/60 p-4">
              <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-primary">Acesso rápido</p>
              <h3 className="mt-2 font-display text-lg font-semibold text-foreground">Dados para identificação</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Este cartão reúne informações úteis para consultas, atendimentos e situações em que seja necessário identificar o paciente.</p>
              <div className="mt-4 space-y-2 text-xs leading-relaxed text-muted-foreground">
                <p>• Os campos não preenchidos permanecem vazios.</p>
                <p>• Você pode alterar foto, dados e tema quando precisar.</p>
                <p>• As informações são salvas junto ao cadastro do paciente.</p>
              </div>
              <button type="button" onClick={() => setEditing(true)} className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-bold text-primary hover:bg-primary/10">
                <Pencil className="h-4 w-4" />Personalizar cartão
              </button>
            </aside>
          )}
        </div>
        <footer className="border-t border-border bg-muted/40 px-4 py-2.5 text-[10px] leading-relaxed text-muted-foreground sm:px-5">
          Este cartão é um resumo informativo preenchido pelo cuidador. Não substitui documentos oficiais ou avaliação profissional. Como pode conter CPF e dados de saúde, use somente informações necessárias e evite abrir o cartão em aparelhos compartilhados.
        </footer>
      </section>
    </div>,
    document.body,
  );
}
