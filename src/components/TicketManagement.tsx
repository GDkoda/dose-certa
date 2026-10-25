import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { flushCloudWrites } from "@/lib/cloud-store";
import { setState, type Ticket, type User } from "@/lib/store";

export function TicketManagement({ ticket, me }: { ticket: Ticket; me: User }) {
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  const [draft, setDraft] = useState(ticket);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (me.role !== "mestre") return null;
  const field = "w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

  async function save() {
    if (busy || me.role !== "mestre") return;
    if (mode === "edit" && (!draft.subject.trim() || draft.messages.some((message) => !message.text.trim()))) {
      setError("Preencha o assunto e todas as mensagens."); return;
    }
    setBusy(true); setError("");
    try {
      // Cloud writes use the authenticated client; existing RLS validates Master access.
      setState((state) => ({ ...state, tickets: mode === "delete"
        ? state.tickets.filter((item) => item.id !== ticket.id)
        : state.tickets.map((item) => item.id === ticket.id ? { ...item, subject: draft.subject.trim(), status: draft.status,
          messages: item.messages.map((message, index) => ({ ...message, text: draft.messages[index]?.text.trim() ?? message.text })) } : item) }));
      await flushCloudWrites(); setMode(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o chamado."); }
    finally { setBusy(false); }
  }

  return <>
    <div className="flex shrink-0 gap-1">
      <Button variant="ghost" size="icon" aria-label="Editar chamado" title="Editar chamado" onClick={() => { setDraft({ ...ticket, messages: ticket.messages.map((message) => ({ ...message })) }); setError(""); setMode("edit"); }}><Pencil /></Button>
      <Button variant="ghost" size="icon" className="text-destructive" aria-label="Excluir chamado" title="Excluir chamado" onClick={() => { setError(""); setMode("delete"); }}><Trash2 /></Button>
    </div>
    <Dialog open={mode !== null} onOpenChange={(value) => { if (!value && !busy) setMode(null); }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{mode === "delete" ? "Excluir chamado?" : "Editar chamado"}</DialogTitle>
          <DialogDescription>{mode === "delete" ? `O chamado “${ticket.subject}” e todas as suas mensagens serão excluídos permanentemente.` : "Atualize o assunto, a situação e as mensagens do chamado."}</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          {mode === "edit" && <>
            <label className="block space-y-1 text-sm text-foreground"><span>Assunto</span><input required className={field} value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} disabled={busy} /></label>
            <label className="block space-y-1 text-sm text-foreground"><span>Situação</span><select className={field} value={draft.status} onChange={(event) => { const status = event.target.value; if (status === "aberto" || status === "respondido" || status === "fechado") setDraft({ ...draft, status }); }} disabled={busy}><option value="aberto">Aberto</option><option value="respondido">Respondido</option><option value="fechado">Fechado</option></select></label>
            {draft.messages.map((message, index) => <label key={index} className="block space-y-1 text-sm text-foreground"><span>Mensagem {index + 1} · {message.from}</span><textarea required rows={3} className={field} value={message.text} disabled={busy} onChange={(event) => setDraft({ ...draft, messages: draft.messages.map((item, position) => position === index ? { ...item, text: event.target.value } : item) })} /></label>)}
          </>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setMode(null)}>Cancelar</Button><Button type="submit" variant={mode === "delete" ? "destructive" : "default"} disabled={busy}>{busy ? "Salvando..." : mode === "delete" ? "Excluir definitivamente" : "Salvar alterações"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}