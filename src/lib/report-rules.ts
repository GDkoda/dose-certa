import type { DoseStatus } from "./store";

export interface DoseReportSummary {
  taken: number;
  missed: number;
  pending: number;
  finalized: number;
  adherencePercent: number;
}

/** Pending doses are excluded from adherence until a final status is recorded. */
export function summarizeDoseStatuses(statuses: readonly DoseStatus[]): DoseReportSummary {
  const taken = statuses.filter((status) => status === "tomado").length;
  const missed = statuses.filter((status) => status === "nao_tomado").length;
  const pending = statuses.filter((status) => status === "pendente").length;
  const finalized = taken + missed;
  return {
    taken,
    missed,
    pending,
    finalized,
    adherencePercent: finalized === 0 ? 0 : Math.round((taken / finalized) * 100),
  };
}
