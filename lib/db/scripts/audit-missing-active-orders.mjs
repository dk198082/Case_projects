import pg from "pg";
import XLSX from "xlsx";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Read-only, point-in-time audit. Never refreshes or changes the source or cache.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = `${root}generated-artifacts/production-priority-audit`;
const schema = process.env.AZURE_PG_SCHEMA;
if (schema !== "d365fo") throw new Error("Expected the authoritative d365fo schema.");
const pool = new pg.Pool({
  host: process.env.AZURE_PG_HOST,
  port: Number(process.env.AZURE_PG_PORT ?? 5432),
  database: process.env.AZURE_PG_DATABASE,
  user: process.env.AZURE_PG_USER ?? process.env.AZURE_PG_SP_USER,
  password: process.env.AZURE_PG_PASSWORD,
  ssl: process.env.AZURE_PG_SSLMODE?.toLowerCase() === "disable"
    ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
  max: 1,
});
const client = await pool.connect();
const data = {};
try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await client.query("SET LOCAL statement_timeout = '45s'");
  await client.query("SET LOCAL lock_timeout = '5s'");
  const queries = {
    snapshot: "SELECT transaction_timestamp() AS audited_at",
    active: `SELECT dataareaid, productionordernumber, productionorderstatus,
      itemnumber, productionordername, productiongroupid, demandsalesordernumber,
      demandsalesorderlineinventorylotid, remainingreportasfinishedquantity,
      scheduledquantity, tomodifieddatetime
      FROM d365fo.prodproductionorderheaderstaging
      WHERE productionorderstatus IN (3,4)
      ORDER BY dataareaid, productionordernumber`,
    headers: `WITH keys AS MATERIALIZED (
      SELECT DISTINCT dataareaid, demandsalesordernumber
      FROM d365fo.prodproductionorderheaderstaging WHERE productionorderstatus IN (3,4)
    ) SELECT h.dataareaid, h.salesordernumber, h.salesorderstatus,
      h.salesorderpoolid, h.salesordername
      FROM d365fo.salesorderheaderv3staging h JOIN keys k
      ON k.dataareaid = h.dataareaid AND k.demandsalesordernumber = h.salesordernumber`,
    lines: `WITH keys AS MATERIALIZED (
      SELECT DISTINCT dataareaid, demandsalesordernumber
      FROM d365fo.prodproductionorderheaderstaging WHERE productionorderstatus IN (3,4)
    ) SELECT l.dataareaid, l.salesordernumber, l.itemnumber, l.inventorylotid,
      l.salesorderlinestatus, l.linenum
      FROM d365fo.salesorderlinev2staging l JOIN keys k
      ON k.dataareaid = l.dataareaid AND k.demandsalesordernumber = l.salesordernumber`,
    products: `WITH keys AS MATERIALIZED (
      SELECT DISTINCT dataareaid, itemnumber
      FROM d365fo.prodproductionorderheaderstaging WHERE productionorderstatus IN (3,4)
    ) SELECT e.dataareaid, e.itemnumber, e.tosalesclass1 AS sc1,
      e.salesclassification2 AS sc2, e.salesclassification3 AS sc3
      FROM d365fo.ecoresreleasedproductv2staging e JOIN keys k
      ON k.dataareaid = e.dataareaid AND k.itemnumber = e.itemnumber`,
    view: `SELECT DISTINCT dataareaid, productionordernumber, status, itemnumber
      FROM d365fo.vw_salesprodmachines365_app
      WHERE productionorderstatus IN (3,4)`,
    cache: `SELECT dataareaid, productionordernumber, status, itemnumber,
      salesordernumber, cache_refreshed_at
      FROM d365fo.production_priority_app_cache`,
    viewDefinition: `SELECT pg_get_viewdef(
      'd365fo.vw_salesprodmachines365_app'::regclass,true) AS definition`,
    refreshDefinition: `SELECT pg_get_functiondef(
      'd365fo.sp_refresh_production_priority_cache()'::regprocedure) AS definition`,
  };
  for (const [name, query] of Object.entries(queries)) {
    const started = Date.now();
    data[name] = (await client.query(query)).rows;
    console.log(`Read ${name}: ${data[name].length} rows (${Date.now() - started} ms)`);
  }
  await client.query("ROLLBACK");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}

const filterSource = await readFile(
  `${root}artifacts/api-server/src/routes/production-priority-filters.ts`, "utf8",
);
const allowed = Object.fromEntries(["SC1", "SC2", "SC3"].map((field) => {
  const block = filterSource.match(new RegExp(`ALLOWED_${field} = \\[([\\s\\S]*?)\\]`));
  if (!block) throw new Error(`Cannot read ${field} rules`);
  const values = [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  // Refuse to audit using application lists that differ from the live procedure.
  const sqlBlock = data.refreshDefinition[0].definition.match(
    new RegExp(`COALESCE\\(m\\.${field.toLowerCase()},\\s*''\\)\\)\\s+IN\\s*\\(([\\s\\S]*?)\\)`, "i"),
  );
  if (!sqlBlock) throw new Error(`Cannot verify live ${field} rules`);
  const live = [...sqlBlock[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  if (JSON.stringify([...values].sort()) !== JSON.stringify([...live].sort())) {
    throw new Error(`Live ${field} rules differ from the application`);
  }
  return [field.toLowerCase(), new Set(values)];
}));
const trim = (value) => String(value ?? "").trim();
const key = (...values) => JSON.stringify(values);
const index = (rows, fields) => {
  const map = new Map();
  for (const row of rows) {
    const id = key(...fields.map((field) => row[field]));
    map.set(id, [...(map.get(id) ?? []), row]);
  }
  return map;
};
const headerIndex = index(data.headers, ["dataareaid", "salesordernumber"]);
const lineIndex = index(data.lines, ["dataareaid", "salesordernumber"]);
const productIndex = index(data.products, ["dataareaid", "itemnumber"]);
const viewIndex = index(data.view, ["dataareaid", "productionordernumber"]);
const cacheIndex = index(data.cache, ["dataareaid", "productionordernumber"]);
const activeStatus = (value) => /START|RELEASE/.test(trim(value).toUpperCase());
const values = (rows, field) => [...new Set(rows.map((row) => String(row[field] ?? "(null)")))].join(" | ");
const sqlEqual = (left, right) => left != null && right != null && left === right;
const candidateRows = data.active.map((order) => {
  const id = key(order.dataareaid, order.productionordernumber);
  const headers = headerIndex.get(key(order.dataareaid, order.demandsalesordernumber)) ?? [];
  const lines = lineIndex.get(key(order.dataareaid, order.demandsalesordernumber)) ?? [];
  const itemLines = lines.filter((line) => sqlEqual(line.itemnumber, order.itemnumber));
  const exactLines = itemLines.filter((line) =>
    sqlEqual(line.inventorylotid, order.demandsalesorderlineinventorylotid));
  const openHeaders = headers.filter((header) => header.salesorderstatus === 1);
  const openLines = exactLines.filter((line) => line.salesorderlinestatus === 1);
  const eligibleHeaders = openHeaders.filter((header) =>
    !/consign/i.test(header.salesorderpoolid ?? ""));
  const products = productIndex.get(key(order.dataareaid, order.itemnumber)) ?? [];
  const classificationPass = products.some((product) =>
    ["sc1", "sc2", "sc3"].every((field) => allowed[field].has(trim(product[field]))));
  const classificationFailures = products.length
    ? [...new Set(products.flatMap((product) => ["sc1", "sc2", "sc3"]
      .filter((field) => !allowed[field].has(trim(product[field])))
      .map((field) => `${field.toUpperCase()}=${trim(product[field]) || "(blank)"}`)))].join("; ")
    : "Unknown: released-product record missing";
  const viewPresent = viewIndex.has(id);
  const cached = cacheIndex.get(id) ?? [];
  const boardPresent = trim(order.productionordernumber) !== "" &&
    cached.some((row) => activeStatus(row.status));
  const sourceEligible = order.dataareaid === "TOUS" &&
    openHeaders.length > 0 && openLines.length > 0 && products.length > 0;
  if (sourceEligible !== viewPresent) {
    throw new Error(`Source-view reconciliation failed for ${id}`);
  }
  const otherReasons = [];
  if (order.dataareaid !== "TOUS") otherReasons.push("Outside TOUS company scope");
  if (!trim(order.productionordernumber)) otherReasons.push("Blank work-order number");
  if (!trim(order.demandsalesordernumber)) {
    otherReasons.push("No demand sales-order number");
  } else {
    if (!headers.length) otherReasons.push("Demand sales-order header missing");
    else if (!openHeaders.length) otherReasons.push("Sales-order header is not Open");
    if (!lines.length) otherReasons.push("No sales lines for demand sales order");
    else if (!itemLines.length) otherReasons.push("No matching item on demand sales order");
    else if (!exactLines.length) {
      otherReasons.push(!trim(order.demandsalesorderlineinventorylotid)
        ? "Demand inventory-lot ID missing; no exact sales-line match"
        : "Demand inventory-lot ID does not match the sales line");
    } else if (!openLines.length) otherReasons.push("Matching sales-order line is not Open");
  }
  if (!products.length) otherReasons.push("Released-product record missing");
  if (openHeaders.length && !eligibleHeaders.length) otherReasons.push("Sales-order pool contains Consign");
  if (trim(order.itemnumber) === "02002107") otherReasons.push("Explicitly excluded item 02002107");
  const otherwiseEligible = sourceEligible && eligibleHeaders.length > 0 &&
    classificationPass && trim(order.itemnumber) !== "02002107" && trim(order.productionordernumber);
  if (otherwiseEligible && !boardPresent) {
    otherReasons.push(cached.length
      ? "Cached status is not Started/Released"
      : "Eligible source order missing from prepared cache");
  }
  return {
    company: order.dataareaid,
    workOrder: order.productionordernumber,
    status: order.productionorderstatus === 3 ? "Released" : "Started",
    item: order.itemnumber,
    description: order.productionordername,
    productionGroup: order.productiongroupid,
    remainingQty: order.remainingreportasfinishedquantity,
    scheduledQty: order.scheduledquantity,
    salesOrder: order.demandsalesordernumber,
    demandLot: order.demandsalesorderlineinventorylotid,
    classificationResult: classificationPass ? "Pass" : products.length ? "Fail" : "Unknown",
    classificationFailures: classificationPass ? "" : classificationFailures,
    sc1: values(products, "sc1"), sc2: values(products, "sc2"), sc3: values(products, "sc3"),
    headerStatuses: values(headers, "salesorderstatus"),
    salesPools: values(headers, "salesorderpoolid"),
    matchingItemLineLots: values(itemLines, "inventorylotid"),
    exactLineStatuses: values(exactLines, "salesorderlinestatus"),
    exactLineNumbers: values(exactLines, "linenum"),
    inSourceView: viewPresent,
    inPreparedCache: cached.length > 0,
    inBoardPopulation: boardPresent,
    cachedStatuses: values(cached, "status"),
    otherReasons,
    sourceModifiedAt: order.tomodifieddatetime,
  };
});
// Every active staging row must represent a distinct company/work-order identity.
// Otherwise the reconciliation needs an explicit source-version policy.
if (new Set(candidateRows.map((row) => key(row.company, row.workOrder))).size !== candidateRows.length) {
  throw new Error("Duplicate active company/work-order identities; audit needs version reconciliation.");
}
const missing = candidateRows.filter((row) => !row.inBoardPopulation);
const inScopeMissing = missing.filter((row) => row.company === "TOUS");
const main = inScopeMissing.filter((row) => row.otherReasons.length && row.classificationResult === "Pass");
const mixed = inScopeMissing.filter((row) => row.otherReasons.length && row.classificationResult !== "Pass");
const classificationOnly = inScopeMissing.filter((row) => !row.otherReasons.length);
const outside = missing.filter((row) => row.company !== "TOUS");
if (classificationOnly.some((row) => row.classificationResult !== "Fail")) {
  throw new Error("Unexplained missing order found.");
}
const reasonCounts = (rows) => Object.fromEntries([...new Set(rows.flatMap((row) => row.otherReasons))]
  .map((reason) => [reason, rows.filter((row) => row.otherReasons.includes(reason)).length])
  .sort((a, b) => b[1] - a[1]));
const companyCounts = Object.fromEntries([...new Set(candidateRows.map((row) => row.company))]
  .map((company) => [company, candidateRows.filter((row) => row.company === company).length]));
const cacheDates = [...new Set(data.cache.map((row) => row.cache_refreshed_at.toISOString()))].sort();
const summary = {
  auditedAt: data.snapshot[0].audited_at.toISOString(),
  cacheOldest: cacheDates[0], cacheNewest: cacheDates.at(-1),
  sourceActiveTotal: candidateRows.length,
  sourceActiveByCompany: companyCounts,
  tousActiveTotal: companyCounts.TOUS,
  tousInBoard: candidateRows.filter((row) => row.company === "TOUS" && row.inBoardPopulation).length,
  tousMissing: inScopeMissing.length,
  tousMissingNonClassificationOnly: main.length,
  tousMissingMixedOrUnknown: mixed.length,
  tousMissingClassificationOnly: classificationOnly.length,
  nonTousMissing: outside.length,
  mainReasonCounts: reasonCounts(main),
  allNonClassificationReasonCounts: reasonCounts([...main, ...mixed]),
  recoveredOrder367420: candidateRows.find((row) => row.company === "TOUS" && row.workOrder === "367420"),
};
const notes = [
  ["Audit time UTC", summary.auditedAt],
  ["Source", "Azure PostgreSQL d365fo shadow database; not a direct live F&O query."],
  ["Database access", "Repeatable-read, read-only transaction. No writes and no cache refresh."],
  ["Board population", "Prepared cache rows with nonblank work-order number and API-recognized Started/Released status; all screen filters cleared."],
  ["Main worksheet", "TOUS orders absent from the board, passing sales classifications, with at least one other exclusion reason."],
  ["Mixed worksheet", "TOUS orders absent for at least one non-classification reason and also failing classifications, or with classification unavailable because the product record is missing."],
  ["Outside TOUS worksheet", "All active non-TOUS orders, excluded by explicit company scope; kept separate from actionable TOUS findings."],
  ["Classification-only worksheet", "Excluded from the requested findings; included only to reconcile the full source population."],
  ["Reason counts", "An order can have multiple reasons; reason totals must not be added as distinct-order counts."],
  ["Missing demand", "No demand sales-order number is a root cause; downstream header/line absence is not counted again."],
  ["Header status", "Numeric 1 is Open; 2 Delivered; 3 Invoiced; 4 Canceled; 0 None."],
  ["Line status", "Numeric 1 is Open; 2 Delivered; 3 Invoiced; 4 Canceled; 0 None."],
  ["Comparison keys", "Company + work-order identity. Exact source joins on demand sales order, company, item, and inventory lot; no identifier normalization."],
  ["Cache freshness", `${summary.cacheOldest} through ${summary.cacheNewest}; this is not upstream ERP synchronization time.`],
  ["Limitations", "Does not inspect a particular user's browser filters or stale browser snapshot; classification failures remain reported separately."],
];
const humanColumns = {
  company: "Company", workOrder: "Work Order", status: "Status", item: "Item",
  description: "Description", productionGroup: "Production Group",
  remainingQty: "Remaining Qty", scheduledQty: "Scheduled Qty",
  salesOrder: "Demand Sales Order", demandLot: "Demand Inventory Lot",
  otherReasons: "Non-classification Exclusion Reasons",
  classificationResult: "Sales Classifications", classificationFailures: "Classification Failures",
  sc1: "SC1", sc2: "SC2", sc3: "SC3", headerStatuses: "Sales Header Status Codes",
  salesPools: "Sales Pools", matchingItemLineLots: "Sales Line Lots for Same Item",
  exactLineStatuses: "Exact Sales Line Status Codes", exactLineNumbers: "Exact Sales Line Numbers",
  inSourceView: "In Source View", inPreparedCache: "In Prepared Cache",
  inBoardPopulation: "In Board Population", cachedStatuses: "Cached Status",
  sourceModifiedAt: "Source Modified At",
};
const exportRows = (rows) => rows.map((row) => Object.fromEntries(
  Object.entries(humanColumns).map(([field, title]) => [title,
    Array.isArray(row[field]) ? row[field].join("; ") :
      row[field] instanceof Date ? row[field].toISOString() : row[field] ?? ""])));
const workbook = XLSX.utils.book_new();
const addSheet = (name, rows) => {
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!autofilter"] = { ref: sheet["!ref"] ?? "A1" };
  sheet["!cols"] = Object.keys(rows[0] ?? {}).map((column) => ({
    wch: /Reasons|Description|Failures|Lots/.test(column) ? 65 : /Date|At|Status/.test(column) ? 25 : 22,
  }));
  XLSX.utils.book_append_sheet(workbook, sheet, name);
};
addSheet("Summary", [
  ...notes.map(([Metric, Value]) => ({ Metric, Value })),
  ...Object.entries(summary).filter(([, value]) => typeof value === "number")
    .map(([Metric, Value]) => ({ Metric, Value })),
]);
addSheet("TOUS - Other Reasons", exportRows(main));
addSheet("TOUS - Mixed Reasons", exportRows(mixed));
addSheet("Outside TOUS", exportRows(outside));
addSheet("Classification Only", exportRows(classificationOnly));
addSheet("All Active Source Orders", exportRows(candidateRows));
addSheet("Reason Counts", Object.entries(summary.allNonClassificationReasonCounts)
  .map(([Reason, Orders]) => ({ Reason, Orders, Scope: "TOUS main + mixed; overlapping counts" })));
await mkdir(output, { recursive: true });
await writeFile(`${output}/audit-data.json`, JSON.stringify({ summary, notes, main, mixed, outside, classificationOnly, all: candidateRows }, null, 2));
XLSX.writeFile(workbook, `${output}/production-priority-missing-orders.xlsx`);
// Read the saved workbook back to verify every detail sheet has its full population.
const check = XLSX.readFile(`${output}/production-priority-missing-orders.xlsx`);
for (const [name, expected] of [
  ["TOUS - Other Reasons", main.length], ["TOUS - Mixed Reasons", mixed.length],
  ["Outside TOUS", outside.length], ["Classification Only", classificationOnly.length],
  ["All Active Source Orders", candidateRows.length],
]) {
  if (XLSX.utils.sheet_to_json(check.Sheets[name]).length !== expected) {
    throw new Error(`Workbook row-count mismatch: ${name}`);
  }
}
console.log(JSON.stringify(summary, null, 2));
console.log("MAIN FINDINGS", JSON.stringify(main.map((row) => ({
  workOrder: row.workOrder, status: row.status, item: row.item,
  salesOrder: row.salesOrder, reasons: row.otherReasons,
})), null, 2));
console.log(`Workbook verified: ${output}/production-priority-missing-orders.xlsx`);
