import type { Dose, Med } from "./store";

export function localScheduledAt(day: Date, time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) throw new Error("Horário inválido");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error("Horário inválido");
  const scheduled = new Date(day);
  scheduled.setHours(hour, minute, 0, 0);
  return scheduled.toISOString();
}

export function buildMissingDoses(
  meds: Med[],
  existing: Dose[],
  ownerId: string,
  day: Date,
  createId: () => string,
): Dose[] {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const existingKeys = new Set(existing.map((dose) => `${dose.medId}|${dose.scheduledAt}`));
  const additions: Dose[] = [];
  for (const med of meds) {
    if (med.ownerId !== ownerId) continue;
    for (const time of med.times) {
      let scheduledAt: string;
      try { scheduledAt = localScheduledAt(start, time); } catch { continue; }
      const instant = Date.parse(scheduledAt);
      if (instant < start.getTime() || instant >= end.getTime()) continue;
      const key = `${med.id}|${scheduledAt}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      additions.push({ id: createId(), medId: med.id, patientId: med.patientId, ownerId, scheduledAt, status: "pendente" });
    }
  }
  return additions;
}

export function isDoseDue(dose: Pick<Dose, "status" | "scheduledAt" | "snoozeUntil" | "lastShown">, now: number, repeatMinutes = 5, maxAgeHours = 12): boolean {
  const scheduled = Date.parse(dose.scheduledAt);
  if (dose.status !== "pendente" || !Number.isFinite(scheduled) || now < scheduled || now - scheduled >= maxAgeHours * 3600000) return false;
  if (dose.snoozeUntil) {
    const snooze = Date.parse(dose.snoozeUntil);
    if (Number.isFinite(snooze) && snooze > now) return false;
  }
  if (dose.lastShown) {
    const lastShown = Date.parse(dose.lastShown);
    if (Number.isFinite(lastShown) && now - lastShown < repeatMinutes * 60000) return false;
  }
  return true;
}

export function findDueDose<T extends Pick<Dose, "ownerId" | "status" | "scheduledAt" | "snoozeUntil" | "lastShown">>(doses: T[], ownerId: string, now: number): T | undefined {
  return doses.filter((dose) => dose.ownerId === ownerId && isDoseDue(dose, now))
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0];
}
