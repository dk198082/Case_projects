import { pool } from "@workspace/db";
import { GetProductionPriorityResponse } from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { requireLogin } from "../middleware/auth";
import {
  getProductionPriorityLinkageStatus,
  isValidatedProductionPriorityLinkage,
} from "./production-priority-filters";
import {
  getSalesOrderCustomerName,
  getWorkOrderQuantity,
} from "./production-priority-mapping";

type ProductionRow = {
  salesordernumber: string | null;
  dataareaid: string | null;
  salesorderpoolid: string | null;
  deliveryaddressname: string | null;
  confirmedshippingdate: Date | null;
  salesordername: string | null;
  requestedshippingdate: Date | null;
  ordercreationdatetime: Date | null;
  engineeringnotes: string | null;
  itemdesc: string | null;
  itemnumber: string | null;
  orderedsalesquantity: string | number | null;
  estimatedquantity: string | number | null;
  scheduledquantity: string | number | null;
  remainingreportasfinishedquantity: string | number | null;
  deliverydate: Date | null;
  scheduledstartdate: Date | null;
  productionorderstatus: number | null;
  starteddate: Date | null;
  status: string | null;
  productionordername: string | null;
  productionordernumber: string | null;
  endeddate: Date | null;
  sc1: string | null;
  sc2: string | null;
  sc3: string | null;
  name: string | null;
  resource1: string | null;
  resource: string | null;
  task: string | null;
  assy_resource: string | null;
  machineresource: string | null;
  productiongroupname: string | null;
  salesheadercustomername: string | null;
  salesheadermatched: boolean;
  saleslinematched: boolean;
  productiondemandmatched: boolean;
  inventorylotdemandid: string | null;
  buildstartdate: Date | null;
  buildenddate: Date | null;
  salesorderlines: RawSalesOrderLine[] | null;
};

type RawSalesOrderLine = {
  line: number | string | null;
  item: string | null;
  description: string | null;
  configuration: string | null;
  configname: string | null;
  qty: number | string | null;
  unit: string | null;
  reference: string | null;
  status: number | null;
};

type PrioritySnapshot = ReturnType<typeof GetProductionPriorityResponse.parse>;

const router: IRouter = Router();
const CACHE_TTL_MS = 60_000;
let cachedSnapshot: { expiresAt: number; value: PrioritySnapshot } | null = null;
let inFlightSnapshot: Promise<PrioritySnapshot> | null = null;

const text = (value: unknown) => (value == null ? "" : String(value).trim());
const usableDate = (value: Date | null) =>
  value && value.getUTCFullYear() >= 2000 ? value : null;
const iso = (value: Date | null) => usableDate(value)?.toISOString() ?? "";

const normalizeStatus = (value: string | null): "STARTED" | "RELEASED" | "" => {
  const normalized = text(value).toUpperCase();
  if (normalized.includes("START")) return "STARTED";
  if (normalized.includes("RELEASE")) return "RELEASED";
  return "";
};

const isPastDue = (date: string) => {
  if (!date) return false;

  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return false;

  const today = new Date();
  const dateValue = Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  );
  const todayValue = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  return dateValue < todayValue;
};

const formatLineNumber = (value: number | string | null) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : text(value as string | null);
};

const getProductionGroup = (rawResource: string) => {
  const segments = rawResource.split("/").map(text);
  if (segments[1] === "W" && /^H-/i.test(segments[2] ?? "")) {
    return `${segments[1]}/${segments[2]}`;
  }
  return text(segments[2]);
};

const normalizeSalesLineStatus = (value: number | null): string => {
  switch (value) {
    case 1:
      return "Open order";
    case 2:
      return "Delivered";
    case 3:
      return "Invoiced";
    case 4:
      return "Canceled";
    default:
      return "";
  }
};

const hasFutureShipDate = (row: ProductionRow) =>
  [row.confirmedshippingdate, row.requestedshippingdate]
    .map(usableDate)
    .filter((value): value is Date => value instanceof Date)
    .some((value) => value.getTime() >= new Date().setHours(0, 0, 0, 0));

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, "\"\"")}"`;

async function loadSnapshot(): Promise<PrioritySnapshot> {
  const schema = process.env.AZURE_PG_SCHEMA;
  if (!schema || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new Error("AZURE_PG_SCHEMA must be a valid PostgreSQL schema identifier.");
  }

  const cacheTableName =
    `${quoteIdentifier(schema)}.${quoteIdentifier("production_priority_app_cache")}`;
  const result = await pool.query<ProductionRow>(`
    SELECT
      salesordernumber, dataareaid, deliveryaddressname,
      confirmedshippingdate, salesordername, salesorderpoolid,
      requestedshippingdate, ordercreationdatetime, engineeringnotes,
      itemdesc, itemnumber, orderedsalesquantity,
      estimatedquantity, scheduledquantity, remainingreportasfinishedquantity,
      deliverydate, scheduledstartdate, productionorderstatus,
      starteddate, status, productionordername, productionordernumber,
      endeddate, sc1, sc2, sc3, name,
      resource1, resource, task, assy_resource, machineresource,
      salesheadercustomername, salesheadermatched, saleslinematched,
      productiondemandmatched, inventorylotdemandid,
      buildstartdate, buildenddate, productiongroupname, salesorderlines
    FROM ${cacheTableName}
  `);

  const rows = result.rows;
  const activeRows = rows.filter((row) => {
    const workOrder = text(row.productionordernumber);
    return workOrder && normalizeStatus(row.status) !== "";
  });

  const orders = activeRows.map((row, index) => {
    const workOrder = text(row.productionordernumber);
    const rawResource = text(row.resource);
    const currentStage = text(row.task) || text(row.assy_resource) || text(row.resource1);
    const resource = text(row.machineresource) || text(row.resource1) || rawResource;
    const productionGroup = getProductionGroup(rawResource);
    const productionGroupName = text(row.productiongroupname) || productionGroup;
    const status = normalizeStatus(row.status);
    const buildStartDate = iso(row.buildstartdate);
    const buildEndDate = iso(row.buildenddate) || iso(row.deliverydate);
    const salesShipDate = iso(row.confirmedshippingdate) || iso(row.requestedshippingdate);
    const linkageAudit = {
      salesOrder: text(row.salesordernumber),
      company: text(row.dataareaid),
      itemNumber: text(row.itemnumber),
      inventoryLotDemandId: text(row.inventorylotdemandid),
      salesHeaderMatched: row.salesheadermatched,
      salesLineMatched: row.saleslinematched,
      productionDemandMatched: row.productiondemandmatched,
    };
    const linkageStatus = getProductionPriorityLinkageStatus(row);
    const salesOrderLines = (row.salesorderlines ?? []).map((line) => ({
      line: formatLineNumber(line.line),
      item: text(line.item),
      description: text(line.description),
      configuration: text(line.configuration),
      configName: text(line.configname),
      qty: line.qty == null ? null : Number(line.qty),
      unit: text(line.unit),
      reference: text(line.reference),
      status: normalizeSalesLineStatus(line.status),
    }));
    const exceptionFlags: string[] = [];

    if (/\bhold\b/i.test(`${currentStage} ${rawResource}`)) exceptionFlags.push("HOLD");
    if (isPastDue(buildEndDate) && isPastDue(salesShipDate)) {
      exceptionFlags.push("BUILD & SHIP PAST DUE");
    } else if (isPastDue(buildEndDate)) {
      exceptionFlags.push("BUILD DATE PAST DUE");
    } else if (isPastDue(salesShipDate)) {
      exceptionFlags.push("SHIP DATE PAST DUE");
    }
    if (!buildEndDate) exceptionFlags.push("NO BUILD DATE");
    if (linkageStatus === "Partial") exceptionFlags.push("LINKAGE NOT VALIDATED");
    if (linkageStatus === "Unlinked") exceptionFlags.push("UNLINKED");

    return {
      id: workOrder || `azure-order-${index + 1}`,
      workOrder,
      workOrderQty: getWorkOrderQuantity(row).remaining,
      scheduledWorkOrderQty: getWorkOrderQuantity(row).scheduled,
      salesOrder: text(row.salesordernumber),
      customer: getSalesOrderCustomerName(row),
      customerPO: "",
      itemNumber: text(row.itemnumber),
      description: text(row.itemdesc) || text(row.productionordername),
      SC1: text(row.sc1),
      SC2: text(row.sc2),
      SC3: text(row.sc3),
      buildStartDate,
      buildEndDate,
      salesShipDate,
      createdDate: iso(row.ordercreationdatetime),
      requestedDate: iso(row.requestedshippingdate),
      status,
      currentStage,
      resource,
      rawResource,
      productionGroup,
      productionGroupName,
      destination: text(row.deliveryaddressname),
      country: "",
      salesperson: "",
      customerReference: text(row.engineeringnotes),
      exceptionFlags,
      linkageStatus,
      linkageAudit,
      salesOrderLines,
    };
  });

  const demand = rows
    .filter((row) => !text(row.productionordernumber) && text(row.salesordernumber) && hasFutureShipDate(row))
    .map((row, index) => ({
      id: `azure-demand-${text(row.salesordernumber)}-${text(row.itemnumber) || "item"}-${index + 1}`,
      salesOrder: text(row.salesordernumber),
      customer: getSalesOrderCustomerName(row),
      customerPO: "",
      itemNumber: text(row.itemnumber),
      description: text(row.itemdesc),
      SC1: text(row.sc1),
      SC3: text(row.sc3),
      requestedDate: iso(row.ordercreationdatetime) || iso(row.requestedshippingdate),
      salesShipDate: iso(row.confirmedshippingdate) || iso(row.requestedshippingdate),
      qty: row.orderedsalesquantity == null ? null : Number(row.orderedsalesquantity),
      status: "NO WORK ORDER" as const,
    }));

  const duplicateWorkOrders = new Map<string, number>();
  for (const order of orders) {
    duplicateWorkOrders.set(order.workOrder, (duplicateWorkOrders.get(order.workOrder) ?? 0) + 1);
  }

  return GetProductionPriorityResponse.parse({
    orders,
    demand,
    dataQuality: {
      machineRows: rows.length,
      validWorkOrders: orders.filter((order) => /^\d{6}$/.test(order.workOrder)).length,
      duplicateWorkOrders: [...duplicateWorkOrders.values()].filter((count) => count > 1).length,
      linkedOrders: orders.filter((order) => order.salesOrder).length,
      populatedSalesOrders: orders.filter((order) => order.salesOrder).length,
      validatedSalesOrderLinks: orders.filter((order) =>
        isValidatedProductionPriorityLinkage({
          salesordernumber: order.linkageAudit.salesOrder,
          dataareaid: order.linkageAudit.company,
          itemnumber: order.linkageAudit.itemNumber,
          inventorylotdemandid: order.linkageAudit.inventoryLotDemandId,
          salesheadermatched: order.linkageAudit.salesHeaderMatched,
          saleslinematched: order.linkageAudit.salesLineMatched,
          productiondemandmatched: order.linkageAudit.productionDemandMatched,
        }),
      ).length,
      partialLinkages: orders.filter((order) => order.linkageStatus === "Partial").length,
      unlinkedOrders: orders.filter((order) => order.linkageStatus === "Unlinked").length,
      futureDemand: demand.length,
      futureDemandAlreadyLinked: 0,
      invalidSC3: orders.filter((order) => !order.SC3).length,
      invalidDates: rows.filter(
        (row) =>
          row.deliverydate != null &&
          Number.isNaN(new Date(row.deliverydate).getTime()),
      ).length,
    },
    dataAsOf: `Azure PostgreSQL · ${new Date().toISOString()}`,
  });
}

async function getSnapshot(forceRefresh: boolean) {
  if (!forceRefresh && cachedSnapshot && cachedSnapshot.expiresAt > Date.now()) {
    return cachedSnapshot.value;
  }

  if (!inFlightSnapshot) {
    inFlightSnapshot = loadSnapshot()
      .then((value) => {
        cachedSnapshot = { value, expiresAt: Date.now() + CACHE_TTL_MS };
        return value;
      })
      .finally(() => {
        inFlightSnapshot = null;
      });
  }

  return inFlightSnapshot;
}

router.get("/production-priority", requireLogin, async (req, res, next) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const snapshot = await getSnapshot(forceRefresh);
    res.set("Cache-Control", "no-store");
    res.json(snapshot);
  } catch (error) {
    req.log.error({ err: error }, "Unable to load the production priority snapshot");
    next(error);
  }
});

export default router;