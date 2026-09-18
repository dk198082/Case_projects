import { describe, expect, it } from "vitest";
import {
  matchesClassificationSelections,
  toggleClassificationSelection,
} from "@/hooks/use-production-data";

describe("classification multi-selection", () => {
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
});