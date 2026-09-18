import { pool } from "@workspace/db";
import { GetProductionPriorityResponse } from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { requireLogin } from "../middleware/auth";
import {
  getProductionPriorityLinkageStatus,
  isRequiredProductionPriorityRow,
  isValidatedProductionPriorityLinkage,
  requiredProductionPriorityWhereSql,
} from "./production-priority-filters";
import { getSalesOrderCustomerName } from "./production-priority-mapping";

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

  const tableName = `${quoteIdentifier(schema)}.${quoteIdentifier("vw_salesprodmachines365")}`;
  const salesOrderHeaderTableName =
    `${quoteIdentifier(schema)}.${quoteIdentifier("salesorderheaderv3staging")}`;
  const salesOrderLineTableName =
    `${quoteIdentifier(schema)}.${quoteIdentifier("salesorderlinev2staging")}`;
  const productionOrderHeaderTableName =
    `${quoteIdentifier(schema)}.${quoteIdentifier("prodproductionorderheaderstaging")}`;
  const routeDetailsTableName =
    `${quoteIdentifier(schema)}.${quoteIdentifier("vw_productionroutedetailsd365")}`;
  const configTranslationTableName =
    `${quoteIdentifier(schema)}.${quoteIdentifier("ecoresproductmasterconfigurationtranslationstaging")}`;
  const productionGroupTableName =
    `${quoteIdentifier(schema)}.${quoteIdentifier("costproductiongroupstaging")}`;
  const result = await pool.query<ProductionRow>(`
    WITH machine AS MATERIALIZED (
      SELECT ROW_NUMBER() OVER () AS audit_row_id, machine.*
      FROM ${tableName} AS machine
      WHERE ${requiredProductionPriorityWhereSql()}
    ),
    linkage_audit AS MATERIALIZED (
      SELECT
        machine.audit_row_id,
        MIN(NULLIF(BTRIM(COALESCE(header.salesordername, '')), ''))
          AS salesheadercustomername,
        COALESCE(BOOL_OR(header.salesordernumber IS NOT NULL), FALSE) AS salesheadermatched,
        COALESCE(BOOL_OR(line.salesordernumber IS NOT NULL), FALSE) AS saleslinematched,
        COALESCE(BOOL_OR(production.productionordernumber IS NOT NULL), FALSE) AS productiondemandmatched,
        COALESCE(
          MIN(NULLIF(BTRIM(COALESCE(line.inventorylotid, '')), ''))
            FILTER (WHERE production.productionordernumber IS NOT NULL),
          MIN(NULLIF(BTRIM(COALESCE(line.inventorylotid, '')), '')),
          ''
        ) AS inventorylotdemandid
      FROM machine
      LEFT JOIN ${salesOrderHeaderTableName} AS header
        ON BTRIM(COALESCE(machine.salesordernumber, '')) <> ''
       AND BTRIM(COALESCE(machine.dataareaid, '')) <> ''
       AND BTRIM(COALESCE(machine.itemnumber, '')) <> ''
       AND BTRIM(COALESCE(header.salesordernumber, '')) =
             BTRIM(COALESCE(machine.salesordernumber, ''))
       AND BTRIM(COALESCE(header.dataareaid, '')) =
             BTRIM(COALESCE(machine.dataareaid, ''))
      LEFT JOIN ${salesOrderLineTableName} AS line
        ON BTRIM(COALESCE(line.salesordernumber, '')) =
             BTRIM(COALESCE(header.salesordernumber, ''))
       AND BTRIM(COALESCE(line.dataareaid, '')) =
             BTRIM(COALESCE(header.dataareaid, ''))
       AND BTRIM(COALESCE(line.itemnumber, '')) =
             BTRIM(COALESCE(machine.itemnumber, ''))
      LEFT JOIN ${productionOrderHeaderTableName} AS production
        ON BTRIM(COALESCE(production.demandsalesorderlineinventorylotid, '')) =
             BTRIM(COALESCE(line.inventorylotid, ''))
       AND BTRIM(COALESCE(production.demandsalesordernumber, '')) =
             BTRIM(COALESCE(line.salesordernumber, ''))
       AND BTRIM(COALESCE(production.dataareaid, '')) =
             BTRIM(COALESCE(line.dataareaid, ''))
       AND BTRIM(COALESCE(production.itemnumber, '')) =
             BTRIM(COALESCE(line.itemnumber, ''))
       AND BTRIM(COALESCE(production.productionordernumber, '')) =
             BTRIM(COALESCE(machine.productionordernumber, ''))
       AND BTRIM(COALESCE(line.inventorylotid, '')) <> ''
      GROUP BY machine.audit_row_id
    ),
    route_ops AS MATERIALIZED (
      -- Only the route's non-warehouse (actual production) operations, and only
      -- rows carrying a real scheduled date. The source view can carry duplicate
      -- (order, operation number) rows from route revisions, some of which are
      -- unpopulated 1900-01-01 placeholders; excluding those up front avoids
      -- picking a placeholder over the real scheduled row on a tie.
      SELECT
        machine.audit_row_id,
        route.operationnumber,
        route.scheduledfromdate,
        route.scheduledenddate
      FROM machine
      JOIN ${routeDetailsTableName} AS route
        ON BTRIM(COALESCE(route.productionordernumber, '')) =
             BTRIM(COALESCE(machine.productionordernumber, ''))
       AND BTRIM(COALESCE(route.dataareaid, '')) =
             BTRIM(COALESCE(machine.dataareaid, ''))
       AND BTRIM(COALESCE(machine.productionordernumber, '')) <> ''
      WHERE COALESCE(route.operationname, '') NOT ILIKE 'Warehouse Pick%'
        AND COALESCE(route.operationname, '') NOT ILIKE 'Warehouse Receive%'
    ),
    build_dates AS MATERIALIZED (
      SELECT
        audit_row_id,
        (ARRAY_AGG(scheduledfromdate ORDER BY operationnumber ASC, scheduledfromdate ASC)
          FILTER (WHERE EXTRACT(YEAR FROM scheduledfromdate) >= 2000))[1] AS buildstartdate,
        (ARRAY_AGG(scheduledenddate ORDER BY operationnumber DESC, scheduledenddate DESC)
          FILTER (WHERE EXTRACT(YEAR FROM scheduledenddate) >= 2000))[1] AS buildenddate
      FROM route_ops
      GROUP BY audit_row_id
    ),
    sales_lines_raw AS MATERIALIZED (
      -- Every line on the order's sales order (not just the item matching this
      -- work order), so the pop-out can show the full Shop Floor App line list.
      SELECT
        machine.audit_row_id,
        line.linenum,
        line.itemnumber AS line_itemnumber,
        COALESCE(NULLIF(BTRIM(line.itemdesc), ''), line.linedescription) AS line_description,
        line.productconfigurationid,
        line.orderedsalesquantity,
        line.salesunitsymbol,
        line.salesorderlinestatus,
        BTRIM(COALESCE(line.salesordernumber, '')) AS line_salesordernumber,
        BTRIM(COALESCE(line.dataareaid, '')) AS line_dataareaid,
        BTRIM(COALESCE(line.inventorylotid, '')) AS line_inventorylotid
      FROM machine
      JOIN ${salesOrderLineTableName} AS line
        ON BTRIM(COALESCE(line.salesordernumber, '')) =
             BTRIM(COALESCE(machine.salesordernumber, ''))
       AND BTRIM(COALESCE(line.dataareaid, '')) =
             BTRIM(COALESCE(machine.dataareaid, ''))
       AND BTRIM(COALESCE(machine.salesordernumber, '')) <> ''
    ),
    -- Deduplicated, set-based lookups (plain hash joins below) rather than
    -- per-row correlated subqueries -- these source tables are large
    -- (100k-350k rows) and BTRIM() on the join keys prevents index usage, so
    -- a LATERAL subquery per line row previously forced a full table scan
    -- per row and made the endpoint take minutes instead of seconds.
    config_names AS MATERIALIZED (
      SELECT DISTINCT ON (
        BTRIM(COALESCE(cfg.productmasterconfigurationid, '')),
        BTRIM(COALESCE(cfg.productmasternumber, ''))
      )
        BTRIM(COALESCE(cfg.productmasterconfigurationid, '')) AS cfg_configid,
        BTRIM(COALESCE(cfg.productmasternumber, '')) AS cfg_itemnumber,
        cfg.translatedconfigurationname
      FROM ${configTranslationTableName} AS cfg
      WHERE BTRIM(COALESCE(cfg.productmasterconfigurationid, '')) <> ''
      ORDER BY
        BTRIM(COALESCE(cfg.productmasterconfigurationid, '')),
        BTRIM(COALESCE(cfg.productmasternumber, '')),
        (cfg.languageid = 'en-us') DESC
    ),
    production_refs AS MATERIALIZED (
      SELECT DISTINCT ON (
        BTRIM(COALESCE(p.dataareaid, '')),
        BTRIM(COALESCE(p.demandsalesordernumber, '')),
        BTRIM(COALESCE(p.itemnumber, '')),
        BTRIM(COALESCE(p.demandsalesorderlineinventorylotid, ''))
      )
        BTRIM(COALESCE(p.dataareaid, '')) AS ref_dataareaid,
        BTRIM(COALESCE(p.demandsalesordernumber, '')) AS ref_salesordernumber,
        BTRIM(COALESCE(p.itemnumber, '')) AS ref_itemnumber,
        BTRIM(COALESCE(p.demandsalesorderlineinventorylotid, '')) AS ref_lotid,
        p.productionordernumber
      FROM ${productionOrderHeaderTableName} AS p
      WHERE BTRIM(COALESCE(p.demandsalesorderlineinventorylotid, '')) <> ''
      ORDER BY
        BTRIM(COALESCE(p.dataareaid, '')),
        BTRIM(COALESCE(p.demandsalesordernumber, '')),
        BTRIM(COALESCE(p.itemnumber, '')),
        BTRIM(COALESCE(p.demandsalesorderlineinventorylotid, '')),
        p.productionordernumber DESC
    ),
    production_group_names AS MATERIALIZED (
      SELECT DISTINCT ON (
        BTRIM(COALESCE(groupid, '')),
        BTRIM(COALESCE(dataareaid, ''))
      )
        BTRIM(COALESCE(groupid, '')) AS productiongroupid,
        BTRIM(COALESCE(dataareaid, '')) AS productiongroupdataareaid,
        groupname AS productiongroupname
      FROM ${productionGroupTableName}
      WHERE BTRIM(COALESCE(groupid, '')) <> ''
      ORDER BY
        BTRIM(COALESCE(groupid, '')),
        BTRIM(COALESCE(dataareaid, '')),
        tomodifieddatetime DESC NULLS LAST
    ),
    sales_order_lines AS MATERIALIZED (
      SELECT
        slr.audit_row_id,
        jsonb_agg(
          jsonb_build_object(
            'line', slr.linenum,
            'item', slr.line_itemnumber,
            'description', slr.line_description,
            'configuration', slr.productconfigurationid,
            'configname', cfg.translatedconfigurationname,
            'qty', slr.orderedsalesquantity,
            'unit', slr.salesunitsymbol,
            'reference', pref.productionordernumber,
            'status', slr.salesorderlinestatus
          )
          ORDER BY slr.linenum ASC
        ) AS lines
      FROM sales_lines_raw AS slr
      LEFT JOIN config_names AS cfg
        ON cfg.cfg_configid = BTRIM(COALESCE(slr.productconfigurationid, ''))
       AND cfg.cfg_itemnumber = BTRIM(COALESCE(slr.line_itemnumber, ''))
       AND BTRIM(COALESCE(slr.productconfigurationid, '')) <> ''
      LEFT JOIN production_refs AS pref
        ON pref.ref_dataareaid = slr.line_dataareaid
       AND pref.ref_salesordernumber = slr.line_salesordernumber
       AND pref.ref_itemnumber = BTRIM(COALESCE(slr.line_itemnumber, ''))
       AND pref.ref_lotid = slr.line_inventorylotid
       AND slr.line_inventorylotid <> ''
      GROUP BY slr.audit_row_id
    )
    SELECT
      machine.salesordernumber, machine.dataareaid, machine.deliveryaddressname,
      machine.confirmedshippingdate, machine.salesordername, machine.salesorderpoolid,
      machine.requestedshippingdate,
      machine.ordercreationdatetime, machine.engineeringnotes,
      machine.itemdesc, machine.itemnumber, machine.orderedsalesquantity,
      machine.deliverydate, machine.scheduledstartdate, machine.productionorderstatus,
      machine.starteddate, machine.status, machine.productionordername,
      machine.productionordernumber, machine.endeddate, machine.sc1, machine.sc2,
      machine.sc3, machine.name,
      machine."Resource1" AS resource1,
      machine."Resource" AS resource,
      machine."Task" AS task,
      machine."Assy_Resource" AS assy_resource,
      machine."MachineResource" AS machineresource,
      linkage_audit.salesheadercustomername,
      linkage_audit.salesheadermatched,
      linkage_audit.saleslinematched,
      linkage_audit.productiondemandmatched,
      linkage_audit.inventorylotdemandid,
      build_dates.buildstartdate,
      build_dates.buildenddate,
      production_group_names.productiongroupname,
      sales_order_lines.lines AS salesorderlines
    FROM machine
    JOIN linkage_audit USING (audit_row_id)
    LEFT JOIN build_dates USING (audit_row_id)
    LEFT JOIN production_group_names
      ON production_group_names.productiongroupid =
           BTRIM(COALESCE(machine.productiongroupid, ''))
     AND production_group_names.productiongroupdataareaid =
           BTRIM(COALESCE(machine.dataareaid, ''))
    LEFT JOIN sales_order_lines USING (audit_row_id)
  `);

  const rows = result.rows.filter(isRequiredProductionPriorityRow);
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