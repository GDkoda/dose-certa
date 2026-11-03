import { useEffect, useState } from "react";
import {
  Bell, BellRing, Battery, CheckCircle2, ChevronDown, ChevronUp,
  Download, Info, LockKeyhole, Settings, Smartphone, Volume2, Vibrate,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { enablePush } from "@/lib/push-browser";
import { registerPushDevice, sendTestPush } from "@/lib/push.functions";
import { useInstallPrompt } from "@/lib/install-prompt";
import type { Role } from "@/lib/store";

type PushState = "checking" | "prompt" | "granted" | "registered" | "denied" | "unsupported";
type ManualSetting = "sound" | "screen" | "badge";
type ManualChecks = Record<ManualSetting, boolean>;

const manualStorageKey = "dc-device-manual-settings";
const pushReadyKey = "dc-push-ready";

function isStandaloneApp() {
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
  } catch { /* Browser antigo. */ }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function loadManualChecks(): ManualChecks {
  const empty: ManualChecks = { sound: false, screen: false, badge: false };
  if (typeof window === "undefined") return empty;
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(manualStorageKey) ?? "{}") };
  } catch { return empty; }
}

const primaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60";
const secondaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-60";

export function DeviceSetupAssistant({ role }: { role: Role }) {
  const installFlow = useInstallPrompt();
  const register = useServerFn(registerPushDevice);
  const sendTest = useServerFn(sendTestPush);
  const [installed, setInstalled] = useState(false);
  const [pushState, setPushState] = useState<PushState>("checking");
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("dc-device-setup-collapsed") !== "1";
  });
  const [manualChecks, setManualChecks] = useState<ManualChecks>(loadManualChecks);
  const [vibrationTested, setVibrationTested] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [message, setMessage] = useState("");

  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isAndroid = /Android/i.test(userAgent);
  const isIos = /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);
  const isMobile = isAndroid || isIos;

  useEffect(() => {
    const refreshInstalled = () => setInstalled(isStandaloneApp());
    const refreshPush = () => {
      if (!("Notification" in window)) {
        setPushState("unsupported");
      } else if (Notification.permission === "denied") {
        setPushState("denied");
      } else if (Notification.permission === "granted") {
        const registered = !!sessionStorage.getItem("dc-push-token") || localStorage.getItem(pushReadyKey) === "1";
        setPushState(registered ? "registered" : "granted");
      } else {
        setPushState("prompt");
      }
    };
    const refresh = () => { refreshInstalled(); refreshPush(); };
    refresh();
    window.addEventListener("appinstalled", refreshInstalled);
    window.addEventListener("focus", refresh);
    window.addEventListener("dc-push-ready", refreshPush);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("appinstalled", refreshInstalled);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("dc-push-ready", refreshPush);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const setManual = (key: ManualSetting, checked: boolean) => {
    const next = { ...manualChecks, [key]: checked };
    setManualChecks(next);
    try { localStorage.setItem(manualStorageKey, JSON.stringify(next)); } catch { /* Armazenamento opcional. */ }
  };

  const collapse = () => {
    setExpanded(false);
    try { localStorage.setItem("dc-device-setup-collapsed", "1"); } catch { /* Armazenamento opcional. */ }
  };
  const reopen = () => {
    setExpanded(true);
    try { localStorage.removeItem("dc-device-setup-collapsed"); } catch { /* Armazenamento opcional. */ }
  };

  const installApp = async () => {
    setInstallBusy(true);
    setMessage("");
    try {
      if (installFlow.step === "native") {
        const result = await installFlow.install();
        if (result === "accepted") {
          setInstalled(true);
          setMessage("Pedido de instalação aceito. Termine a confirmação que apareceu no navegador.");
        } else if (result === "unavailable") {
          setMessage("O navegador não abriu a instalação agora. Use o menu do navegador e escolha “Instalar app” ou “Adicionar à tela inicial”.");
        }
      } else if (installFlow.step === "own-tab") {
        installFlow.openOwnTab();
        setMessage("Abra a nova aba e continue a instalação por lá.");
      } else {
        setMessage(isIos
          ? "No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início."
          : "Abra o menu do navegador (⋮) e escolha “Instalar app” ou “Adicionar à tela inicial”.");
      }
    } finally {
      setInstallBusy(false);
    }
  };

  const activateNotifications = async () => {
    setPushBusy(true);
    setMessage("");
    try {
      const result = await enablePush();
      if (result.status === "registered") {
        await register({ data: { token: result.token, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
        sessionStorage.setItem("dc-push-token", result.token);
        localStorage.setItem(pushReadyKey, "1");
        setPushState("registered");
        window.dispatchEvent(new Event("dc-push-ready"));
        setMessage("Pronto! Este aparelho foi vinculado para receber os avisos do Dose Certa.");
      } else {
        const messages = {
          "not-configured": "O serviço de notificações ainda não está conectado neste ambiente. Peça ao suporte para concluir essa configuração.",
          unsupported: isIos
            ? "No iPhone/iPad, primeiro adicione o Dose Certa à Tela de Início e abra pelo ícone instalado. Depois volte aqui para ativar os avisos."
            : "Este navegador não oferece suporte aos avisos em segundo plano necessários. Atualize o navegador e abra o Dose Certa em uma aba própria.",
          "open-in-new-tab": "O Dose Certa foi aberto dentro de uma prévia. Abra-o em uma aba própria do navegador para ativar os avisos.",
          denied: "A permissão foi recusada ou está bloqueada. Abra as configurações de notificações do Dose Certa no aparelho ou do site no navegador e permita os avisos.",
        };
        setMessage(messages[result.status]);
        setPushState(result.status === "denied" ? "denied" : result.status === "unsupported" || result.status === "open-in-new-tab" || result.status === "not-configured" ? "unsupported" : "prompt");
      }
    } catch {
      setMessage("Não foi possível concluir a ativação. Confira a conexão e tente novamente.");
      setPushState("prompt");
    } finally {
      setPushBusy(false);
    }
  };

  const testNotification = async () => {
    setTestBusy(true);
    setMessage("Enviando um aviso de teste. Minimize o Dose Certa por alguns instantes para conferir se ele aparece.");
    try {
      const result = await sendTest();
      setMessage(result.devices === 0
        ? "Nenhum aparelho foi vinculado ainda. Ative os avisos primeiro."
        : result.sent > 0
          ? "Aviso de teste enviado. Minimize o app e confira a notificação."
          : "O envio não foi concluído. Confira as permissões e tente ativar os avisos novamente.");
    } catch {
      setMessage("Não foi possível enviar o teste agora. Tente novamente quando a conexão estiver estável.");
    } finally {
      setTestBusy(false);
    }
  };

  const testVibration = () => {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
      setMessage("Este navegador não oferece teste de vibração pela página. Ative som e vibração nas configurações de notificações do aparelho.");
      return;
    }
    const accepted = navigator.vibrate([180, 110, 180]);
    if (accepted) {
      setVibrationTested(true);
      setMessage("O navegador aceitou o teste de vibração. O Android ainda pode silenciar vibrações em modo silencioso ou Não Perturbe.");
    } else {
      setMessage("O aparelho não iniciou a vibração. Confira o modo silencioso, Não Perturbe e as configurações de vibração do sistema.");
    }
  };

  const manualDone = Object.values(manualChecks).filter(Boolean).length;
  const completed = Number(installed) + Number(pushState === "registered") + Number(vibrationTested) + manualDone;
  const total = 6;

  if (!expanded) {
    return (
      <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Settings className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">Configuração do aparelho</p>
            <p className="text-xs text-muted-foreground">{completed} de {total} verificações concluídas · você pode revisar quando quiser</p>
          </div>
        </div>
        <button type="button" onClick={reopen} className={secondaryButton}>Rever configurações<ChevronDown className="h-4 w-4" /></button>
      </section>
    );
  }

  return (
    <section className="mb-6 overflow-hidden rounded-[1.6rem] border border-primary/20 bg-card shadow-sm">
      <div className="relative overflow-hidden bg-primary/5 px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Smartphone className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Configuração inicial</p>
            <h2 className="mt-1 font-display text-xl font-semibold text-foreground">Vamos preparar seu aparelho?</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">Esses ajustes ajudam o Dose Certa a avisar você na hora certa, inclusive quando o app estiver fechado ou o celular bloqueado. É rapidinho e você pode mudar tudo depois.</p>
          </div>
          <button type="button" onClick={collapse} aria-label="Recolher configuração do aparelho" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"><ChevronUp className="h-5 w-5" /></button>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: (completed / total * 100) + "%" }} />
          </div>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">{completed}/{total}</span>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
        <article className="rounded-2xl border border-border bg-background p-4">
          <div className="flex items-center gap-2 text-primary"><Download className="h-5 w-5" /><p className="font-semibold text-foreground">1. Instalar no celular</p></div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{installed ? "O Dose Certa já está aberto como aplicativo instalado neste aparelho." : "A instalação deixa o Dose Certa na tela inicial e facilita abrir os alarmes."}</p>
          {!installed && (
            <>
              {installFlow.step === "ios" ? (
                <ol className="mt-3 list-inside list-decimal space-y-1 text-xs leading-relaxed text-muted-foreground">
                  <li>Abra esta página no Safari.</li>
                  <li>Toque em Compartilhar.</li>
                  <li>Escolha “Adicionar à Tela de Início” e confirme.</li>
                </ol>
              ) : installFlow.step === "own-tab" ? (
                <p className="mt-3 text-xs text-muted-foreground">Esta janela de prévia não permite instalação. Abra o app em uma aba própria.</p>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">{isMobile ? "No Android, use o menu ⋮ do navegador e escolha “Instalar app” ou “Adicionar à tela inicial” caso o botão de instalação não apareça." : "Use o ícone de instalação na barra de endereços ou o menu do navegador."}</p>
              )}
              <Button className="mt-3 w-full" disabled={installBusy} onClick={() => void installApp()}>
                <Download className="h-4 w-4" />{installBusy ? "Abrindo instalação..." : installFlow.step === "native" ? "Instalar Dose Certa" : installFlow.step === "own-tab" ? "Abrir em nova aba" : "Ver instruções de instalação"}
              </Button>
              {installFlow.step !== "native" && (
                <button type="button" className="mt-2 w-full text-xs font-semibold text-primary hover:underline" onClick={() => setInstalled(true)}>Já instalei no meu aparelho</button>
              )}
            </>
          )}
          {installed && <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary"><CheckCircle2 className="h-4 w-4" />Instalação concluída</p>}
        </article>

        <article className="rounded-2xl border border-border bg-background p-4">
          <div className="flex items-center gap-2 text-primary"><BellRing className="h-5 w-5" /><p className="font-semibold text-foreground">2. Ativar notificações</p></div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Autorize os avisos para receber lembretes quando estiver usando outro aplicativo ou com a tela bloqueada.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={pushState === "registered" ? "rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary" : "rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground"}>
              {pushState === "registered" ? "Aparelho vinculado" : pushState === "granted" ? "Permissão concedida" : pushState === "denied" ? "Permissão bloqueada" : pushState === "unsupported" ? "Verificar compatibilidade" : "Aguardando ativação"}
            </span>
          </div>
          {pushState !== "registered" && (
            <Button className="mt-3 w-full" disabled={pushBusy} onClick={() => void activateNotifications()}>
              <Bell className="h-4 w-4" />{pushBusy ? "Ativando..." : pushState === "granted" ? "Concluir ativação neste aparelho" : "Permitir notificações"}
            </Button>
          )}
          {pushState === "registered" && (
            <Button variant="outline" className="mt-3 w-full" disabled={testBusy} onClick={() => void testNotification()}>
              <BellRing className="h-4 w-4" />{testBusy ? "Enviando teste..." : "Enviar aviso de teste"}
            </Button>
          )}
          {pushState === "denied" && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Para liberar: abra as configurações do Dose Certa no Android ou as configurações do site no navegador e permita notificações.</p>}
          {isIos && !installed && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">No iPhone, os avisos da web exigem que o site seja adicionado à Tela de Início e aberto pelo ícone instalado.</p>}
        </article>

        <article className="rounded-2xl border border-border bg-background p-4">
          <div className="flex items-center gap-2 text-primary"><Vibrate className="h-5 w-5" /><p className="font-semibold text-foreground">3. Testar vibração</p></div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">A web não pede uma permissão separada para vibrar. Faça um teste e confira se o aparelho está com a vibração ativada.</p>
          <Button variant="outline" className="mt-3 w-full" onClick={testVibration}><Vibrate className="h-4 w-4" />Testar vibração</Button>
          {vibrationTested && <p className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-primary"><CheckCircle2 className="h-4 w-4" />Comando de vibração aceito pelo navegador</p>}
        </article>

        <article className="rounded-2xl border border-border bg-background p-4">
          <div className="flex items-center gap-2 text-primary"><Settings className="h-5 w-5" /><p className="font-semibold text-foreground">4. Ajustar os avisos do sistema</p></div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{isIos ? "No iPhone/iPad, abra Ajustes → Notificações → Dose Certa." : "No Android, pressione o ícone do Dose Certa, abra Informações do app e entre em Notificações."}</p>
          <div className="mt-3 space-y-2.5">
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input type="checkbox" checked={manualChecks.sound} onChange={(event) => setManual("sound", event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
              <span><strong className="text-foreground">Som e vibração</strong><span className="block text-xs text-muted-foreground">Permita alertas sonoros e vibração para os avisos do Dose Certa.</span></span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input type="checkbox" checked={manualChecks.screen} onChange={(event) => setManual("screen", event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
              <span><strong className="text-foreground">Tela bloqueada e banners</strong><span className="block text-xs text-muted-foreground">{isIos ? "Ative Tela Bloqueada, Central de Notificações e Banners." : "Ative Tela de bloqueio e “Pop-up na tela”/“Exibir como pop-up”, se disponível."}</span></span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input type="checkbox" checked={manualChecks.badge} onChange={(event) => setManual("badge", event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
              <span><strong className="text-foreground">Ponto no ícone</strong><span className="block text-xs text-muted-foreground">{isIos ? "Ative Selos nas opções de notificação." : "Ative “Ponto de notificação” ou “Selos no ícone do app”."}</span></span>
            </label>
          </div>
          <details className="mt-4 rounded-xl bg-muted/60 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-foreground">Onde encontro essas opções?</summary>
            {isIos ? (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Ajustes do iPhone → Notificações → Dose Certa. Ative Permitir Notificações, Sons, Selos, Tela Bloqueada e Banners.</p>
            ) : (
              <ol className="mt-2 list-inside list-decimal space-y-1 text-xs leading-relaxed text-muted-foreground">
                <li>Pressione o ícone Dose Certa e toque em “Informações do app”.</li>
                <li>Entre em “Notificações” e permita notificações.</li>
                <li>Abra cada categoria de aviso e escolha alertas com som e vibração.</li>
                <li>Ative Tela de bloqueio, Pop-up na tela e Ponto de notificação, quando disponíveis.</li>
              </ol>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Os nomes e caminhos mudam conforme a marca e a versão do sistema. Se o Dose Certa não aparecer na lista, procure as permissões do site nas configurações do navegador.</p>
          </details>
        </article>
      </div>

      <div className="mx-4 mb-4 flex items-start gap-3 rounded-2xl border border-secondary/30 bg-secondary/10 p-4 sm:mx-5">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
        <div className="min-w-0 space-y-2">
          <p className="font-semibold text-foreground">Sobre o modo Não Perturbe e os avisos sobre outros apps</p>
          <p className="text-xs leading-relaxed text-muted-foreground">Como o Dose Certa é instalado pelo navegador (PWA), ele não consegue pedir acesso especial para ignorar o Não Perturbe nem controlar a permissão “Exibir sobre outros apps”. Quando disponível, ative “Pop-up na tela”/“Banners” nas notificações do sistema. O Não Perturbe ainda pode silenciar sons e vibrações.</p>
          <p className="text-xs leading-relaxed text-muted-foreground">O app pode enviar notificações normais do sistema, mas só um aplicativo Android nativo pode solicitar o acesso especial de política de notificações para criar exceções ao Não Perturbe. A decisão final continua sendo do usuário.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
        <p className="text-xs text-muted-foreground">Você pode rever estes ajustes em qualquer momento.</p>
        <button type="button" onClick={collapse} className="text-sm font-semibold text-primary hover:underline">Concluir por enquanto</button>
      </div>
      {message && <p role="status" className="mx-5 mb-4 rounded-xl bg-primary/5 px-3 py-2.5 text-sm text-muted-foreground">{message}</p>}
    </section>
  );
}
