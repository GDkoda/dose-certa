import { describe, expect, it } from "vitest";
import { pushSlot, scheduledInTimezone } from "@/lib/push-rules";
import type { Dose } from "@/lib/store";
const dose: Dose = { id: "d", ownerId: "u", patientId: "p", medId: "m", status: "pendente", scheduledAt: "2026-10-25T10:00:00Z" };
describe("Medication background reminder rules", () => {
  it("uses the phone timezone for the medication time", () => { expect(scheduledInTimezone("2026-10-25", "07:00", "America/Sao_Paulo")).toBe("2026-10-25T10:00:00.000Z"); });
  it("repeats pending reminders every 5 minutes, never before the scheduled time", () => { expect(pushSlot(dose, Date.parse("2026-10-25T09:59:00Z"))).toBeNull(); expect(pushSlot(dose, Date.parse("2026-10-25T10:04:59Z"))).toBe(0); expect(pushSlot(dose, Date.parse("2026-10-25T10:05:00Z"))).toBe(1); });
  it("honors a 5 minute snooze", () => { const snoozed = { ...dose, snoozeUntil: "2026-10-25T10:05:00Z" }; expect(pushSlot(snoozed, Date.parse("2026-10-25T10:04:59Z"))).toBeNull(); expect(pushSlot(snoozed, Date.parse("2026-10-25T10:05:00Z"))).toBe(1); });
  it.each(["tomado", "nao_tomado"] as const)("does not notify a %s dose", (status) => { expect(pushSlot({ ...dose, status }, Date.parse("2026-10-25T10:05:00Z"))).toBeNull(); });
});

describe("additional push schedule edge cases", () => {
  it("converts a Lisbon local time to UTC", () => {
    expect(scheduledInTimezone("2026-10-27", "08:00", "Europe/Lisbon"))
      .toBe("2026-10-27T08:00:00.000Z");
  });
  it("rejects an unknown timezone", () => {
    expect(() => scheduledInTimezone("2026-10-27", "08:00", "Mars/Base")).toThrow();
  });
  it("stops reminders at twelve hours after the scheduled time", () => {
    expect(pushSlot(dose, Date.parse("2026-10-25T22:00:00Z"))).toBeNull();
  });
  it("does not repeat within the same five-minute slot", () => {
    expect(pushSlot(dose, Date.parse("2026-10-25T10:00:00Z"))).toBe(0);
    expect(pushSlot(dose, Date.parse("2026-10-25T10:04:59Z"))).toBe(0);
  });
});
