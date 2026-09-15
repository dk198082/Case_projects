import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readDocument = (name: string) =>
  readFileSync(resolve(process.cwd(), "public/documents", name), "utf8");

describe("downloadable production documents", () => {
  it("includes the requirements review content", () => {
    const document = readDocument("production-priority-requirements-review.html");

    expect(document).toContain("Production Priority Board requirements review");
    expect(document).toContain("Source, scope &amp; architecture");
    expect(document).toContain("Capacity-planning boundary");
  });

  it("includes the dataflow source inventory and calculation sections", () => {
    const document = readDocument("production-priority-dataflow.html");

    expect(document).toContain("d365fo.vw_salesprodmachines365");
    expect(document).toContain("d365fo.salesorderheaderv3staging");
    expect(document).toContain("d365fo.salesorderlinev2staging");
    expect(document).toContain("d365fo.prodproductionorderheaderstaging");
    expect(document).toContain("Executable priority number");
    expect(document).toContain("Capacity and utilization");
  });
});