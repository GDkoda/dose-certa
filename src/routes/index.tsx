import { createFileRoute } from "@tanstack/react-router";
import { DoseCertaApp } from "@/components/DoseCertaApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dose Certa — Equilíbrio e Bem-Estar" },
      { name: "description", content: "Alarmes de medicamentos, pacientes, histórico de doses e central de atendimento para cuidadores." },
      { property: "og:title", content: "Dose Certa — Equilíbrio e Bem-Estar" },
      { property: "og:description", content: "Alarmes de medicamentos, pacientes, histórico de doses e central de atendimento para cuidadores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DoseCertaApp,
});
