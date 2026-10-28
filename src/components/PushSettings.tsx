import { useState } from "react";
import { Bell } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { registerPushDevice } from "@/lib/push.functions";
import { enablePush } from "@/lib/push-browser";

export function PushSettings() {
  const register = useServerFn(registerPushDevice);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
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
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
  </section>;
}