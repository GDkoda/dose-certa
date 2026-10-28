import { describe, expect, it } from "vitest";
import { summarizeDoseStatuses } from "@/lib/report-rules";

describe("dose report rules", () => {
  it("calculates adherence from finalized doses only", () => {
    expect(summarizeDoseStatuses(["tomado", "tomado", "nao_tomado", "pendente"])).toEqual({
      taken: 2, missed: 1, pending: 1, finalized: 3, adherencePercent: 67,
    });
  });
  it("returns zero adherence when there are no finalized doses", () => {
    expect(summarizeDoseStatuses(["pendente"])).toEqual({
      taken: 0, missed: 0, pending: 1, finalized: 0, adherencePercent: 0,
    });
  });
  it("handles an empty report", () => {
    expect(summarizeDoseStatuses([]).finalized).toBe(0);
  });
});
