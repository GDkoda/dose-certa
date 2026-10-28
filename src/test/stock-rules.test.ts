import { describe, expect, it } from "vitest";
import { estimateStockDays, stockLevel } from "@/lib/stock-rules";

describe("medication stock rules", () => {
  it("estimates days using one unit per scheduled administration", () => {
    expect(estimateStockDays({ stock: 30, times: ["08:00", "20:00"] })).toBe(15);
    expect(estimateStockDays({ stock: 7, times: ["08:00"] })).toBe(7);
  });
  it("handles empty stock and missing schedule", () => {
    expect(estimateStockDays({ stock: 0, times: ["08:00"] })).toBe(0);
    expect(estimateStockDays({ stock: 12, times: [] })).toBeNull();
  });
  it("classifies empty, low and normal stock", () => {
    expect(stockLevel({ stock: 0, times: ["08:00"] })).toBe("empty");
    expect(stockLevel({ stock: 5, times: ["08:00"] })).toBe("low");
    expect(stockLevel({ stock: 6, times: ["08:00"] })).toBe("ok");
  });
});
