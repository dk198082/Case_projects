import workbookData from "../workbook-data.json";

type RawSheet = {
  headers: string[];
  rows: Record<string, string>[];
  headerRow: number;
};

type Workbook = {
  sourceFile: string;
  sourceSheets: {
    "Machine Work Orders": RawSheet;
    "Related order details": RawSheet;
  };
};

const source = workbookData as Workbook;
const machineRows = source.sourceSheets["Machine Work Orders"].rows;
const relatedRows = source.sourceSheets["Related order details"].rows;

export type ProductionStatus = "STARTED" | "RELEASED" | string;

export type ProductionOrder = {
  id: string;
  workOrder: string;
  salesOrder: string;
  customer: string;
  customerPO: string;
  itemNumber: string;
  description: string;
  SC1: string;
  SC2: string;
  SC3: string;
  buildStartDate: string;
  buildEndDate: string;
  salesShipDate: string;
  createdDate: string;
  requestedDate: string;
  status: ProductionStatus;
  currentStage: string;
  resource: string;
  rawResource: string;
  productionGroup: string;
  productionGroupName: string;
  destination: string;
  country: string;
  salesperson: string;
  customerReference: string;
  exceptionFlags: string[];
  linkageStatus: "Linked" | "Unlinked" | "Partial";
  linkageAudit: {
    salesOrder: string;
    company: string;
    itemNumber: string;
    inventoryLotDemandId: string;
    salesHeaderMatched: boolean;
    salesLineMatched: boolean;
    productionDemandMatched: boolean;
  };
  salesOrderLines: SalesOrderLine[];
  sourceMachine: Record<string, string>;
  sourceRelated?: Record<string, string>;
};

export type SalesOrderLine = {
  line: string;
  item: string;
  description: string;
  configuration: string;
  configName: string;
  qty: number | null;
  unit: string;
  reference: string;
  status: string;
};

export type FutureDemand = {
  id: string;
  salesOrder: string;
  customer: string;
  customerPO: string;
  itemNumber: string;
  description: string;
  SC1: string;
  SC3: string;
  requestedDate: string;
  salesShipDate: string;
  qty: number | null;
  status: "NO WORK ORDER";
  sourceRelated: Record<string, string>;
};

export type DataQuality = {
  machineRows: number;
  validWorkOrders: number;
  duplicateWorkOrders: number;
  linkedOrders: number;
  populatedSalesOrders: number;
  validatedSalesOrderLinks: number;
  partialLinkages: number;
  unlinkedOrders: number;
  futureDemand: number;
  futureDemandAlreadyLinked: number;
  invalidSC3: number;
  invalidDates: number;
};

const isPresent = (value: unknown) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const text = (value: unknown) => (isPresent(value) ? String(value).trim() : "");

const excelDateToIso = (value: unknown) => {
  const raw = text(value);
  if (!raw) return "";

  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 20000) {
    return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString();
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
};

const normalizeStatus = (value: unknown): ProductionStatus => {
  const raw = text(value).toLowerCase();
  if (raw.includes("started") || raw.includes("in progress")) return "STARTED";
  if (raw.includes("released")) return "RELEASED";
  return text(value).toUpperCase() || "—";
};

const parseResource = (rawResource: string) => {
  const segments = rawResource.split("/").map(text);
  const workOrder = segments.shift() ?? "";
  if (/^\d+$/.test(segments.at(-1) ?? "")) segments.pop();
  const statusPart = segments.pop() ?? "";
  const productionGroup =
    segments[0] === "W" && /^H-/i.test(segments[1] ?? "")
      ? `${segments[0]}/${segments[1]}`
      : text(segments[1]);
  const stageAndResource =
    segments[0] === "W" && /^H-/i.test(segments[1] ?? "")
      ? [`${segments.shift()}/${segments.shift()}`, ...segments]
      : segments;
  const [stage = "", resource = ""] = stageAndResource;
  return {
    workOrder: text(workOrder),
    currentStage: text(stage),
    resource: text(resource),
    productionGroup,
    status: normalizeStatus(statusPart),
  };
};

const today = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
};

const isPast = (iso: string) => {
  if (!iso) return false;
  return new Date(iso).getTime() < today();
};

const getExceptionFlags = ({
  currentStage,
  buildEndDate,
  salesShipDate,
  linkageStatus,
}: Pick<
  ProductionOrder,
  "currentStage" | "buildEndDate" | "salesShipDate" | "linkageStatus"
>) => {
  const buildPastDue = isPast(buildEndDate);
  const shipPastDue = isPast(salesShipDate);
  const flags: string[] = [];

  if (/\bhold\b/i.test(currentStage)) flags.push("HOLD");
  if (buildPastDue && shipPastDue) flags.push("BUILD & SHIP PAST DUE");
  else if (buildPastDue) flags.push("BUILD DATE PAST DUE");
  else if (shipPastDue) flags.push("SHIP DATE PAST DUE");
  if (!buildEndDate) flags.push("NO BUILD DATE");
  if (linkageStatus === "Unlinked") flags.push("UNLINKED");

  return flags;
};

const relatedBySalesOrder = new Map<string, Record<string, string>[]>();
for (const row of relatedRows) {
  const salesOrder = text(row["S/O #(salesordernumber)"]);
  if (!salesOrder) continue;
  const existing = relatedBySalesOrder.get(salesOrder) ?? [];
  existing.push(row);
  relatedBySalesOrder.set(salesOrder, existing);
}

const workOrderNumbers = new Set<string>();
const relatedWorkOrders = new Set<string>();

const findRelatedRow = (machineRow: Record<string, string>) => {
  const salesOrder = text(machineRow.SALESORDERNUMBER);
  const candidates = relatedBySalesOrder.get(salesOrder) ?? [];
  const itemNumber = text(machineRow.ITEMNUMBER);
  return (
    candidates.find((row) => text(row["Item Number"]) === itemNumber) ??
    candidates[0]
  );
};

export const MOCK_ORDERS: ProductionOrder[] = machineRows.map((row, index) => {
  const rawResource = text(row.Resource);
  const parsedResource = parseResource(rawResource);
  const related = findRelatedRow(row);
  const linkageStatus = related ? "Linked" : "Unlinked";
  const status = parsedResource.status;
  const buildEndDate = excelDateToIso(row["Earliest DELIVERYDATE"]);
  const salesShipDate = excelDateToIso(related?.["Ship date"]);
  const workOrder = parsedResource.workOrder;
  const salesOrder = text(row.SALESORDERNUMBER);

  workOrderNumbers.add(workOrder);
  if (related?.["Ref #"]) relatedWorkOrders.add(text(related["Ref #"]));

  const base: ProductionOrder = {
    id: workOrder || `unlinked-${index + 1}`,
    workOrder,
    salesOrder,
    customer: related ? text(related.Name) : "—",
    customerPO: related ? text(related["Ref #"]) : "",
    itemNumber: text(row.ITEMNUMBER),
    description: related ? text(related.Description) : "",
    SC1: related ? text(related.SC1) : "",
    SC2: "",
    SC3: text(row.SC3),
    buildStartDate: "",
    buildEndDate,
    salesShipDate,
    createdDate: "",
    requestedDate: related ? excelDateToIso(related["S/O Created on"]) : "",
    status,
    currentStage: parsedResource.currentStage,
    resource: parsedResource.resource,
    rawResource,
    productionGroup: parsedResource.productionGroup,
    productionGroupName: parsedResource.productionGroup,
    destination: "",
    country: "",
    salesperson: "",
    customerReference: text(row.ENGINEERINGNOTES),
    exceptionFlags: [],
    linkageStatus,
    linkageAudit: {
      salesOrder,
      company: "",
      itemNumber: text(row.ITEMNUMBER),
      inventoryLotDemandId: "",
      salesHeaderMatched: Boolean(related),
      salesLineMatched: Boolean(related),
      productionDemandMatched: Boolean(related),
    },
    salesOrderLines: [],
    sourceMachine: row,
    sourceRelated: related,
  };

  return {
    ...base,
    exceptionFlags: getExceptionFlags(base),
  };
});

const linkedSalesOrders = new Set(
  MOCK_ORDERS.map((order) => order.salesOrder).filter(Boolean),
);

const futureDemandRows = relatedRows.filter((row) => {
  const salesOrder = text(row["S/O #(salesordernumber)"]);
  return salesOrder && !linkedSalesOrders.has(salesOrder);
});

export const MOCK_DEMAND: FutureDemand[] = futureDemandRows.map((row, index) => ({
  id: `demand-${text(row["S/O #(salesordernumber)"])}-${text(row["Item Number"]) || index}`,
  salesOrder: text(row["S/O #(salesordernumber)"]),
  customer: text(row.Name),
  customerPO: text(row["Ref #"]),
  itemNumber: text(row["Item Number"]),
  description: text(row.Description),
  SC1: text(row.SC1),
  SC3: text(row.SC3),
  requestedDate: excelDateToIso(row["S/O Created on"]) || excelDateToIso(row["Ship date"]),
  salesShipDate: excelDateToIso(row["Ship date"]),
  qty: isPresent(row.Qty) && Number.isFinite(Number(row.Qty)) ? Number(row.Qty) : null,
  status: "NO WORK ORDER",
  sourceRelated: row,
}));

const duplicateCounts = new Map<string, number>();
for (const row of machineRows) {
  const workOrder = parseResource(text(row.Resource)).workOrder;
  duplicateCounts.set(workOrder, (duplicateCounts.get(workOrder) ?? 0) + 1);
}

export const DATA_QUALITY: DataQuality = {
  machineRows: machineRows.length,
  validWorkOrders: MOCK_ORDERS.filter((order) => /^\d{6}$/.test(order.workOrder)).length,
  duplicateWorkOrders: [...duplicateCounts.values()].filter((count) => count > 1).length,
  linkedOrders: MOCK_ORDERS.filter((order) => order.linkageStatus === "Linked").length,
  populatedSalesOrders: MOCK_ORDERS.filter((order) => order.salesOrder).length,
  validatedSalesOrderLinks: MOCK_ORDERS.filter((order) => order.linkageStatus === "Linked").length,
  partialLinkages: MOCK_ORDERS.filter((order) => order.linkageStatus === "Partial").length,
  unlinkedOrders: MOCK_ORDERS.filter((order) => order.linkageStatus === "Unlinked").length,
  futureDemand: MOCK_DEMAND.length,
  futureDemandAlreadyLinked: futureDemandRows.filter((row) =>
    linkedSalesOrders.has(text(row["S/O #(salesordernumber)"])),
  ).length,
  invalidSC3: MOCK_ORDERS.filter((order) => !order.SC3).length,
  invalidDates: machineRows.filter(
    (row) => isPresent(row["Earliest DELIVERYDATE"]) && !excelDateToIso(row["Earliest DELIVERYDATE"]),
  ).length,
};

export const DATA_AS_OF = "Workbook snapshot · 24 Aug 2026";
export const SOURCE_FILE_NAME = source.sourceFile;