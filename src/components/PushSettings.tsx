import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { registerPushDevice, sendTestPush } from "@/lib/push.functions";
import { enablePush } from "@/lib/push-browser";

export function PushSettings() {
  const register = useServerFn(registerPushDevice);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const test = useServerFn(sendTestPush);
  const [testing, setTesting] = useState(false);
  return <section className="space-y-3">
    <h2 className="font-display text-lg text-foreground">Avisos no telefone</h2>
    <Button disabled={busy} onClick={async () => {
      setBusy(true); setMessage("");
      try {
        const result = await enablePush();
        if (result.status === "registered") {
          await register({ data: { token: result.token, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
          sessionStorage.setItem("dc-push-token", result.token);
          setMessage("Este aparelho foi registrado para receber avisos. A entrega depende da configuração do serviço de envio e das permissões do sistema; mantenha um alarme de segurança.");
        } else setMessage({ "not-configured": "A conexão de avisos ainda precisa ser configurada com Include web push.", "unsupported": "Este navegador não aceita avisos em segundo plano. No iPhone, use o Safari e adicione o site à Tela de Início antes de ativar.", "open-in-new-tab": "Abra o Dose Certa em uma aba própria para permitir os avisos.", "denied": "Os avisos estão bloqueados. Libere as notificações nas configurações deste site no navegador." }[result.status]);
      } catch { setMessage("Não foi possível ativar os avisos. Confira sua conexão e tente novamente."); }
      finally { setBusy(false); }
    }}><Bell />{busy ? "Ativando..." : "Ativar avisos neste aparelho"}</Button>
    <Button variant="outline" disabled={testing} onClick={async () => {
      setTesting(true); setMessage("Enviando teste... feche ou minimize o app agora.");
      try {
        const r = await test();
        setMessage(r.devices === 0 ? "Nenhum aparelho registrado. Ative os avisos primeiro." : r.sent > 0 ? `Teste enviado para ${r.sent} aparelho(s). Deve aparecer em instantes.` : "O envio falhou. Ative os avisos novamente neste aparelho.");
      } catch { setMessage("Não foi possível enviar o teste."); }
      finally { setTesting(false); }
    }}>{testing ? "Enviando..." : "Disparar teste de alarme no meu celular"}</Button>
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
  </section>;
}
/** Gentle banner on the home screen when this phone is not yet receiving alarms. */
export function PushBanner() {
  const register = useServerFn(registerPushDevice);
  const [state, setState] = useState<"hidden" | "show" | "done">("hidden");
  const [note, setNote] = useState("");
  useEffect(() => {
    const granted = "Notification" in window && Notification.permission === "granted";
    setState(granted && sessionStorage.getItem("dc-push-token") ? "hidden" : "show");
  }, []);
  if (state === "hidden") return null;
  const inFrame = typeof window !== "undefined" && window.top !== window.self;
  return <section className="flex flex-col gap-3 rounded-[1.5rem] border border-secondary/40 bg-secondary/10 p-5 sm:flex-row sm:items-center">
    <Bell className="h-6 w-6 shrink-0 text-secondary" />
    <div className="flex-1">
      <p className="font-display text-lg text-foreground">{state === "done" ? "Tudo pronto! Os alarmes chegarão neste aparelho." : "Receba os alarmes mesmo com o celular bloqueado"}</p>
      <p className="text-sm text-muted-foreground">{note || (inFrame ? "Abra o Dose Certa em uma aba própria do navegador para ativar." : "No iPhone, adicione o app à Tela de Início (Compartilhar → Adicionar à Tela de Início) e abra por lá antes de ativar.")}</p>
    </div>
    {state === "show" && <Button onClick={async () => {
      try {
        const r = await enablePush();
        if (r.status === "registered") {
          await register({ data: { token: r.token, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
          sessionStorage.setItem("dc-push-token", r.token); setState("done"); setNote("Use Perfil → Disparar teste para conferir.");
        } else setNote({ "not-configured": "O serviço de avisos ainda não está configurado.", unsupported: "Este navegador não aceita avisos em segundo plano. No iPhone, abra pelo ícone da Tela de Início.", "open-in-new-tab": "Abra o Dose Certa em uma aba própria do navegador.", denied: "Os avisos estão bloqueados. Libere nas configurações do site no navegador." }[r.status]);
      } catch { setNote("Não foi possível ativar agora. Tente novamente."); }
    }}><Bell />Ativar alarmes</Button>}
  </section>;
}
