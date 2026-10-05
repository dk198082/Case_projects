import { describe, expect, it } from "vitest";
import {
  buildTicks, classifySchedule, computeDomain, DAY_MS,
  MAX_TIMELINE_WIDTH, resolvePxPerDay, toDayNumber,
} from "./gantt-layout";

describe("production Gantt date geometry", () => {
  it("preserves UTC calendar dates and rejects absent or invalid dates", () => {
    expect(toDayNumber("2026-09-30T00:00:00Z")).toBe(Date.UTC(2026, 8, 30) / DAY_MS);
    expect(toDayNumber("")).toBeNull();
    expect(toDayNumber("invalid")).toBeNull();
  });

  it("uses inclusive durations and keeps ship milestones independent", () => {
    const info = classifySchedule({
      buildStartDate: "2026-09-01", buildEndDate: "2026-09-01", salesShipDate: "2026-09-10",
    });
    expect(info.kind).toBe("complete");
    expect(info.durationDays).toBe(1);
    expect(info.ship).toBe(toDayNumber("2026-09-10"));
  });

  it.each([
    ["2026-10-01", "2026-09-01", "reversed"],
    ["2026-10-01", "", "start-only"],
    ["", "2026-10-01", "end-only"],
    ["", "", "undated"],
  ])("does not invent duration for %s / %s", (start, end, kind) => {
    const info = classifySchedule({ buildStartDate: start, buildEndDate: end, salesShipDate: "" });
    expect(info.kind).toBe(kind);
    expect(info.durationDays).toBeNull();
  });

  it("includes all known dates and today, with bounded geometry on long schedules", () => {
    const today = toDayNumber("2026-09-30")!;
    const domain = computeDomain([classifySchedule({
      buildStartDate: "2000-01-01", buildEndDate: "2999-12-01", salesShipDate: "2999-12-31",
    })], today);
    expect(domain.start).toBeLessThanOrEqual(toDayNumber("2000-01-01")!);
    expect(domain.end).toBeGreaterThan(toDayNumber("2999-12-31")!);
    const density = resolvePxPerDay("week", domain, 900);
    expect(density * domain.days).toBeLessThanOrEqual(MAX_TIMELINE_WIDTH);
    const ticks = buildTicks(domain, density);
    expect(ticks.top.length).toBeLessThan(600);
    expect(ticks.bottom.length).toBeLessThan(600);
    expect(computeDomain([], today).days).toBeGreaterThan(0);
  });
});