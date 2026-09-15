import type { ProductionOrder } from "@/lib/mock-data";
import { formatCalendarDate } from "@/lib/date-utils";

export type GridColumnKey =
  | "priority"
  | "workOrder"
  | "part"
  | "customer"
  | "buildStartDate"
  | "buildEndDate"
  | "salesShipDate"
  | "status"
  | "productionGroup";

export type GridSort = {
  key: GridColumnKey;
  direction: "asc" | "desc";
};

export type GridColumnFilters = Record<GridColumnKey, string>;

export type GridDateColumnKey =
  | "buildStartDate"
  | "buildEndDate"
  | "salesShipDate";

export type GridDateFilters = Record<
  GridDateColumnKey,
  { from: string; to: string }
>;

export const EMPTY_GRID_FILTERS: GridColumnFilters = {
  priority: "",
  workOrder: "",
  part: "",
  customer: "",
  buildStartDate: "",
  buildEndDate: "",
  salesShipDate: "",
  status: "",
  productionGroup: "",
};

export const EMPTY_DATE_FILTERS: GridDateFilters = {
  buildStartDate: { from: "", to: "" },
  buildEndDate: { from: "", to: "" },
  salesShipDate: { from: "", to: "" },
};

const normalized = (value: unknown) =>
  String(value ?? "").trim().toLocaleLowerCase();

const columnText = (
  order: ProductionOrder,
  key: GridColumnKey,
  priorityById: ReadonlyMap<string, number>,
) => {
  switch (key) {
    case "priority":
      return String(priorityById.get(order.id) ?? "");
    case "workOrder":
      return order.workOrder;
    case "part":
      return `${order.itemNumber} ${order.description}`;
    case "customer":
      return `${order.customer} ${order.salesOrder} ${order.customerPO}`;
    case "buildStartDate":
      return `${order.buildStartDate} ${formatCalendarDate(order.buildStartDate)}`;
    case "buildEndDate":
      return `${order.buildEndDate} ${formatCalendarDate(order.buildEndDate)}`;
    case "salesShipDate":
      return `${order.salesShipDate} ${formatCalendarDate(order.salesShipDate)}`;
    case "status":
      return order.status;
    case "productionGroup":
      return `${order.productionGroup} ${order.productionGroupName}`;
  }
};

const compareText = (left: string, right: string) =>
  left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });

export function applyProductionGridView(
  orders: ProductionOrder[],
  priorityById: ReadonlyMap<string, number>,
  filters: GridColumnFilters,
  sort: GridSort,
  dateFilters: GridDateFilters = EMPTY_DATE_FILTERS,
) {
  const activeFilters = Object.entries(filters).filter(([, value]) =>
    value.trim(),
  ) as [GridColumnKey, string][];

  const filtered = activeFilters.length
    ? orders.filter((order) =>
        activeFilters.every(([key, value]) =>
          normalized(columnText(order, key, priorityById)).includes(
            normalized(value),
          ),
        ),
      )
    : orders;

  const dateFiltered = filtered.filter((order) =>
    (Object.entries(dateFilters) as [
      GridDateColumnKey,
      { from: string; to: string },
    ][]).every(([key, range]) => {
      const value = order[key];
      if (range.from && (!value || value < range.from)) return false;
      if (range.to && (!value || value > range.to)) return false;
      return true;
    }),
  );

  return [...dateFiltered].sort((left, right) => {
    const direction = sort.direction === "asc" ? 1 : -1;
    if (sort.key === "priority") {
      return (
        ((priorityById.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (priorityById.get(right.id) ?? Number.MAX_SAFE_INTEGER)) *
        direction
      );
    }

    const compared = compareText(
      columnText(left, sort.key, priorityById),
      columnText(right, sort.key, priorityById),
    );
    return (
      compared * direction ||
      (priorityById.get(left.id) ?? 0) -
        (priorityById.get(right.id) ?? 0)
    );
  });
}
