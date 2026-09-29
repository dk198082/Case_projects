import { describe, expect, it } from "vitest";
import {
  calculateWorkOrderQuantityStats,
  matchesClassificationSelections,
  resolveSessionSC3Selection,
  sumWorkOrderQuantity,
  toggleClassificationSelection,
} from "@/hooks/use-production-data";

describe("classification multi-selection", () => {
  const orders = [
    { SC3: "300SL", status: "RELEASED" as const, workOrderQty: 4 },
    { SC3: "300SL", status: "STARTED" as const, workOrderQty: 2 },
    { SC3: "600SL", status: "RELEASED" as const, workOrderQty: 7 },
  ];

  it("defaults a new session to All even when one team has the most orders", () => {
    expect(resolveSessionSC3Selection(null, orders)).toEqual([]);
  });

  it("restores a valid team selection from the current session", () => {
    expect(resolveSessionSC3Selection('["600SL"]', orders)).toEqual(["600SL"]);
  });

  it("replaces the selection on a normal click", () => {
    expect(toggleClassificationSelection(["SC1-A", "SC1-B"], "SC1-C", false))
      .toEqual(["SC1-C"]);
  });

  it("adds and removes values on Ctrl/Cmd-click", () => {
    expect(toggleClassificationSelection(["SC1-A"], "SC1-B", true))
      .toEqual(["SC1-A", "SC1-B"]);
    expect(toggleClassificationSelection(["SC1-A", "SC1-B"], "SC1-A", true))
      .toEqual(["SC1-B"]);
  });

  it("treats empty selections as All and matches multiple SC1/SC3 values", () => {
    const order = { SC1: "SC1-B", SC3: "SC3-2" };

    expect(matchesClassificationSelections(order, [], [])).toBe(true);
    expect(
      matchesClassificationSelections(
        order,
        ["SC1-A", "SC1-B"],
        ["SC3-1", "SC3-2"],
      ),
    ).toBe(true);
    expect(
      matchesClassificationSelections(order, ["SC1-A"], ["SC3-2"]),
    ).toBe(false);
  });

  it("sums Work Order quantities instead of counting rows", () => {
    expect(sumWorkOrderQuantity(orders)).toBe(13);
  });

  it("calculates KPI totals from Work Order quantities", () => {
    const stats = calculateWorkOrderQuantityStats([
      {
        status: "STARTED",
        workOrderQty: 2,
        buildEndDate: "2999-01-01",
      },
      {
        status: "RELEASED",
        workOrderQty: 7,
        buildEndDate: "2999-01-01",
      },
    ]);

    expect(stats).toMatchObject({
      totalActive: 9,
      started: 2,
      released: 7,
    });
  });
});