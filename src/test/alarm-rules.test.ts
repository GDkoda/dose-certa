import { describe, expect, it } from "vitest";
import { buildMissingDoses, findDueDose, isDoseDue, localScheduledAt } from "@/lib/alarm-rules";
import type { Dose, Med } from "@/lib/store";

const med: Med = { id: "m1", ownerId: "u1", patientId: "p1", name: "Medicamento", dose: "1 comprimido", times: ["08:00", "20:00"], stock: 20, tolerance: 30 };
const dose: Dose = { id: "d1", ownerId: "u1", patientId: "p1", medId: "m1", scheduledAt: "2026-10-27T11:00:00.000Z", status: "pendente" };

describe("alarm rules", () => {
  it("converts a local time to an ISO instant", () => {
    expect(localScheduledAt(new Date("2026-10-27T12:00:00"), "08:30")).toBe(new Date(2026, 9, 27, 8, 30).toISOString());
  });
  it("rejects invalid clock times", () => {
    expect(() => localScheduledAt(new Date(), "25:70")).toThrow("Horário inválido");
    expect(() => localScheduledAt(new Date(), "8")).toThrow("Horário inválido");
  });
  it("creates each scheduled dose once and only for the selected owner", () => {
    const day = new Date(2026, 9, 27, 12);
    const existing = [{ ...dose, scheduledAt: localScheduledAt(day, "08:00") }];
    const additions = buildMissingDoses([med, { ...med, id: "m2", ownerId: "other" }], existing, "u1", day, () => "new-id");
    expect(additions).toHaveLength(1);
    expect(additions[0]?.scheduledAt).toBe(localScheduledAt(day, "20:00"));
  });
  it("does not repeat a dose before its time or after it is confirmed", () => {
    const dueAt = Date.parse(dose.scheduledAt);
    expect(isDoseDue(dose, dueAt - 1)).toBe(false);
    expect(isDoseDue({ ...dose, status: "tomado" }, dueAt + 300000)).toBe(false);
    expect(isDoseDue(dose, dueAt + 300000)).toBe(true);
  });
  it("respects snooze, repeat interval and maximum reminder age", () => {
    const dueAt = Date.parse(dose.scheduledAt);
    expect(isDoseDue({ ...dose, snoozeUntil: new Date(dueAt + 600000).toISOString() }, dueAt + 300000)).toBe(false);
    expect(isDoseDue({ ...dose, lastShown: new Date(dueAt).toISOString() }, dueAt + 299999)).toBe(false);
    expect(isDoseDue(dose, dueAt + 12 * 3600000)).toBe(false);
  });
  it("selects the oldest due dose first", () => {
    const later = { ...dose, id: "d2", scheduledAt: "2026-10-27T12:00:00.000Z" };
    expect(findDueDose([later, dose], "u1", Date.parse("2026-10-27T13:00:00.000Z"))?.id).toBe("d1");
  });
});
