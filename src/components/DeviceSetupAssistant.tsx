import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight, BellRing, CheckCircle2, Download, Info, Smartphone, Vibrate, X,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { enablePush } from "@/lib/push-browser";
import { registerPushDevice } from "@/lib/push.functions";
import { useInstallPrompt } from "@/lib/install-prompt";
import type { Role } from "@/lib/store";

type SetupStep = "install" | "notifications";
type PushState = "idle" | "busy" | "registered" | "denied" | "unsupported" | "not-configured" | "open-in-new-tab" | "error";

function isStandaloneApp() {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
  } catch { /* Navegadores antigos. */ }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function setupStorageKey(accountId: string) {
  return "dc-first-setup-complete-" + accountId;
}

function wasSetupCompleted(accountId: string) {
  if (typeof window === "undefined") return true;
  try { return localStorage.getItem(setupStorageKey(accountId)) === "1"; }
  catch { return false; }
}

export function DeviceSetupAssistant({ role, accountId }: { role: Role; accountId: string }) {
  const installFlow = useInstallPrompt();
  const register = useServerFn(registerPushDevice);
  const [open, setOpen] = useState(() => !wasSetupCompleted(accountId));
  const [step, setStep] = useState<SetupStep>(() => isStandaloneApp() ? "notifications" : "install");
  const [installed, setInstalled] = useState(isStandaloneApp);
  const [pushState, setPushState] = useState<PushState>(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    if (Notification.permission === "denied") return "denied";
    return "idle";
  });
  const [pushBusy, setPushBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [vibrationMessage, setVibrationMessage] = useState("");

  const finish = useCallback(() => {
    try { localStorage.setItem(setupStorageKey(accountId), "1"); } catch { /* A sessão continua normalmente sem armazenamento local. */ }
    setOpen(false);
  }, [accountId]);

  const connectNotifications = useCallback(async () => {
    setPushBusy(true);
    setPushState("busy");
    setMessage("");
    try {
      const result = await enablePush();
      if (result.status === "registered") {
        await register({
          data: {
            token: result.token,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        });
        try {
          sessionStorage.setItem("dc-push-token", result.token);
          localStorage.setItem("dc-push-ready-" + accountId, "1");
        } catch { /* O registro remoto continua válido mesmo sem armazenamento local. */ }
        setPushState("registered");
        setMessage("Notificações ativadas. Este aparelho está vinculado à sua conta.");
        window.dispatchEvent(new Event("dc-push-ready"));
      } else {
        setPushState(result.status);
        const messages: Record<"not-configured" | "unsupported" | "open-in-new-tab" | "denied", string> = {
          "not-configured": "O serviço de notificações ainda não está conectado neste ambiente.",
          unsupported: "Este navegador não oferece suporte às notificações em segundo plano do Dose Certa.",
          "open-in-new-tab": "Abra o Dose Certa em uma aba própria do navegador para ativar as notificações.",
          denied: "As notificações estão bloqueadas nas permissões atuais do navegador. Ele não permite abrir o pedido novamente por aqui.",
        };
        setMessage(messages[result.status]);
      }
    } catch {
      setPushState("error");
      setMessage("Não foi possível concluir a ativação agora. Confira a conexão e tente novamente.");
    } finally {
      setPushBusy(false);
    }
  }, [accountId, register]);

  useEffect(() => {
    const onInstalled = () => {
      setInstalled(true);
      setStep("notifications");
      setMessage("Dose Certa instalado. Agora vamos ativar os avisos.");
    };
    window.addEventListener("appinstalled", onInstalled);
    if (isStandaloneApp()) {
      setInstalled(true);
      setStep("notifications");
    }
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);

  useEffect(() => {
    if (!open || step !== "notifications") return;
    if (!("Notification" in window)) {
      setPushState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setPushState("denied");
      return;
    }
    // A permissão já concedida não exige novo prompt: apenas vinculamos o aparelho.
    if (Notification.permission === "granted" && pushState === "idle" && !pushBusy) {
      void connectNotifications();
    }
  }, [open, step, pushState, pushBusy, connectNotifications]);

  const continueToNotifications = () => {
    setMessage("");
    setStep("notifications");
  };

  const installApp = async () => {
    setMessage("");
    if (installFlow.step === "native") {
      const result = await installFlow.install();
      if (result === "unavailable") {
        setMessage("O navegador não conseguiu abrir a instalação agora. Você pode continuar sem instalar.");
        return;
      }
      setInstalled(result === "accepted" || isStandaloneApp());
      setStep("notifications");
      return;
    }
    if (installFlow.step === "own-tab") {
      installFlow.openOwnTab();
      setMessage("O Dose Certa foi aberto em outra aba. Continue por ela ou siga sem instalar.");
      return;
    }
    // iOS Safari e alguns navegadores não oferecem uma API para abrir
    // automaticamente o fluxo de instalação. Não exibimos um tutorial longo.
    continueToNotifications();
  };

  const testVibration = () => {
    if (typeof navigator.vibrate !== "function") {
      setVibrationMessage("Este navegador não oferece vibração pela página.");
      return;
    }
    const accepted = navigator.vibrate([160, 90, 160]);
    setVibrationMessage(accepted
      ? "Teste enviado. A vibração dos avisos em segundo plano ainda depende do navegador e do sistema."
      : "O aparelho não aceitou o teste de vibração.");
  };

  if (!open || typeof document === "undefined") return null;

  const installPromptAvailable = installFlow.step === "native";
  const isCaregiver = role === "cuidador";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/55 px-3 py-5 backdrop-blur-sm sm:px-5" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="dc-setup-title"
        className="relative my-auto w-full max-w-md overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-2xl"
      >
        <button
          type="button"
          onClick={finish}
          aria-label="Fechar configuração inicial"
          className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="bg-primary/5 px-6 pb-5 pt-7">
          <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            {step === "install" ? <Smartphone className="h-6 w-6" /> : <BellRing className="h-6 w-6" />}
          </span>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
            {step === "install" ? "Uma configuração rápida" : "Última etapa"}
          </p>
          <h2 id="dc-setup-title" className="mt-1 pr-8 font-display text-2xl font-semibold text-foreground">
            {step === "install" ? "Prepare seu Dose Certa" : "Ative os lembretes"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {step === "install"
              ? "Vamos deixar o app mais fácil de abrir e preparar este aparelho para receber os avisos."
              : isCaregiver
                ? "Permita as notificações para receber os lembretes dos medicamentos mesmo quando estiver usando outro aplicativo."
                : "Permita as notificações para receber os avisos do Dose Certa neste aparelho."}
          </p>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          {step === "install" ? (
            <>
              {installed ? (
                <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">Dose Certa já está instalado</p>
                    <p className="text-xs text-muted-foreground">Vamos ativar as notificações agora.</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-border bg-background p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Download className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">Instalar no celular</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {installPromptAvailable
                          ? "O navegador pode adicionar o Dose Certa à tela inicial."
                          : installFlow.step === "own-tab"
                            ? "A instalação precisa ser iniciada em uma aba própria."
                            : "A instalação automática não está disponível neste navegador agora. Você pode continuar sem instalar."}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {installFlow.step === "own-tab" ? (
                <>
                  <Button className="w-full" onClick={() => installFlow.openOwnTab()}>
                    <Smartphone className="h-4 w-4" />Abrir em outra aba
                  </Button>
                  <button type="button" onClick={continueToNotifications} className="w-full py-1 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
                    Continuar sem instalar
                  </button>
                </>
              ) : installed ? (
                <Button className="w-full" onClick={continueToNotifications}>
                  Continuar<ArrowRight className="h-4 w-4" />
                </Button>
              ) : installPromptAvailable ? (
                <>
                  <Button className="w-full" onClick={() => void installApp()}>
                    <Download className="h-4 w-4" />Instalar Dose Certa
                  </Button>
                  <button type="button" onClick={continueToNotifications} className="w-full py-1 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
                    Continuar sem instalar
                  </button>
                </>
              ) : (
                <Button className="w-full" onClick={continueToNotifications}>
                  Continuar<ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </>
          ) : (
            <>
              <div className={pushState === "registered" ? "flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4" : "flex items-center gap-3 rounded-2xl border border-border bg-background p-4"}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  {pushState === "registered" ? <CheckCircle2 className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">
                    {pushState === "registered" ? "Notificações ativadas" : pushState === "denied" ? "Notificações bloqueadas" : "Permitir notificações"}
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {pushState === "registered"
                      ? "Este aparelho está vinculado à sua conta e pronto para receber avisos."
                      : pushState === "denied"
                        ? "O navegador já bloqueou essa permissão e não permite solicitar novamente nesta tela."
                        : pushState === "unsupported"
                          ? "Este navegador não oferece suporte às notificações necessárias."
                          : pushState === "not-configured"
                            ? "O serviço de notificações ainda não está conectado neste ambiente."
                            : pushState === "busy"
                              ? "Solicitando a permissão e preparando este aparelho..."
                              : "Ao tocar no botão, o navegador abrirá a solicitação oficial de permissão."}
                  </p>
                </div>
              </div>

              {(pushState === "idle" || pushState === "error" || pushState === "busy") && (
                <Button className="w-full" disabled={pushBusy} onClick={() => void connectNotifications()}>
                  <BellRing className="h-4 w-4" />{pushBusy ? "Ativando..." : "Permitir notificações"}
                </Button>
              )}

              {pushState === "open-in-new-tab" && (
                <Button className="w-full" onClick={installFlow.openOwnTab}>
                  <Smartphone className="h-4 w-4" />Abrir em uma aba própria
                </Button>
              )}

              {pushState === "registered" && typeof navigator !== "undefined" && typeof navigator.vibrate === "function" && (
                <div className="rounded-2xl border border-border bg-background p-3">
                  <div className="flex items-center gap-2">
                    <Vibrate className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold text-foreground">Testar vibração</p>
                  </div>
                  <Button variant="outline" className="mt-2 w-full" onClick={testVibration}>
                    <Vibrate className="h-4 w-4" />Vibrar aparelho
                  </Button>
                  {vibrationMessage && <p role="status" className="mt-2 text-xs text-muted-foreground">{vibrationMessage}</p>}
                </div>
              )}

              <div className="flex items-start gap-2 rounded-xl bg-muted/60 p-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Vibração do sistema, ponto no ícone, banners e exceções ao “Não Perturbe” são controlados pelo Android ou iOS. A versão web não consegue ativar essas opções por conta própria.
                </p>
              </div>

              {message && <p role="status" className="rounded-xl bg-primary/5 px-3 py-2.5 text-sm text-muted-foreground">{message}</p>}

              <Button className="w-full" variant={pushState === "registered" ? "default" : "outline"} onClick={finish}>
                {pushState === "registered" ? "Concluir" : "Continuar para o Dose Certa"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}
          {step === "install" && message && <p role="status" className="text-xs leading-relaxed text-muted-foreground">{message}</p>}
        </div>
      </section>
    </div>,
    document.body,
  );
}
