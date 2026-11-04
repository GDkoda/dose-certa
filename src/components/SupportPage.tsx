import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import {
  Activity, ArrowRight, BellRing, BookOpen, CheckCircle2, ChevronDown, CircleHelp,
  Clock3, FileImage, FileText, Headphones, LifeBuoy, MessageCircle, Paperclip,
  Plus, Search, Send, Settings2, ShieldCheck, Smartphone, Wifi, X,
} from "lucide-react";
import { TicketManagement } from "@/components/TicketManagement";
import { setState, uid, useStore, type Ticket, type TicketAttachment, type User } from "@/lib/store";

const field = "min-h-11 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";
const primaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";
const quietButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted";
const statusLabel: Record<Ticket["status"], string> = { aberto: "Aguardando equipe", respondido: "Resposta recebida", fechado: "Encerrado" };
const statusTone: Record<Ticket["status"], string> = {
  aberto: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  respondido: "bg-primary/10 text-primary",
  fechado: "bg-muted text-muted-foreground",
};

type Diagnostic = { label: string; detail: string; ok: boolean; icon: typeof Wifi };
const faqItems: { category: string; question: string; answer: string; keywords: string }[] = [
  { category: "Medicamentos", question: "Como cadastrar um medicamento?", answer: "Acesse Medicamentos, escolha Adicionar medicamento e informe o nome, a dosagem, os horários e a quantidade disponível. Confira os horários antes de salvar.", keywords: "cadastro dose remédio remedio estoque" },
  { category: "Alarmes", question: "O alarme não apareceu. O que fazer?", answer: "Confira se as notificações estão permitidas, se o aparelho está conectado e se o Dose Certa está instalado. No Perfil, use o teste de notificações e verifique as configurações do aparelho.", keywords: "alarme notificação notificacao push celular" },
  { category: "Alarmes", question: "O aviso funciona com o aplicativo fechado?", answer: "Os avisos em segundo plano dependem do serviço de notificações, da instalação do aplicativo e das permissões do sistema. A entrega também pode ser limitada pela economia de bateria ou pelas regras do aparelho.", keywords: "segundo plano fechado bateria pwa" },
  { category: "Pacientes", question: "Como acompanhar outro paciente?", answer: "Na área Pacientes, use Selecionar para definir quem será exibido. Os medicamentos, o histórico e a rotina passam a considerar o paciente escolhido.", keywords: "paciente trocar selecionar cuidador" },
  { category: "Rotina", question: "Como organizar alimentação e hidratação?", answer: "Abra Pacientes e entre em Rotina. Crie atividades com horário e repetição. Ao registrar hidratação ou alimentação, informe o que foi oferecido e o que foi aceito.", keywords: "água agua comida refeição alimentacao rotina" },
  { category: "Conta", question: "Esqueci minha senha. Como recuperar?", answer: "Use a opção de recuperação na tela de acesso. Caso não consiga entrar, abra um chamado informando o nome de usuário. Nunca envie sua senha pelo atendimento.", keywords: "senha acesso login conta" },
  { category: "Atendimento", question: "Como acompanho uma resposta?", answer: "Abra o chamado na seção Meus atendimentos. A conversa, a situação e as respostas da equipe ficam reunidas no mesmo cartão.", keywords: "chamado suporte resposta conversa" },
];

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Arquivo inválido."));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

export function SupportPage({ me, onOpenProfile, onOpenPatients, onOpenRoutine }: {
  me: User; onOpenProfile: () => void; onOpenPatients: () => void; onOpenRoutine: () => void;
}) {
  const tickets = useStore((state) => state.tickets);
  const users = useStore((state) => state.users);
  const mine = me.role === "cuidador" ? tickets.filter((ticket) => ticket.userId === me.id) : tickets;
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("Dúvida");
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [openTicket, setOpenTicket] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [faqSearch, setFaqSearch] = useState("");
  const [faqCategory, setFaqCategory] = useState("Todas");
  const [statusFilter, setStatusFilter] = useState<"todos" | "aberto" | "respondido" | "fechado">("todos");
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [checking, setChecking] = useState(false);

  const openCount = mine.filter((ticket) => ticket.status === "aberto").length;
  const answeredCount = mine.filter((ticket) => ticket.status === "respondido").length;
  const closedCount = mine.filter((ticket) => ticket.status === "fechado").length;
  const visibleTickets = mine.filter((ticket) => statusFilter === "todos" || ticket.status === statusFilter);
  const faqCategories = ["Todas", ...Array.from(new Set(faqItems.map((item) => item.category)))];
  const filteredFaq = faqItems.filter((item) => (faqCategory === "Todas" || item.category === faqCategory)
    && (item.question + " " + item.answer + " " + item.keywords).toLocaleLowerCase("pt-BR").includes(faqSearch.toLocaleLowerCase("pt-BR")));

  const refreshDiagnostics = useCallback(async () => {
    if (typeof window === "undefined") return;
    setChecking(true);
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
    setChecking(false);
  }, []);

  useEffect(() => { void refreshDiagnostics(); }, [refreshDiagnostics]);

  const addAttachments = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setAttachmentError("");
    if (attachments.length + files.length > 3) return setAttachmentError("Anexe no máximo 3 arquivos por chamado.");
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    try {
      const next: TicketAttachment[] = [];
      for (const file of files) {
        if (!allowed.includes(file.type)) throw new Error("Use imagens JPG, PNG, WEBP ou documentos PDF.");
        if (file.size > 250_000) throw new Error("Cada arquivo deve ter até 250 KB para manter o chamado leve.");
        next.push({ name: file.name, type: file.type, dataUrl: await fileToDataUrl(file) });
      }
      const combined = [...attachments, ...next];
      if (combined.reduce((total, file) => total + file.dataUrl.length, 0) > 1_000_000) {
        setAttachmentError("O tamanho total dos anexos ultrapassa o limite de 1 MB.");
        return;
      }
      setAttachments(combined);
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Não foi possível anexar o arquivo.");
    }
  };

  const createTicket = (event: FormEvent) => {
    event.preventDefault();
    if (!subject.trim() || !message.trim()) return setFormError("Preencha o assunto e descreva como podemos ajudar.");
    const ticket: Ticket = {
      id: uid(), userId: me.id, subject: subject.trim(), category, status: "aberto",
      messages: [{ from: me.login, text: message.trim(), at: new Date().toISOString(), ...(attachments.length ? { attachments } : {}) }],
    };
    setState((state) => ({ ...state, tickets: [ticket, ...state.tickets] }));
    setSubject("");
    setMessage("");
    setAttachments([]);
    setFormError("");
    setSuccess("Chamado enviado. Você pode acompanhar a resposta nesta página.");
    setFormOpen(false);
    setStatusFilter("todos");
    setOpenTicket(ticket.id);
  };

  const statusCounts = [
    { label: "Abertos", count: openCount, tone: "text-amber-700 dark:text-amber-300", icon: Clock3 },
    { label: "Respondidos", count: answeredCount, tone: "text-primary", icon: MessageCircle },
    { label: "Encerrados", count: closedCount, tone: "text-muted-foreground", icon: CheckCircle2 },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="relative overflow-hidden rounded-[2rem] border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-primary/5 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Headphones className="h-6 w-6" /></span>
            <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-primary">Estamos aqui para ajudar</p><h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">Central de Atendimento</h1><p className="mt-1 text-xs text-muted-foreground sm:text-sm">Ajuda rápida, diagnóstico e acompanhamento em um só lugar.</p></div>
          </div>
          {me.role === "cuidador" && <button type="button" className={primaryButton} onClick={() => setFormOpen((value) => !value)}><Plus className="h-4 w-4" />Abrir chamado</button>}
        </div>
        <div className="relative mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          {statusCounts.map((item) => <div key={item.label} className="rounded-2xl border border-border/70 bg-background/75 p-3 sm:p-3.5"><div className="flex items-center gap-1.5"><item.icon className={"h-3.5 w-3.5 " + item.tone} /><span className="text-[10px] font-semibold text-muted-foreground sm:text-xs">{item.label}</span></div><p className={"mt-1 font-display text-2xl font-bold tabular-nums " + item.tone}>{item.count}</p></div>)}
        </div>
      </header>

      {success && <div role="status" className="flex items-start justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-foreground"><span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />{success}</span><button type="button" onClick={() => setSuccess("")} aria-label="Fechar aviso"><X className="h-4 w-4" /></button></div>}

      {formOpen && me.role === "cuidador" && (
        <form onSubmit={createTicket} className="space-y-4 rounded-[1.7rem] border border-primary/25 bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-display text-lg font-bold text-foreground">Novo atendimento</h2><p className="text-xs text-muted-foreground">Descreva o que aconteceu. Nossa equipe responderá por aqui.</p></div><button type="button" onClick={() => setFormOpen(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted" aria-label="Fechar formulário"><X className="h-4 w-4" /></button></div>
          <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
            <label className="space-y-1.5 text-xs font-bold text-foreground">Tipo de solicitação<select className={field} value={category} onChange={(event) => setCategory(event.target.value)}><option>Dúvida</option><option>Problema técnico</option><option>Sugestão</option><option>Outro assunto</option></select></label>
            <label className="space-y-1.5 text-xs font-bold text-foreground">Assunto<input id="support-subject" required maxLength={100} className={field} placeholder="Ex.: notificações não estão chegando" value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
          </div>
          <label className="block space-y-1.5 text-xs font-bold text-foreground">Mensagem<textarea required maxLength={2000} rows={4} className={field + " min-h-24 resize-y"} placeholder="Conte o que aconteceu, em qual aparelho e quando começou..." value={message} onChange={(event) => setMessage(event.target.value)} /></label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1"><label className={quietButton + " min-h-9 cursor-pointer text-xs"}><Paperclip className="h-4 w-4" />Anexar imagem ou PDF<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={(event) => void addAttachments(event)} /></label><p className="text-[10px] text-muted-foreground">Até 3 arquivos · 250 KB cada · 1 MB no total. Não envie senhas ou documentos pessoais.</p></div>
            <button type="submit" className={primaryButton}><Send className="h-4 w-4" />Enviar chamado</button>
          </div>
          {attachments.length > 0 && <div className="flex flex-wrap gap-2">{attachments.map((file, index) => <span key={file.name + index} className="inline-flex max-w-full items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs text-foreground"><FileImage className="h-4 w-4 shrink-0 text-primary" /><span className="max-w-48 truncate">{file.name}</span><button type="button" onClick={() => setAttachments((current) => current.filter((_, position) => position !== index))} aria-label={"Remover " + file.name}><X className="h-3.5 w-3.5" /></button></span>)}</div>}
          {attachmentError && <p role="alert" className="text-xs font-semibold text-destructive">{attachmentError}</p>}
          {formError && <p role="alert" className="text-xs font-semibold text-destructive">{formError}</p>}
        </form>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.85fr)]">
        <section className="min-w-0 space-y-4">
          <div className="rounded-[1.7rem] border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><Search className="h-4 w-4" /></span><h2 className="font-display text-lg font-bold text-foreground">Encontre uma resposta</h2></div><p className="mt-1 text-xs text-muted-foreground">Pesquise por assunto ou escolha uma categoria.</p></div><span className="rounded-full bg-muted px-3 py-1 text-[10px] font-bold text-muted-foreground">{filteredFaq.length} artigos</span></div>
            <div className="relative mt-4"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input aria-label="Buscar na central de ajuda" className={field + " pl-9"} placeholder="Ex.: alarme, senha, paciente..." value={faqSearch} onChange={(event) => setFaqSearch(event.target.value)} /></div>
            <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">{faqCategories.map((item) => <button type="button" key={item} onClick={() => setFaqCategory(item)} className={"shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition " + (faqCategory === item ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>{item}</button>)}</div>
            <div className="mt-2 divide-y divide-border/70">
              {filteredFaq.map((item) => <details key={item.question} className="group py-3 first:pt-2">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden"><span className="min-w-0">{item.question}<span className="ml-2 block text-[10px] font-semibold text-primary sm:inline">{item.category}</span></span><ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition group-open:rotate-180" /></summary>
                <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">{item.answer}</p>
              </details>)}
              {filteredFaq.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Nenhum resultado. Tente outra palavra ou abra um chamado.</p>}
            </div>
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-display text-xl font-bold text-foreground">{me.role === "cuidador" ? "Meus atendimentos" : "Fila de atendimento"}</h2><p className="text-xs text-muted-foreground">Converse com a equipe e acompanhe cada solicitação.</p></div><div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">{(["todos", "aberto", "respondido", "fechado"] as const).map((status) => <button key={status} type="button" onClick={() => setStatusFilter(status)} className={"rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition " + (statusFilter === status ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{status === "todos" ? "Todos" : status === "fechado" ? "Encerrados" : status === "respondido" ? "Respondidos" : "Abertos"}</button>)}</div></div>
            {visibleTickets.length === 0 ? <div className="rounded-[1.7rem] border border-dashed border-border bg-card px-5 py-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"><LifeBuoy className="h-6 w-6" /></span><p className="mt-3 font-display text-lg font-bold text-foreground">Tudo tranquilo por aqui</p><p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{mine.length ? "Não há chamados neste filtro." : "Quando precisar de ajuda, abra um chamado e acompanhe a conversa nesta página."}</p>{me.role === "cuidador" && <button type="button" className={primaryButton + " mt-4"} onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" />Abrir primeiro chamado</button>}</div>
              : visibleTickets.map((ticket) => <article key={ticket.id} className="overflow-hidden rounded-[1.5rem] border border-border bg-card shadow-sm">
                <div className="flex items-center gap-2 p-3.5 sm:p-4"><button type="button" onClick={() => setOpenTicket(openTicket === ticket.id ? null : ticket.id)} className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"><span className="min-w-0"><span className="block truncate text-sm font-bold text-foreground">{ticket.subject}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground">{me.role !== "cuidador" ? users.find((user) => user.id === ticket.userId)?.login : ticket.category || "Solicitação"} · {ticket.messages.length} mensagem(ns)</span></span><span className={"shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold " + statusTone[ticket.status]}>{statusLabel[ticket.status]}</span></button><TicketManagement ticket={ticket} me={me} /></div>
                {openTicket === ticket.id && <div className="space-y-3 border-t border-border/70 bg-muted/15 p-3.5 sm:p-4">
                  <div className="max-h-80 space-y-3 overflow-y-auto">{ticket.messages.map((entry, index) => <div key={index} className="max-w-[96%] rounded-2xl border border-border/70 bg-card p-3"><div className="mb-1 flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] font-extrabold text-foreground">{entry.from}</p><p className="text-[10px] text-muted-foreground">{new Date(entry.at).toLocaleString("pt-BR")}</p></div><p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{entry.text}</p>{entry.attachments?.length ? <div className="mt-3 flex flex-wrap gap-2">{entry.attachments.map((file) => <a key={file.name} href={file.dataUrl} download={file.name} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted/60 px-3 py-2 text-[11px] font-semibold text-foreground hover:bg-muted">{file.type === "application/pdf" ? <FileText className="h-4 w-4 text-primary" /> : <FileImage className="h-4 w-4 text-primary" />}<span className="max-w-40 truncate">{file.name}</span></a>)}</div> : null}</div>)}</div>
                  {ticket.status !== "fechado" && <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); if (!reply.trim()) return; setState((state) => ({ ...state, tickets: state.tickets.map((item) => item.id === ticket.id ? { ...item, status: me.role === "cuidador" ? "aberto" : "respondido", messages: [...item.messages, { from: me.login + " (" + me.role + ")", text: reply.trim(), at: new Date().toISOString() }] } : item) })); setReply(""); }}><textarea aria-label="Responder atendimento" rows={1} className={field + " min-h-10 flex-1 resize-y"} placeholder="Escreva uma resposta..." value={reply} onChange={(event) => setReply(event.target.value)} /><button className={primaryButton + " min-h-10 px-3"} aria-label="Enviar resposta"><Send className="h-4 w-4" /></button></form>}
                  {me.role !== "cuidador" && ticket.status !== "fechado" && <button type="button" className="text-[11px] font-bold text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => setState((state) => ({ ...state, tickets: state.tickets.map((item) => item.id === ticket.id ? { ...item, status: "fechado" } : item) }))}>Encerrar solicitação</button>}
                </div>}
              </article>)}
          </section>
        </section>

        <aside className="space-y-4">
          <section className="rounded-[1.7rem] border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><Activity className="h-4 w-4" /></span><div><h2 className="font-display text-lg font-bold text-foreground">Diagnóstico rápido</h2><p className="text-[10px] text-muted-foreground">Verifique este aparelho</p></div></div><button type="button" title="Executar diagnóstico" aria-label="Executar diagnóstico novamente" onClick={() => void refreshDiagnostics()} disabled={checking} className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted disabled:opacity-50"><Activity className={"h-4 w-4 " + (checking ? "animate-pulse" : "")} /></button></div>
            <div className="mt-4 space-y-3">{diagnostics.map((item) => <div key={item.label} className="flex items-start gap-2.5"><span className={"mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg " + (item.ok ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-700 dark:text-amber-300")}><item.icon className="h-3.5 w-3.5" /></span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-foreground">{item.label}</p><p className="text-[10px] leading-relaxed text-muted-foreground">{item.detail}</p></div><span className={"mt-1 h-2 w-2 shrink-0 rounded-full " + (item.ok ? "bg-primary" : "bg-amber-500")} /></div>)}</div>
            <button type="button" className={quietButton + " mt-4 w-full"} onClick={onOpenProfile}><Settings2 className="h-4 w-4" />Abrir configurações do aparelho</button>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">O diagnóstico é informativo. Permissões de bateria, som e execução em segundo plano podem depender do fabricante do aparelho.</p>
          </section>

          <section className="rounded-[1.7rem] border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /><h2 className="font-display text-lg font-bold text-foreground">Guias rápidos</h2></div>
            <p className="mt-1 text-xs text-muted-foreground">Atalhos para as tarefas mais comuns.</p>
            <div className="mt-3 space-y-2">
              <button type="button" onClick={onOpenProfile} className="group flex w-full items-center gap-3 rounded-2xl border border-border/70 p-3 text-left transition hover:border-primary/30 hover:bg-primary/[0.035]"><span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-300"><BellRing className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-bold text-foreground">Ativar notificações</span><span className="block text-[10px] text-muted-foreground">Permissões e teste de alertas</span></span><ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" /></button>
              <button type="button" onClick={onOpenPatients} className="group flex w-full items-center gap-3 rounded-2xl border border-border/70 p-3 text-left transition hover:border-primary/30 hover:bg-primary/[0.035]"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><Smartphone className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-bold text-foreground">Organizar pacientes</span><span className="block text-[10px] text-muted-foreground">Cadastro, cartão e seleção</span></span><ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" /></button>
              <button type="button" onClick={onOpenRoutine} className="group flex w-full items-center gap-3 rounded-2xl border border-border/70 p-3 text-left transition hover:border-primary/30 hover:bg-primary/[0.035]"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"><CalendarIcon /></span><span className="min-w-0 flex-1"><span className="block text-xs font-bold text-foreground">Montar rotina visual</span><span className="block text-[10px] text-muted-foreground">Alimentação, água e atividades</span></span><ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" /></button>
            </div>
          </section>

          <section className="rounded-[1.7rem] border border-primary/20 bg-primary/[0.045] p-4 sm:p-5">
            <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><CircleHelp className="h-5 w-5" /></span><div><h2 className="font-display text-lg font-bold text-foreground">Ainda precisa de ajuda?</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Envie uma dúvida, relate um problema ou compartilhe uma sugestão para melhorar o Dose Certa.</p></div></div>
            {me.role === "cuidador" && <button type="button" className={primaryButton + " mt-4 w-full"} onClick={() => { setFormOpen(true); window.setTimeout(() => document.querySelector("#support-subject")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); }}><Plus className="h-4 w-4" />Falar com a equipe</button>}
          </section>
        </aside>
      </div>
    </div>
  );
}

function CalendarIcon() {
  return <span className="text-lg leading-none">▦</span>;
}
