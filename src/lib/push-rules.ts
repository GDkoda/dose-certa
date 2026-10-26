import type { Dose } from "./store";

export function scheduledInTimezone(day: string, time: string, timezone: string): string {
  const target = Date.parse(`${day}T${time}:00Z`);
  if (!Number.isFinite(target)) throw new Error("Horário inválido");
  let instant = target;
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(format.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    const local = Date.parse(`${parts['year']}-${parts['month']}-${parts['day']}T${parts['hour']}:${parts['minute']}:${parts['second']}Z`);
    instant += target - local;
  }
  return new Date(instant).toISOString();
}

export function pushSlot(dose: Pick<Dose, "status" | "scheduledAt"> & { snoozeUntil?: string | undefined; lastShown?: string | undefined }, now: number): number | null {
  const scheduled = Date.parse(dose.scheduledAt);
  if (dose.status !== "pendente" || !Number.isFinite(scheduled) || now < scheduled || now - scheduled >= 12 * 3600000) return null;
  if (dose.snoozeUntil && Date.parse(dose.snoozeUntil) > now) return null;
  if (dose.lastShown && now - Date.parse(dose.lastShown) < 5 * 60000) return null;
  return Math.floor((now - scheduled) / (5 * 60000));
}