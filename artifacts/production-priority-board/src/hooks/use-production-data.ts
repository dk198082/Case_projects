import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getProductionPriority,
  type ProductionPriorityResponse,
} from "@workspace/api-client-react";
import type {
  DataQuality,
  ProductionOrder,
} from "../lib/mock-data";
import { isCalendarDatePastDue } from "../lib/date-utils";

export type BoardFilter =
  | "All Active"
  | "Started"
  | "Released"
  | "Past Due";

export type SortKey =
  | "priority"
  | "buildEndDate"
  | "salesShipDate"
  | "workOrder"
  | "customer";

export type PrioritySnapshot = ProductionPriorityResponse;
type TeamOrder = Pick<ProductionOrder, "SC3" | "status" | "workOrderQty">;
type GroupedTeamOrder = Pick<
  ProductionOrder,
  "SC1" | "SC3" | "status" | "workOrderQty"
>;
type GroupOrder = Pick<ProductionOrder, "SC1" | "status" | "workOrderQty">;

const emptyDataQuality: DataQuality = {
  machineRows: 0,
  validWorkOrders: 0,
  duplicateWorkOrders: 0,
  linkedOrders: 0,
  populatedSalesOrders: 0,
  validatedSalesOrderLinks: 0,
  partialLinkages: 0,
  unlinkedOrders: 0,
  futureDemand: 0,
  futureDemandAlreadyLinked: 0,
  invalidSC3: 0,
  invalidDates: 0,
};

const emptySnapshot: PrioritySnapshot = {
  orders: [],
  demand: [],
  dataQuality: emptyDataQuality,
  dataAsOf: "",
};

const queryKey = ["production-priority"] as const;
const sc3StorageKey = "sc3-team-all-default";

const byDateThenWorkOrder = (
  left: ProductionOrder,
  right: ProductionOrder,
  key: "buildEndDate" | "salesShipDate",
): number => {
  const leftDate = left[key]
    ? new Date(left[key]).getTime()
    : Number.POSITIVE_INFINITY;
  const rightDate = right[key]
    ? new Date(right[key]).getTime()
    : Number.POSITIVE_INFINITY;

  return (
    leftDate - rightDate ||
    (key === "buildEndDate"
      ? byDateThenWorkOrder(left, right, "salesShipDate")
      : left.workOrder.localeCompare(right.workOrder))
  );
};

const toProductionOrder = (order: ProductionPriorityResponse["orders"][number]): ProductionOrder => ({
  ...order,
  sourceMachine: {},
  sourceRelated: undefined,
});

export function usePrioritySnapshot() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey,
    queryFn: () => getProductionPriority(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const refresh = async () => {
    try {
      await queryClient.fetchQuery({
        queryKey,
        queryFn: () => getProductionPriority({ refresh: true }),
        staleTime: 0,
      });
    } catch {
      // The query owns the error state; keep the previously loaded snapshot visible.
    }
  };

  return {
    snapshot: query.data ?? emptySnapshot,
    hasLiveData: query.data !== undefined,
    refresh,
    isRefreshing: query.isFetching && !query.isLoading,
    isLoading: query.isLoading,
    error: query.error,
  };
}

const readStoredSelections = (
  value: string | null,
  availableValues: ReadonlySet<string>,
) => {
  if (!value) return null;
  if (value === "ALL") return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is string =>
          typeof item === "string" && availableValues.has(item),
      );
    }
  } catch {
    // Support the previous single-value session storage format.
  }

  return availableValues.has(value) ? [value] : null;
};

export const resolveSessionSC3Selection = (
  storedValue: string | null,
  orders: TeamOrder[],
) => {
  const availableTeams = new Set(
    orders.map((order) => order.SC3).filter(Boolean),
  );
  return readStoredSelections(storedValue, availableTeams) ?? [];
};

export const toggleClassificationSelection = (
  current: string[],
  value: string,
  additive: boolean,
) => {
  if (!additive) return [value];
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
};

export const matchesClassificationSelections = (
  order: Pick<ProductionOrder, "SC1" | "SC3">,
  selectedSC1: string[],
  selectedSC3: string[],
) =>
  (!selectedSC1.length || selectedSC1.includes(order.SC1)) &&
  (!selectedSC3.length || selectedSC3.includes(order.SC3));

export function useSessionSC3(orders: TeamOrder[]) {
  const [selectedSC3, setSelectedSC3] = useState<string[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    if (!orders.length) return;

    const availableTeams = new Set(orders.map((order) => order.SC3).filter(Boolean));
    if (!hasInitialized) {
      setSelectedSC3(
        resolveSessionSC3Selection(
          sessionStorage.getItem(sc3StorageKey),
          orders,
        ),
      );
      setHasInitialized(true);
      return;
    }

    setSelectedSC3((current) =>
      current.length
        ? current.filter((team) => availableTeams.has(team))
        : current,
    );
  }, [hasInitialized, orders]);

  useEffect(() => {
    if (hasInitialized) {
      sessionStorage.setItem(sc3StorageKey, JSON.stringify(selectedSC3));
    }
  }, [hasInitialized, selectedSC3]);

  return { selectedSC3, setSelectedSC3 };
}

export function useSC3Teams(orders: TeamOrder[]) {
  return useMemo(
    () => Array.from(new Set(orders.map((order) => order.SC3).filter(Boolean))).sort(),
    [orders],
  );
}

export function useSC3Counts(orders: TeamOrder[]) {
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const order of orders) {
      if (!order.SC3) continue;
      counts.set(
        order.SC3,
        (counts.get(order.SC3) ?? 0) + workOrderQuantity(order),
      );
    }
    return counts;
  }, [orders]);
}

const getDefaultSC1 = (orders: GroupOrder[]) => {
  const counts = new Map<string, number>();
  for (const order of orders) {
    if (!order.SC1) continue;
    counts.set(order.SC1, (counts.get(order.SC1) ?? 0) + 1);
  }

  return [...counts.entries()].sort(
    ([groupA, countA], [groupB, countB]) =>
      countB - countA || groupA.localeCompare(groupB),
  )[0]?.[0] ?? "ALL";
};

export function useSessionSC1(orders: GroupOrder[]) {
  const [selectedSC1, setSelectedSC1] = useState<string[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    if (!orders.length) return;

    const availableGroups = new Set(orders.map((order) => order.SC1).filter(Boolean));
    if (!hasInitialized) {
      const storedGroups = readStoredSelections(
        sessionStorage.getItem("sc1-group"),
        availableGroups,
      );
      setSelectedSC1(storedGroups ?? []);
      setHasInitialized(true);
      return;
    }

    setSelectedSC1((current) =>
      current.length
        ? current.filter((group) => availableGroups.has(group))
        : current,
    );
  }, [hasInitialized, orders]);

  useEffect(() => {
    if (hasInitialized) {
      sessionStorage.setItem("sc1-group", JSON.stringify(selectedSC1));
    }
  }, [hasInitialized, selectedSC1]);

  return { selectedSC1, setSelectedSC1 };
}

export function useSC1Groups(orders: GroupOrder[]) {
  return useMemo(
    () => Array.from(new Set(orders.map((order) => order.SC1).filter(Boolean))).sort(),
    [orders],
  );
}

export function useSC1Counts(orders: GroupOrder[]) {
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const order of orders) {
      if (!order.SC1) continue;
      counts.set(
        order.SC1,
        (counts.get(order.SC1) ?? 0) + workOrderQuantity(order),
      );
    }
    return counts;
  }, [orders]);
}

/** SC3 teams belonging to the selected SC1 groups (empty means every group). */
export function useSC3TeamsForGroup(
  orders: GroupedTeamOrder[],
  sc1: string[],
) {
  return useMemo(() => {
    const selectedGroups = new Set(sc1);
    const scoped = selectedGroups.size
      ? orders.filter((order) => selectedGroups.has(order.SC1))
      : orders;
    return Array.from(new Set(scoped.map((order) => order.SC3).filter(Boolean))).sort();
  }, [orders, sc1]);
}

export function useProductionData(
  allOrders: ProductionPriorityResponse["orders"],
  sc3: string[],
  search: string,
  sortBy: SortKey = "priority",
  filter: BoardFilter = "All Active",
  sc1: string[] = [],
) {
  const data = useMemo(() => allOrders.map(toProductionOrder), [allOrders]);

  return useMemo(() => {
    let result = data;

    if (sc1.length || sc3.length) {
      result = result.filter((order) =>
        matchesClassificationSelections(order, sc1, sc3),
      );
    }

    const normalizedSearch = search.trim().toLowerCase();
    if (normalizedSearch) {
      result = result.filter((order) =>
        [
          order.workOrder,
          order.salesOrder,
          order.customer,
        ].some((value) => value.toLowerCase().includes(normalizedSearch)),
      );
    }

    if (filter === "Past Due") {
      result = result.filter(
        (order) =>
          isCalendarDatePastDue(order.buildEndDate) ||
          isCalendarDatePastDue(order.salesShipDate),
      );
    } else if (filter !== "All Active") {
      result = result.filter((order) => order.status === filter.toUpperCase());
    }

    return [...result].sort((left, right) => {
      if (sortBy === "workOrder") return left.workOrder.localeCompare(right.workOrder);
      if (sortBy === "customer") return left.customer.localeCompare(right.customer);
      return byDateThenWorkOrder(left, right, sortBy === "salesShipDate" ? "salesShipDate" : "buildEndDate");
    });
  }, [data, filter, sc1, sc3, search, sortBy]);
}

const workOrderQuantity = (order: Pick<ProductionOrder, "workOrderQty">) =>
  Number.isFinite(order.workOrderQty) ? order.workOrderQty : 0;

export const sumWorkOrderQuantity = (
  orders: ReadonlyArray<Pick<ProductionOrder, "workOrderQty">>,
) => orders.reduce((total, order) => total + workOrderQuantity(order), 0);

type QuantityStatsOrder = Pick<
  ProductionOrder,
  "workOrderQty" | "status" | "buildEndDate"
>;

export const calculateWorkOrderQuantityStats = (
  orders: QuantityStatsOrder[],
) => ({
  totalActive: sumWorkOrderQuantity(orders),
  started: sumWorkOrderQuantity(
    orders.filter((order) => order.status === "STARTED"),
  ),
  released: sumWorkOrderQuantity(
    orders.filter((order) => order.status === "RELEASED"),
  ),
  buildPastDue: sumWorkOrderQuantity(
    orders.filter((order) => isCalendarDatePastDue(order.buildEndDate)),
  ),
});

export function useStats(orders: ProductionOrder[]) {
  return useMemo(() => calculateWorkOrderQuantityStats(orders), [orders]);
}

export function useDataQuality(snapshot: PrioritySnapshot) {
  return {
    dataQuality: snapshot.dataQuality,
    dataAsOf: snapshot.dataAsOf || "Live data loading",
  };
}

export const getExecutablePriority = (
  orders: ProductionOrder[],
  order: Pick<ProductionOrder, "workOrder">,
) => {
  const index = orders.findIndex((item) => item.workOrder === order.workOrder);
  return index >= 0 ? index + 1 : null;
};