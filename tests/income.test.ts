import { describe, expect, it } from "vitest";
import { bufferPath, suggestSalary } from "../shared/income";

describe("renda variável", () => {
  it("sugere um salário que cabe nos meses fracos", () => {
    expect(suggestSalary([300000, 450000])).toBeNull();
    expect(suggestSalary([300000, 520000, 410000, 380000, 600000])).toBe(380000);
    expect(suggestSalary([312345, 0, 512345, 412345])).toBe(310000);
  });
  it("colchão acumula a sobra e cobre a falta", () => {
    const path = bufferPath(
      [
        { month: "2026-01", cents: 500000 },
        { month: "2026-02", cents: 300000 },
      ],
      400000,
    );
    expect(path.map((p) => p.bufferCents)).toEqual([100000, 0]);
  });
});
