import { describe, expect, it } from "vitest";
import type { ProductionOrder } from "@/lib/mock-data";
import {
  applyProductionGridView,
  EMPTY_DATE_FILTERS,
  EMPTY_GRID_FILTERS,
} from "@/lib/production-grid";

const order = (
  id: string,
  values: Partial<ProductionOrder>,
): ProductionOrder =>
  ({
    id,
    workOrder: "",
    salesOrder: "",
    customer: "",
    customerPO: "",
    itemNumber: "",
    description: "",
    SC1: "",
    SC2: "",
    SC3: "",
    buildStartDate: "",
    buildEndDate: "",
    salesShipDate: "",
    createdDate: "",
    requestedDate: "",
    status: "",
    currentStage: "",
    resource: "",
    rawResource: "",
    productionGroup: "",
    productionGroupName: "",
    destination: "",
    country: "",
    salesperson: "",
    customerReference: "",
    exceptionFlags: [],
    linkageStatus: "Linked",
    linkageAudit: {
      salesOrder: "",
      company: "",
      itemNumber: "",
      inventoryLotDemandId: "",
      salesHeaderMatched: true,
      salesLineMatched: true,
      productionDemandMatched: true,
    },
    salesOrderLines: [],
    sourceMachine: {},
    ...values,
  }) as ProductionOrder;

const orders = [
  order("1", {
    workOrder: "WO-10",
    itemNumber: "PART-B",
    customer: "Beta",
    buildEndDate: "2026-09-20",
    status: "RELEASED",
  }),
  order("2", {
    workOrder: "WO-2",
    itemNumber: "PART-A",
    customer: "Acme",
    buildEndDate: "2026-09-12",
    status: "STARTED",
  }),
];
const priorities = new Map([
  ["1", 1],
  ["2", 2],
]);

describe("applyProductionGridView", () => {
  it("filters every active column and keeps the original priority", () => {
    const result = applyProductionGridView(
      orders,
      priorities,
      { ...EMPTY_GRID_FILTERS, customer: "acme", status: "start" },
      { key: "priority", direction: "asc" },
    );

    expect(result.map((item) => item.id)).toEqual(["2"]);
    expect(priorities.get(result[0]?.id ?? "")).toBe(2);
  });

  it("sorts text naturally in either direction", () => {
    expect(
      applyProductionGridView(
        orders,
        priorities,
        EMPTY_GRID_FILTERS,
        { key: "workOrder", direction: "asc" },
      ).map((item) => item.workOrder),
    ).toEqual(["WO-2", "WO-10"]);

    expect(
      applyProductionGridView(
        orders,
        priorities,
        EMPTY_GRID_FILTERS,
        { key: "buildEndDate", direction: "desc" },
      ).map((item) => item.id),
    ).toEqual(["1", "2"]);
  });

  it("filters date columns with inclusive from and to bounds", () => {
    const result = applyProductionGridView(
      orders,
      priorities,
      EMPTY_GRID_FILTERS,
      { key: "priority", direction: "asc" },
      {
        ...EMPTY_DATE_FILTERS,
        buildEndDate: { from: "2026-09-13", to: "2026-09-21" },
      },
    );

    expect(result.map((item) => item.id)).toEqual(["1"]);
  });
});
