import { describe, it, expect, beforeEach } from "vitest";
import { money, compactMoney, currencyLabel, setActiveCurrency, getActiveCurrency } from "./format";

describe("format.ts — money()", () => {
  beforeEach(() => setActiveCurrency("XAF"));

  it("formats XAF — contains amount and currency code", () => {
    const result = money(1000);
    expect(result).toMatch(/1[\s ]?000/); // handles both narrow-no-break and regular space
    expect(result).toContain("XAF");
  });

  it("formats 0 XAF", () => {
    expect(money(0)).toContain("XAF");
    expect(money(0)).toMatch(/^0/);
  });

  it("formats EUR — contains amount with no FX conversion", () => {
    setActiveCurrency("EUR");
    const result = money(2000);
    // Should contain 2000 in some format (e.g. "2 000,00 €" or "2,000.00 €")
    expect(result).toMatch(/2[\s,.]?000/);
    // Should NOT be ~3 (old FX-converted value)
    expect(result).not.toMatch(/^3[,.]0/);
  });

  it("formats USD — contains amount with no FX conversion", () => {
    setActiveCurrency("USD");
    const result = money(2000);
    expect(result).toMatch(/2[,.]?000/);
    expect(result).not.toMatch(/^3[,.]0/);
  });

  it("does NOT multiply by any FX rate (regression)", () => {
    setActiveCurrency("EUR");
    const result = money(2000);
    // Old buggy behavior: 2000 * 0.001524 ≈ 3.05. Must never contain "3,05" or "3.05"
    expect(result).not.toMatch(/[34][,.]0[0-9]/);
    // Must contain 2000 in some formatted form
    expect(result).toMatch(/2[\s ,.]?000/);
  });
});

describe("format.ts — compactMoney()", () => {
  beforeEach(() => setActiveCurrency("XAF"));

  it("compacts millions in XAF — contains M and XAF", () => {
    const result = compactMoney(1_500_000);
    expect(result).toMatch(/1[,.]?5.*M/);
    expect(result).toContain("XAF");
  });

  it("compacts thousands in XAF — contains k and XAF", () => {
    const result = compactMoney(50_000);
    expect(result).toMatch(/50/);
    expect(result).toMatch(/k/i);
    expect(result).toContain("XAF");
  });

  it("compacts millions in EUR without FX conversion", () => {
    setActiveCurrency("EUR");
    const result = compactMoney(1_500_000);
    expect(result).toMatch(/1[,.]?5.*M/);
    expect(result).not.toContain("XAF");
  });

  it("compacts thousands in EUR without FX conversion", () => {
    setActiveCurrency("EUR");
    const result = compactMoney(50_000);
    expect(result).toMatch(/50/);
    expect(result).toMatch(/k/i);
    expect(result).not.toContain("XAF");
  });
});

describe("format.ts — currencyLabel()", () => {
  it("returns XAF for XAF", () => {
    setActiveCurrency("XAF");
    expect(currencyLabel()).toBe("XAF");
  });
  it("returns € for EUR", () => {
    setActiveCurrency("EUR");
    expect(currencyLabel()).toBe("€");
  });
  it("returns $ for USD", () => {
    setActiveCurrency("USD");
    expect(currencyLabel()).toBe("$");
  });
});

describe("format.ts — getActiveCurrency()", () => {
  it("returns whatever was last set", () => {
    setActiveCurrency("USD");
    expect(getActiveCurrency()).toBe("USD");
    setActiveCurrency("XAF");
    expect(getActiveCurrency()).toBe("XAF");
  });
});
