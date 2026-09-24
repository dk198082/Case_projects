import { useMemo, useState } from "react";
import {
  type BoardFilter,
  toggleClassificationSelection,
  usePrioritySnapshot,
  useProductionData,
  useSC1Counts,
  useSC1Groups,
  useSC3Counts,
  useSC3TeamsForGroup,
  useSessionSC1,
  useSessionSC3,
  useStats,
} from "@/hooks/use-production-data";
import type { ProductionOrder } from "@/lib/mock-data";
import { formatCalendarDate, isCalendarDatePastDue } from "@/lib/date-utils";
import {
  applyProductionGridView,
  EMPTY_DATE_FILTERS,
  EMPTY_GRID_FILTERS,
  type GridColumnFilters,
  type GridColumnKey,
  type GridDateColumnKey,
  type GridDateFilters,
  type GridSort,
} from "@/lib/production-grid";
import { exportProductionGridToExcel } from "@/lib/export-production-grid";
import { OrderDetailsDialog } from "@/components/OrderDetailsDialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Clock3,
  Download,
  Filter,
  PauseCircle,
  LogOut,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const statusClass = (order: ProductionOrder) => {
  if (order.status === "STARTED") return "border-primary/35 bg-primary/10 text-primary";
  if (order.status === "RELEASED") return "border-sky-300/25 bg-sky-300/10 text-sky-200";
  return "border-border bg-muted/50 text-muted-foreground";
};

const kpiTone = (tone: "default" | "good" | "warning" | "danger") =>
  ({
    default: "text-foreground",
    good: "text-primary",
    warning: "text-amber-200",
    danger: "text-red-300",
  })[tone];

function Kpi({
  label,
  value,
  tone = "default",
  filter,
  selected,
  onSelect,
}: {
  label: string;
  value: number;
  tone?: "default" | "good" | "warning" | "danger";
  filter: BoardFilter;
  selected: boolean;
  onSelect: (filter: BoardFilter) => void;
}) {
  return (
    <button
      type="button"
      data-testid={`kpi-filter-${filter.toLowerCase().replace(/ /g, "-")}`}
      aria-pressed={selected}
      aria-label={`${filter} filter`}
      onClick={() => onSelect(filter)}
      className={cn(
        "min-w-[128px] cursor-pointer rounded-sm border px-3 py-2 text-left transition-all duration-150",
        "border-border/80 bg-background/20 hover:-translate-y-px hover:border-primary/70 hover:bg-primary/10 hover:shadow-[0_0_16px_rgba(183,255,0,.1)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        selected && "border-primary bg-primary text-[#00281D] shadow-[0_0_20px_rgba(183,255,0,.2)] ring-1 ring-primary/60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={cn(
          "font-mono text-[9px] font-medium uppercase tracking-[0.13em]",
          selected ? "text-[#00281D]/75" : "text-muted-foreground",
        )}>
          {label}
        </p>
        <Filter className={cn("h-3 w-3 shrink-0", selected ? "text-[#00281D]" : "text-muted-foreground")} aria-hidden="true" />
      </div>
      <p className={cn(
        "mt-1 font-mono text-xl font-bold leading-none tabular-nums",
        selected ? "text-[#00281D]" : kpiTone(tone),
      )}>
        {value}
      </p>
    </button>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const isEmbedded =
    typeof window !== "undefined" && window.self !== window.top;
  const { snapshot, isLoading, error } = usePrioritySnapshot();
  const { selectedSC1, setSelectedSC1 } = useSessionSC1(snapshot.orders);
  const groups = useSC1Groups(snapshot.orders);
  const groupCounts = useSC1Counts(snapshot.orders);
  const groupScopedOrders = useMemo(
    () => {
      if (!selectedSC1.length) return snapshot.orders;
      const selectedGroups = new Set(selectedSC1);
      return snapshot.orders.filter((order) =>
        selectedGroups.has(order.SC1),
      );
    },
    [snapshot.orders, selectedSC1],
  );
  const { selectedSC3, setSelectedSC3 } =
    useSessionSC3(groupScopedOrders);
  const teams = useSC3TeamsForGroup(snapshot.orders, selectedSC1);
  const teamCounts = useSC3Counts(groupScopedOrders);
  const [filter, setFilter] = useState<BoardFilter>("All Active");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<ProductionOrder | null>(null);
  const [columnFilters, setColumnFilters] =
    useState<GridColumnFilters>(EMPTY_GRID_FILTERS);
  const [dateFilters, setDateFilters] =
    useState<GridDateFilters>(EMPTY_DATE_FILTERS);
  const [activeFilterColumn, setActiveFilterColumn] =
    useState<GridColumnKey | null>(null);
  const [gridSort, setGridSort] = useState<GridSort>({
    key: "priority",
    direction: "asc",
  });
  const [isExporting, setIsExporting] = useState(false);

  const handleSelectGroup = (group: string, additive: boolean) => {
    setSelectedSC1((current) =>
      toggleClassificationSelection(current, group, additive),
    );
    setSelectedSC3([]);
  };

  const handleSelectTeam = (team: string, additive: boolean) => {
    setSelectedSC3((current) =>
      toggleClassificationSelection(current, team, additive),
    );
  };

  const scopedOrders = useProductionData(
    snapshot.orders,
    selectedSC3,
    search,
    "priority",
    "All Active",
    selectedSC1,
  );
  const baseOrders = useProductionData(
    snapshot.orders,
    selectedSC3,
    search,
    "priority",
    filter,
    selectedSC1,
  );
  const priorityById = useMemo(
    () => new Map(baseOrders.map((order, index) => [order.id, index + 1])),
    [baseOrders],
  );
  const orders = useMemo(
    () =>
      applyProductionGridView(
        baseOrders,
        priorityById,
        columnFilters,
        gridSort,
        dateFilters,
      ),
    [baseOrders, columnFilters, dateFilters, gridSort, priorityById],
  );
  const hasColumnFilters =
    Object.values(columnFilters).some((value) => value.trim()) ||
    Object.values(dateFilters).some(({ from, to }) => from || to);

  const updateColumnFilter = (key: GridColumnKey, value: string) => {
    setColumnFilters((current) => ({ ...current, [key]: value }));
  };

  const updateDateFilter = (
    key: GridDateColumnKey,
    bound: "from" | "to",
    value: string,
  ) => {
    setDateFilters((current) => ({
      ...current,
      [key]: { ...current[key], [bound]: value },
    }));
  };

  const clearColumnFilters = () => {
    setColumnFilters(EMPTY_GRID_FILTERS);
    setDateFilters(EMPTY_DATE_FILTERS);
    setActiveFilterColumn(null);
  };

  const toggleGridSort = (key: GridColumnKey) => {
    setGridSort((current) =>
      current.key === key
        ? {
            key,
            direction: current.direction === "asc" ? "desc" : "asc",
          }
        : { key, direction: "asc" },
    );
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportProductionGridToExcel(orders, priorityById);
    } finally {
      setIsExporting(false);
    }
  };

  const SortIcon = ({ column }: { column: GridColumnKey }) => {
    if (gridSort.key !== column) {
      return <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden="true" />;
    }
    return gridSort.direction === "asc" ? (
      <ArrowUp className="h-3 w-3 text-primary" aria-hidden="true" />
    ) : (
      <ArrowDown className="h-3 w-3 text-primary" aria-hidden="true" />
    );
  };

  const sortableHead = (
    column: GridColumnKey,
    label: string,
    className: string,
    placeholder = label,
  ) => (
    <TableHead className={cn("align-top", className)}>
      <div className="flex min-h-8 w-full items-center gap-1">
        <button
          type="button"
          data-testid={`filter-trigger-${column}`}
          onClick={() => setActiveFilterColumn(column)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-mono text-[10px] uppercase tracking-wider transition-colors hover:text-primary"
          aria-label={`Filter by ${label}`}
          aria-expanded={activeFilterColumn === column}
        >
          <span>{label}</span>
          {columnFilters[column].trim() ||
          (column in dateFilters &&
            (dateFilters[column as GridDateColumnKey].from ||
              dateFilters[column as GridDateColumnKey].to)) ? (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
              aria-label={`${label} filter active`}
            />
          ) : null}
        </button>
        <button
          type="button"
          data-testid={`sort-${column}`}
          onClick={() => toggleGridSort(column)}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-primary"
          aria-label={`Sort by ${label}`}
        >
          <SortIcon column={column} />
        </button>
      </div>
      {activeFilterColumn === column && (
        <div className="relative pb-2">
          {column in dateFilters ? (
            <div className="grid gap-1 pr-6">
              <label className="grid gap-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                From
                <Input
                  type="date"
                  data-testid={`filter-${column}-from`}
                  value={dateFilters[column as GridDateColumnKey].from}
                  onChange={(event) =>
                    updateDateFilter(
                      column as GridDateColumnKey,
                      "from",
                      event.target.value,
                    )
                  }
                  aria-label={`Filter ${label} from date`}
                  className="date-filter-input h-7 min-w-[118px] border-white/15 bg-black/20 px-1.5 font-mono text-[9px] normal-case tracking-normal text-foreground [color-scheme:dark] focus-visible:ring-primary"
                />
              </label>
              <label className="grid gap-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                To
                <Input
                  type="date"
                  data-testid={`filter-${column}-to`}
                  value={dateFilters[column as GridDateColumnKey].to}
                  onChange={(event) =>
                    updateDateFilter(
                      column as GridDateColumnKey,
                      "to",
                      event.target.value,
                    )
                  }
                  aria-label={`Filter ${label} to date`}
                  className="date-filter-input h-7 min-w-[118px] border-white/15 bg-black/20 px-1.5 font-mono text-[9px] normal-case tracking-normal text-foreground [color-scheme:dark] focus-visible:ring-primary"
                />
              </label>
            </div>
          ) : (
            <Input
              autoFocus
              data-testid={`filter-${column}`}
              value={columnFilters[column]}
              onChange={(event) =>
                updateColumnFilter(column, event.target.value)
              }
              placeholder={placeholder}
              aria-label={`Filter ${label}`}
              className="h-7 min-w-0 border-white/15 bg-black/20 px-2 pr-7 font-mono text-[10px] normal-case tracking-normal text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-primary"
            />
          )}
          <button
            type="button"
            data-testid={`button-close-filter-${column}`}
            onClick={() => setActiveFilterColumn(null)}
            aria-label={`Close ${label} filter`}
            className="absolute right-0 top-0 inline-flex h-7 w-6 items-center justify-center text-muted-foreground transition-colors hover:text-primary"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      )}
    </TableHead>
  );

  const stats = useStats(scopedOrders);
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      
      {!isEmbedded && (
        <header className="border-b border-border/70 bg-card/55 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_14px_rgba(183,255,0,.85)]" />
              <h1 className="font-mono text-base font-bold tracking-[0.08em] text-primary sm:text-lg">
                PRODUCTION PRIORITY BOARD
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="min-w-0 text-right">
              <p className="truncate text-xs font-medium text-foreground">
                {user?.displayName}
              </p>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                {user?.role === "editor" ? "Read / write" : "Read only"}
              </p>
            </div>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                Sign out
              </button>
            </form>
          </div>
        </div>
       </header>
     )}
      <main className="mx-auto max-w-[1800px] px-4 py-4 md:px-6">
        {error && (
          <section
            role="alert"
            className="mb-4 rounded-sm border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            Live Azure data could not be loaded. Check the API connection and try again shortly.
          </section>
        )}

        {isLoading && (
          <section className="mb-4 rounded-sm border border-primary/30 bg-primary/5 px-4 py-3 font-mono text-xs text-primary">
            Loading live Azure PostgreSQL production data…
          </section>
        )}

        <section aria-label="Sales classification group selector" className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Group (Sales classification 1)
            </span>
            <span className="h-px flex-1 bg-border/60" />
          </div>
          <div className="flex flex-wrap gap-2 pb-1">
            <button
              type="button"
              onClick={() => {
                setSelectedSC1([]);
                setSelectedSC3([]);
              }}
              aria-pressed={selectedSC1.length === 0}
              className={cn(
                "whitespace-nowrap rounded-sm border px-3 py-2 font-mono text-xs transition-colors",
                selectedSC1.length === 0
                  ? "border-primary bg-primary text-[#00281D] shadow-[0_0_18px_rgba(183,255,0,.12)]"
                  : "border-border bg-card/45 text-muted-foreground hover:border-primary/45 hover:text-primary",
              )}
            >
              All groups <span className="ml-1 opacity-70">{snapshot.orders.length}</span>
            </button>
            {groups.map((group) => (
              <button
                type="button"
                key={group}
                onClick={(event) =>
                  handleSelectGroup(
                    group,
                    event.ctrlKey || event.metaKey,
                  )
                }
                aria-pressed={selectedSC1.includes(group)}
                title="Ctrl/Cmd-click to select multiple"
                className={cn(
                  "whitespace-nowrap rounded-sm border px-3 py-2 font-mono text-xs transition-colors",
                  selectedSC1.includes(group)
                    ? "border-primary bg-primary text-[#00281D] shadow-[0_0_18px_rgba(183,255,0,.12)]"
                    : "border-border bg-card/45 text-muted-foreground hover:border-primary/45 hover:text-primary",
                )}
              >
                {group} <span className="ml-1 opacity-70">{groupCounts.get(group) ?? 0}</span>
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Machine team selector" className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Machine Type (Sales Classification 3)
            </span>
            <span className="h-px flex-1 bg-border/60" />
          </div>
          <div className="flex flex-wrap gap-2 pb-1">
            <button
              type="button"
              onClick={() => setSelectedSC3([])}
              aria-pressed={selectedSC3.length === 0}
              className={cn(
                "whitespace-nowrap rounded-sm border px-3 py-2 font-mono text-xs transition-colors",
                selectedSC3.length === 0
                  ? "border-primary bg-primary text-[#00281D] shadow-[0_0_18px_rgba(183,255,0,.12)]"
                  : "border-border bg-card/45 text-muted-foreground hover:border-primary/45 hover:text-primary",
              )}
            >
              All <span className="ml-1 opacity-70">{groupScopedOrders.length}</span>
            </button>
            {teams.map((team) => (
              <button
                type="button"
                key={team}
                onClick={(event) =>
                  handleSelectTeam(
                    team,
                    event.ctrlKey || event.metaKey,
                  )
                }
                aria-pressed={selectedSC3.includes(team)}
                title="Ctrl/Cmd-click to select multiple"
                className={cn(
                  "whitespace-nowrap rounded-sm border px-3 py-2 font-mono text-xs transition-colors",
                  selectedSC3.includes(team)
                    ? "border-primary bg-primary text-[#00281D] shadow-[0_0_18px_rgba(183,255,0,.12)]"
                    : "border-border bg-card/45 text-muted-foreground hover:border-primary/45 hover:text-primary",
                )}
              >
                {team} <span className="ml-1 opacity-70">{teamCounts.get(team) ?? 0}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mb-4 overflow-x-auto rounded-sm border border-border/70 bg-card/40 py-3 pl-0 pr-3">
          <div className="flex min-w-max items-center justify-between gap-4">
            <div className="flex items-stretch gap-2">
            <Kpi
              label="All"
              value={stats.totalActive}
              filter="All Active"
              selected={filter === "All Active"}
              onSelect={setFilter}
            />
            <Kpi
              label="Started"
              value={stats.started}
              tone="good"
              filter="Started"
              selected={filter === "Started"}
              onSelect={setFilter}
            />
            <Kpi
              label="Released"
              value={stats.released}
              filter="Released"
              selected={filter === "Released"}
              onSelect={setFilter}
            />
            <Kpi
              label="Build date past due"
              value={stats.buildPastDue}
              tone="danger"
              filter="Past Due"
              selected={filter === "Past Due"}
              onSelect={setFilter}
            />
            </div>
            <p
              data-testid="text-grid-row-count"
              className="shrink-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
            >
              {orders.length} of {baseOrders.length} work orders
            </p>
            <div className="relative w-[210px] shrink-0">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                data-testid="input-queue-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="WO, SO, customer"
                className="h-8 border-border bg-background pl-8 font-mono text-[11px]"
              />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {hasColumnFilters && (
                <button
                  type="button"
                  data-testid="button-clear-column-filters"
                  onClick={clearColumnFilters}
                  className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-border px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Clear filters
                </button>
              )}
              <button
                type="button"
                data-testid="button-export-excel"
                onClick={handleExport}
                disabled={isExporting || orders.length === 0}
                className="inline-flex h-8 items-center gap-2 rounded-sm bg-primary px-3 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[#00281D] transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                {isExporting ? "Exporting…" : "Export to Excel"}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4">
          <div className="min-w-0 overflow-hidden rounded-sm border border-border/70 bg-card/30">
            <div className="overflow-auto">
              <Table className="min-w-[1290px]">
                <TableHeader className="sticky top-0 z-10 bg-[#07392b]">
                  <TableRow className="border-border/80 hover:bg-transparent">
                    {sortableHead("priority", "Priority", "w-[74px]")}
                    {sortableHead("workOrder", "Work order", "w-[120px]")}
                    {sortableHead("part", "Part number / Description", "w-[190px]", "Part or description")}
                    {sortableHead("salesOrder", "Sales order", "w-[120px]")}
                    {sortableHead("customer", "Customer", "min-w-[230px]", "Customer or reference")}
                    {sortableHead("buildStartDate", "Build start", "w-[142px]")}
                    {sortableHead("buildEndDate", "Build end", "w-[142px]")}
                    {sortableHead("salesShipDate", "Ship date", "w-[142px]")}
                    {sortableHead("status", "Status", "w-[98px]")}
                    {sortableHead("productionGroup", "Production Group", "w-[120px]")}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-40 text-center font-mono text-xs text-muted-foreground">
                        No active work orders match the current view.
                      </TableCell>
                    </TableRow>
                  ) : (
                    orders.map((order) => {
                      const priority = priorityById.get(order.id);
                      const buildPastDue = isCalendarDatePastDue(order.buildEndDate);
                      return (
                        <TableRow
                          key={order.id}
                          onClick={() => setSelectedOrder(order)}
                          className={cn(
                            "cursor-pointer border-border/55 transition-colors hover:bg-white/[0.035]",
                            buildPastDue && "border-l-2 border-l-red-400 bg-red-500/[0.025]",
                          )}
                        >
                          <TableCell className="py-2">
                            <span className="font-mono text-lg font-bold leading-none text-primary">{priority}</span>
                          </TableCell>
                          <TableCell className="py-2">
                            <p className="font-mono text-sm font-bold text-foreground">{order.workOrder || "—"}</p>
                          </TableCell>
                          <TableCell className="py-2">
                            <p className="max-w-[190px] truncate font-mono text-xs font-semibold text-foreground">{order.itemNumber || "—"}</p>
                            <p className="mt-0.5 max-w-[190px] truncate text-[10px] text-muted-foreground">{order.description || "—"}</p>
                          </TableCell>
                          <TableCell className="py-2">
                            <p className="font-mono text-xs font-semibold text-foreground">
                              {order.salesOrder || "—"}
                            </p>
                          </TableCell>
                          <TableCell className="py-2">
                            <p className="max-w-[310px] truncate text-xs font-medium text-foreground">{order.customer}</p>
                            {order.customerPO && (
                              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                                Ref {order.customerPO}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="py-2">
                            <p className="font-mono text-xs">
                              {formatCalendarDate(order.buildStartDate)}
                            </p>
                          </TableCell>
                          <TableCell className="py-2">
                            <p className={cn("font-mono text-xs", buildPastDue && "font-bold text-red-300")}>
                               {formatCalendarDate(order.buildEndDate)}
                            </p>
                            {buildPastDue && <p className="mt-0.5 font-mono text-[9px] uppercase text-red-300">Past due</p>}
                          </TableCell>
                          <TableCell className="py-2">
                            <p className={cn("font-mono text-xs", isCalendarDatePastDue(order.salesShipDate) && "text-red-300")}>
                               {formatCalendarDate(order.salesShipDate)}
                            </p>
                          </TableCell>
                          <TableCell className="py-2">
                             <Badge
                               variant="outline"
                               className={cn("rounded-sm px-1.5 py-0 font-mono text-[9px]", statusClass(order))}
                             >
                              {order.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2">
                            <p className="font-mono text-xs">{order.productionGroup || "—"}</p>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>

      </main>

      <OrderDetailsDialog order={selectedOrder} onClose={() => setSelectedOrder(null)} />
    </div>
  );
}