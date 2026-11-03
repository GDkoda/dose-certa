import { Download, Share, Smartphone, X } from "lucide-react";
import { useInstallPrompt } from "@/lib/install-prompt";

const cardClass =
  "fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 rounded-2xl border border-border/80 bg-card p-4 text-card-foreground shadow-xl backdrop-blur-md md:bottom-4 md:left-auto md:right-4 md:max-w-md";

const primaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const secondaryButton =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function InstallPrompt() {
  const { step, install, rest, openOwnTab } = useInstallPrompt();

  if (step === "none") return null;

  return (
    <aside className={cardClass} aria-labelledby="install-prompt-title" aria-live="polite">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          {step === "desktop" ? (
            <Download className="h-5 w-5" aria-hidden="true" />
          ) : step === "ios" ? (
            <Share className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Smartphone className="h-5 w-5" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="install-prompt-title" className="pr-7 font-display text-base font-semibold text-foreground">
            {step === "native" && "Instalar Dose Certa no aparelho"}
            {step === "ios" && "Instalar no iPhone / iPad"}
            {step === "desktop" && "Adicionar ao computador"}
            {step === "own-tab" && "Abrir em aba própria"}
          </h2>
          <button
            type="button"
            onClick={rest}
            aria-label="Fechar aviso de instalação"
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {step === "native" && (
        <>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Adicione o app à sua tela inicial para receber alarmes pontuais e abrir com um toque.
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" className={secondaryButton} onClick={rest}>Mais tarde</button>
            <button type="button" className={primaryButton} onClick={() => void install()}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Instalar agora
            </button>
          </div>
        </>
      )}

      {step === "ios" && (
        <>
          <ol className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li className="flex gap-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">1</span>
              <span>Toque no botão de <strong className="font-semibold text-foreground">Compartilhar</strong> do Safari (ícone com quadrado e seta para cima).</span>
            </li>
            <li className="flex gap-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">2</span>
              <span>Role e selecione <strong className="font-semibold text-foreground">“Adicionar à Tela de Início”</strong>.</span>
            </li>
            <li className="flex gap-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">3</span>
              <span>Confirme em <strong className="font-semibold text-foreground">“Adicionar”</strong>.</span>
            </li>
          </ol>
          <div className="mt-4 flex justify-end">
            <button type="button" className={primaryButton} onClick={rest}>Entendi</button>
          </div>
        </>
      )}

      {step === "desktop" && (
        <>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Clique no ícone de instalação na barra de endereços do navegador (ou no menu ⋮ &gt; “Instalar Dose Certa”).
          </p>
          <div className="mt-4 flex justify-end">
            <button type="button" className={primaryButton} onClick={rest}>Entendi</button>
          </div>
        </>
      )}

      {step === "own-tab" && (
        <>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            O navegador não permite instalar dentro de janelas de prévia. Abra em uma aba própria para instalar.
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" className={secondaryButton} onClick={rest}>Agora não</button>
            <button type="button" className={primaryButton} onClick={openOwnTab}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Abrir em nova aba
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
