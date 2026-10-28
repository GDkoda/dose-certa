import type { Med } from "./store";

/** Estimates remaining days assuming one stock unit is consumed at each scheduled time. */
export function estimateStockDays(med: Pick<Med, "stock" | "times">): number | null {
  const administrationsPerDay = med.times.length;
  if (!Number.isFinite(med.stock) || med.stock < 0 || administrationsPerDay < 1) return null;
  return Math.floor(med.stock / administrationsPerDay);
}

export function stockLevel(med: Pick<Med, "stock" | "times">, threshold = 5): "empty" | "low" | "ok" {
  if (med.stock <= 0) return "empty";
  if (med.stock <= threshold) return "low";
  return "ok";
}
