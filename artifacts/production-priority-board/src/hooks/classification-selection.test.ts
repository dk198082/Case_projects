import { describe, expect, it, vi } from "vitest";
import {
  calculateWorkOrderQuantityStats,
  matchesBoardFilter,
  matchesClassificationSelections,
  resolveSessionSC3Selection,
  sumWorkOrderQuantity,
  toggleClassificationSelection,
} from "@/hooks/use-production-data";
import { isShipDateWithinWeeks } from "@/lib/date-utils";

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
        buildEndDate: "2000-01-01",
        salesShipDate: "2999-01-01",
      },
      {
        status: "RELEASED",
        workOrderQty: 7,
        buildEndDate: "2999-01-01",
        salesShipDate: "2000-01-01",
      },
    ]);

    expect(stats).toMatchObject({
      totalActive: 9,
      started: 2,
      released: 7,
      buildPastDue: 2,
      shipPastDue: 7,
    });
  });

  it("filters build and ship dates independently, excluding today and missing dates", () => {
    const now = new Date();
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    const buildOnly = { status: "STARTED" as const, buildEndDate: "2000-01-01", salesShipDate: "2999-01-01" };
    const shipOnly = { status: "RELEASED" as const, buildEndDate: "2999-01-01", salesShipDate: "2000-01-01" };
    const both = { status: "STARTED" as const, buildEndDate: "2000-01-01", salesShipDate: "2000-01-01" };
    const neither = { status: "RELEASED" as const, buildEndDate: today, salesShipDate: "" };

    expect(matchesBoardFilter(buildOnly, "Build Date Past Due")).toBe(true);
    expect(matchesBoardFilter(buildOnly, "Ship Date Past Due")).toBe(false);
    expect(matchesBoardFilter(shipOnly, "Build Date Past Due")).toBe(false);
    expect(matchesBoardFilter(shipOnly, "Ship Date Past Due")).toBe(true);
    expect(matchesBoardFilter(both, "Build Date Past Due")).toBe(true);
    expect(matchesBoardFilter(both, "Ship Date Past Due")).toBe(true);
    expect(matchesBoardFilter(neither, "Build Date Past Due")).toBe(false);
    expect(matchesBoardFilter(neither, "Ship Date Past Due")).toBe(false);
    expect(matchesBoardFilter(shipOnly, "Released")).toBe(true);
  });

  it("counts and filters ship dates on or before the selected weeks cutoff, including past-due dates", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 8, 30, 12));
      const order = (salesShipDate: string, workOrderQty = 1) => ({
        status: "STARTED" as const,
        buildEndDate: "2999-01-01",
        salesShipDate,
        workOrderQty,
      });
      const today = order("2026-09-30", 2);
      const lastDay = order("2026-10-14", 3);
      const nextDay = order("2026-10-15", 5);
      const yesterday = order("2026-09-29", 7);
      const longPastDue = order("2000-01-01", 17);
      const missing = order("", 11);
      const invalid = order("not-a-date", 13);

      expect(isShipDateWithinWeeks(today.salesShipDate, 2)).toBe(true);
      expect(isShipDateWithinWeeks(lastDay.salesShipDate, 2)).toBe(true);
      expect(isShipDateWithinWeeks(nextDay.salesShipDate, 2)).toBe(false);
      expect(isShipDateWithinWeeks(yesterday.salesShipDate, 2)).toBe(true);
      expect(isShipDateWithinWeeks(longPastDue.salesShipDate, 2)).toBe(true);
      expect(isShipDateWithinWeeks(missing.salesShipDate, 2)).toBe(false);
      expect(isShipDateWithinWeeks(invalid.salesShipDate, 2)).toBe(false);
      expect(isShipDateWithinWeeks(lastDay.salesShipDate, 0)).toBe(false);
      expect(isShipDateWithinWeeks(lastDay.salesShipDate, 1.5)).toBe(false);
      expect(matchesBoardFilter(lastDay, "Ship Date Within X Weeks", 1)).toBe(false);
      expect(matchesBoardFilter(lastDay, "Ship Date Within X Weeks", 2)).toBe(true);
      expect(matchesBoardFilter(longPastDue, "Ship Date Within X Weeks", 2)).toBe(true);
      expect(calculateWorkOrderQuantityStats(
        [today, lastDay, nextDay, yesterday, longPastDue, missing, invalid],
        2,
      ).shipWithinWeeks).toBe(29);
    } finally {
      vi.useRealTimers();
    }
  });
});