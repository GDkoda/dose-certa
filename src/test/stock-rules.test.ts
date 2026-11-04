import { describe, expect, it } from "vitest";
import { estimateStockDays, stockLevel } from "@/lib/stock-rules";

describe("medication stock rules", () => {
  it("estimates days using one unit per scheduled administration for legacy records", () => {
    expect(estimateStockDays({ stock: 30, times: ["08:00", "20:00"] })).toBe(15);
    expect(estimateStockDays({ stock: 7, times: ["08:00"] })).toBe(7);
  });
  it("estimates days using the actual quantity consumed per dose", () => {
    expect(estimateStockDays({ stock: 30, times: ["08:00", "20:00"], quantityPerDose: 2 })).toBe(7);
    expect(estimateStockDays({ stock: 120, times: ["08:00"], quantityPerDose: 5 })).toBe(24);
    expect(estimateStockDays({ stock: 30, times: ["08:00"], quantityPerDose: 0.5 })).toBe(60);
  });
  it("handles empty stock and missing schedule", () => {
    expect(estimateStockDays({ stock: 0, times: ["08:00"] })).toBe(0);
    expect(estimateStockDays({ stock: 12, times: [] })).toBeNull();
  });
  it("classifies empty, low and normal legacy stock", () => {
    expect(stockLevel({ stock: 0, times: ["08:00"] })).toBe("empty");
    expect(stockLevel({ stock: 5, times: ["08:00"] })).toBe("low");
    expect(stockLevel({ stock: 6, times: ["08:00"] })).toBe("ok");
  });
  it("warns when ten percent or less of the initial supply remains", () => {
    expect(stockLevel({ stock: 3, times: ["08:00"], initialStock: 30 })).toBe("low");
    expect(stockLevel({ stock: 4, times: ["08:00"], initialStock: 30 })).toBe("ok");
    expect(stockLevel({ stock: 1, times: ["08:00"], initialStock: 5 })).toBe("ok");
    expect(stockLevel({ stock: 0, times: ["08:00"], initialStock: 5 })).toBe("empty");
  });
});
