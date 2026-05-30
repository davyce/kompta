import { describe, it, expect } from "vitest";
import { convertCurrency, EXCHANGE_RATES } from "./format";

describe("convertCurrency", () => {
  it("returns the same amount when from === to", () => {
    expect(convertCurrency(1000, "XAF", "XAF")).toBe(1000);
    expect(convertCurrency(50, "EUR", "EUR")).toBe(50);
  });

  it("converts XAF → EUR via the XAF pivot rate", () => {
    // inXaf = amount / rate[XAF]; result = inXaf * rate[EUR]
    const expected = (1000 / EXCHANGE_RATES.XAF) * EXCHANGE_RATES.EUR;
    expect(convertCurrency(1000, "XAF", "EUR")).toBeCloseTo(expected, 6);
  });

  it("round-trips a conversion back to the original (within float tolerance)", () => {
    const eur = convertCurrency(12345, "XAF", "EUR");
    const back = convertCurrency(eur, "EUR", "XAF");
    expect(back).toBeCloseTo(12345, 4);
  });

  it("handles zero", () => {
    expect(convertCurrency(0, "XAF", "USD")).toBe(0);
  });
});
