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
type TeamOrder = Pick<ProductionOrder, "SC3" | "status">;
type GroupedTeamOrder = Pick<ProductionOrder, "SC1" | "SC3" | "status">;
type GroupOrder = Pick<ProductionOrder, "SC1" | "status">;

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

const getDefaultSC3 = (orders: TeamOrder[]) => {
  const counts = new Map<string, number>();
  for (const order of orders) {
    if (!order.SC3) continue;
    counts.set(order.SC3, (counts.get(order.SC3) ?? 0) + 1);
  }

  return [...counts.entries()].sort(
    ([teamA, countA], [teamB, countB]) =>
      countB - countA || teamA.localeCompare(teamB),
  )[0]?.[0] ?? "";
};

export function useSessionSC3(orders: TeamOrder[]) {
  const [selectedSC3, setSelectedSC3] = useState("");

  useEffect(() => {
    if (!orders.length) return;

    const storedTeam = sessionStorage.getItem("sc3-team");
    const availableTeams = new Set(orders.map((order) => order.SC3).filter(Boolean));
    const nextTeam = storedTeam === "ALL" || (storedTeam && availableTeams.has(storedTeam))
      ? storedTeam
      : getDefaultSC3(orders);

    setSelectedSC3((current) => current || nextTeam);
  }, [orders]);

  useEffect(() => {
    if (selectedSC3) sessionStorage.setItem("sc3-team", selectedSC3);
  }, [selectedSC3]);

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
      counts.set(order.SC3, (counts.get(order.SC3) ?? 0) + 1);
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
  const [selectedSC1, setSelectedSC1] = useState("");

  useEffect(() => {
    if (!orders.length) return;

    const storedGroup = sessionStorage.getItem("sc1-group");
    const availableGroups = new Set(orders.map((order) => order.SC1).filter(Boolean));
    const nextGroup = storedGroup === "ALL" || (storedGroup && availableGroups.has(storedGroup))
      ? storedGroup
      : "ALL";

    setSelectedSC1((current) => current || nextGroup);
  }, [orders]);

  useEffect(() => {
    if (selectedSC1) sessionStorage.setItem("sc1-group", selectedSC1);
  }, [selectedSC1]);

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
      counts.set(order.SC1, (counts.get(order.SC1) ?? 0) + 1);
    }
    return counts;
  }, [orders]);
}

/** SC3 teams that belong to the given SC1 group ("ALL" returns every team). */
export function useSC3TeamsForGroup(orders: GroupedTeamOrder[], sc1: string) {
  return useMemo(() => {
    const scoped = sc1 && sc1 !== "ALL" ? orders.filter((order) => order.SC1 === sc1) : orders;
    return Array.from(new Set(scoped.map((order) => order.SC3).filter(Boolean))).sort();
  }, [orders, sc1]);
}

export function useProductionData(
  allOrders: ProductionPriorityResponse["orders"],
  sc3: string,
  search: string,
  sortBy: SortKey = "priority",
  filter: BoardFilter = "All Active",
  sc1: string = "ALL",
) {
  const data = useMemo(() => allOrders.map(toProductionOrder), [allOrders]);

  return useMemo(() => {
    let result = data;

    if (sc1 && sc1 !== "ALL") {
      result = result.filter((order) => order.SC1 === sc1);
    }

    if (sc3 && sc3 !== "ALL") {
      result = result.filter((order) => order.SC3 === sc3);
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

export function useStats(orders: ProductionOrder[]) {
  return useMemo(
    () => ({
      totalActive: orders.length,
      started: orders.filter((order) => order.status === "STARTED").length,
      released: orders.filter((order) => order.status === "RELEASED").length,
      buildPastDue: orders.filter((order) => isCalendarDatePastDue(order.buildEndDate)).length,
    }),
    [orders],
  );
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