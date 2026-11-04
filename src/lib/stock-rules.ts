import type { Med } from "./store";

/** Estimates remaining days using the actual amount consumed at each administration. */
export function estimateStockDays(med: Pick<Med, "stock" | "times" | "quantityPerDose">): number | null {
  const administrationsPerDay = med.times.length;
  const quantityPerDose = Number.isFinite(med.quantityPerDose) && (med.quantityPerDose ?? 0) > 0
    ? med.quantityPerDose!
    : 1;
  const dailyConsumption = administrationsPerDay * quantityPerDose;
  if (!Number.isFinite(med.stock) || med.stock < 0 || dailyConsumption <= 0) return null;
  return Math.floor(med.stock / dailyConsumption);
}

/** New records use 10% of the initial supply; legacy records keep the 5-unit fallback. */
export function stockLevel(
  med: Pick<Med, "stock" | "times" | "initialStock">,
  threshold = 5,
): "empty" | "low" | "ok" {
  if (med.stock <= 0) return "empty";
  if (Number.isFinite(med.initialStock) && (med.initialStock ?? 0) > 0) {
    return med.stock <= (med.initialStock ?? 0) * 0.1 ? "low" : "ok";
  }
  return med.stock <= threshold ? "low" : "ok";
}
