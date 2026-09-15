export type DataflowStage = "source" | "transform" | "output" | "guardrail";

export type DataflowObject = {
  name: string;
  type: "view" | "table" | "configuration" | "contract";
  role: string;
  fields: string[];
  usedFor: string;
};

export type DataflowCalculation = {
  name: string;
  stage: DataflowStage;
  formula: string;
  result: string;
  source: string;
};

export type DataflowSection = {
  title: string;
  summary: string;
  items: DataflowCalculation[];
};

/**
 * Single source for the in-app dataflow document.
 *
 * Update the version/date and the affected entries when a source object,
 * business rule, calculation, or API/client transformation changes.
 */
export const DATAFLOW_DOCUMENT = {
  title: "Production Priority Board dataflow",
  version: "2026.08.26",
  updatedOn: "26 August 2026",
  purpose:
    "Trace the read-only path from Azure PostgreSQL source objects to the production queue, future demand panel, KPIs, exceptions, and data-quality indicators.",
  runtimePath: [
    "Browser UI",
    "GET /api/production-priority",
    "Azure PostgreSQL connection pool",
    "d365fo.vw_salesprodmachines365 + linkage audit objects",
    "Server normalization and Zod contract",
    "Client filters, sorting, priority, KPIs, and presentation",
  ],
  objects: [
    {
      name: "AZURE_PG_* + AZURE_PG_SCHEMA",
      type: "configuration",
      role: "Selects the runtime PostgreSQL server, database, credentials, SSL behavior, and schema identifier.",
      fields: ["AZURE_PG_HOST", "AZURE_PG_PORT", "AZURE_PG_DATABASE", "AZURE_PG_USER/AZURE_PG_SP_USER", "AZURE_PG_PASSWORD", "AZURE_PG_SSLMODE", "AZURE_PG_SCHEMA"],
      usedFor: "Connection selection and safely quoted schema-qualified object names. Azure takes precedence over DATABASE_URL when the Azure connection is complete.",
    },
    {
      name: "d365fo.vw_salesprodmachines365",
      type: "view",
      role: "Base machine/production rowset. One source row is retained with a generated audit_row_id for the downstream CTE audits.",
      fields: [
        "salesordernumber, dataareaid, salesorderpoolid",
        "deliveryaddressname, confirmedshippingdate, requestedshippingdate",
        "ordercreationdatetime, engineeringnotes",
        "itemdesc, itemnumber, orderedsalesquantity",
        "deliverydate, scheduledstartdate, productionorderstatus, starteddate, status",
        "productionordername, productionordernumber, endeddate",
        "sc1, sc2, sc3, name",
        "Resource1, Resource, Task, Assy_Resource, MachineResource",
      ],
      usedFor: "Production order rows, customer and sales-order context, dates, SC hierarchy, source status, resource/stage text, quantities, and future-demand candidates.",
    },
    {
      name: "d365fo.salesorderheaderv3staging",
      type: "table",
      role: "Sales-order header lookup used for header-level linkage.",
      fields: ["salesordernumber", "dataareaid"],
      usedFor: "The sales-header portion of deterministic linkage validation.",
    },
    {
      name: "d365fo.salesorderlinev2staging",
      type: "table",
      role: "Sales-order line lookup used to validate the machine item and obtain the inventory-lot demand key.",
      fields: ["salesordernumber", "dataareaid", "itemnumber", "inventorylotid", "islinestopped"],
      usedFor: "Sales-line matching and the inventory-lot identifier used to connect demand to the production order header. islinestopped is available in the source model but is not currently an active stop rule.",
    },
    {
      name: "d365fo.prodproductionorderheaderstaging",
      type: "table",
      role: "Production-order demand lookup used to verify that the source work order is tied to the sales-line demand.",
      fields: ["demandsalesordernumber", "demandsalesorderlineinventorylotid", "dataareaid", "itemnumber", "productionordernumber"],
      usedFor: "Production-demand matching in the linkage audit. The deployed query uses the actual source column demandsalesorderlineinventorylotid for the inventory-lot comparison.",
    },
    {
      name: "ProductionPriorityResponse",
      type: "contract",
      role: "Validated read-only API response consumed by the Board and described by the downloadable technical documents.",
      fields: ["orders[]", "demand[]", "dataQuality", "dataAsOf"],
      usedFor: "Stable boundary between server data rules and browser presentation. The OpenAPI document is the contract source of truth; generated Zod and client types validate/consume it.",
    },
  ] satisfies DataflowObject[],
  sections: [
    {
      title: "1. Source rowset and mandatory scope filters",
      summary: "The first CTE filters the machine view before any order, demand, team, KPI, or data-quality result is produced.",
      items: [
        {
          name: "Required source predicate",
          stage: "guardrail",
          formula:
            "Keep only itemnumber != '02002107' AND sc2 in [Electmech, Machine, Hydraulic] AND sc1 in the approved list AND sc3 in the approved list AND normalized status not in [COMPLETED, REPORTEDFINISHED] AND salesorderpoolid does not contain 'Consign' (case-insensitive).",
          result: "The filtered machine CTE is the only rowset passed into stop auditing, linkage auditing, order mapping, demand derivation, and quality counts.",
          source: "production-priority-filters.ts → requiredProductionPriorityWhereSql() and isRequiredProductionPriorityRow()",
        },
        {
          name: "Approved SC1 values",
          stage: "guardrail",
          formula: "Automated, FoldingEnd, HDT, Met-Impact, MFI, Plas-Impac, Retrofit, SL-Series, Torsion, Horizontal.",
          result: "Rows outside the approved SC1 taxonomy never reach the browser.",
          source: "production-priority-filters.ts → ALLOWED_SC1",
        },
        {
          name: "Approved SC3 values",
          stage: "guardrail",
          formula: "2000SL, SL-ST, Misc, IT406, HDVT3, 600SL, Torsion, 300SL, 1000SL, NO-CNSL, MP1500, MP1200MAN, MP1200MWLD, MP1200ETO, CNSL-HYD, IT542, 799, CNSL-NOHYD, HDVT6.",
          result: "The selector can only be populated by approved SC3 values that have active returned orders; an approved team with no active rows is not shown.",
          source: "production-priority-filters.ts → ALLOWED_SC3; use-production-data.ts → useSC3Teams()",
        },
        {
          name: "Audit row identity",
          stage: "transform",
          formula: "ROW_NUMBER() OVER () AS audit_row_id, machine.*",
          result: "Each base row can be joined back to the stop and linkage audit CTEs without relying on a possibly duplicated production-order number.",
          source: "production-priority.ts → machine AS MATERIALIZED",
        },
      ],
    },
    {
      title: "2. Linkage audits",
      summary: "The server performs the relational checks before it labels a work order linked, partial, or unlinked.",
      items: [
        {
          name: "Sales header linkage",
          stage: "transform",
          formula: "Header matches when trimmed sales order, data-area/company, and non-empty machine item prerequisites are present; salesordernumber and dataareaid must match.",
          result: "salesHeaderMatched is a boolean input to linkageStatus and data-quality counts.",
          source: "production-priority.ts → linkage_audit; salesorderheaderv3staging",
        },
        {
          name: "Sales line linkage",
          stage: "transform",
          formula: "Line matches the header on sales order + data area and the machine on itemnumber.",
          result: "salesLineMatched verifies that the work-order item has a corresponding sales-order line.",
          source: "production-priority.ts → linkage_audit; salesorderlinev2staging",
        },
        {
          name: "Production demand linkage",
          stage: "transform",
          formula: "Production matches the line on inventory-lot demand id + sales order + data area + item number, and matches the machine production order number; inventorylotid must be non-empty.",
          result: "productionDemandMatched verifies that the source work order is tied to the same sales-line demand.",
          source: "production-priority.ts → linkage_audit; prodproductionorderheaderstaging",
        },
        {
          name: "Deterministic linkage status",
          stage: "transform",
          formula: "If sales order is blank → Unlinked. Otherwise Linked only when sales order, company, item, inventory-lot demand id, header match, line match, and production-demand match are all true; otherwise Partial.",
          result: "Each production order carries linkageStatus and linkageAudit booleans; Partial adds the LINKAGE NOT VALIDATED exception.",
          source: "production-priority-filters.ts → isValidatedProductionPriorityLinkage(), getProductionPriorityLinkageStatus()",
        },
      ],
    },
    {
      title: "3. Server normalization and order derivation",
      summary: "Raw PostgreSQL values are normalized into the typed ProductionOrder shape before the response is validated.",
      items: [
        {
          name: "Text normalization",
          stage: "transform",
          formula: "null/undefined → ''; all source strings are String(value).trim().",
          result: "Whitespace does not create false links, empty labels, or inconsistent filters.",
          source: "production-priority.ts → text(); production-priority-filters.ts → text()",
        },
        {
          name: "Usable dates",
          stage: "transform",
          formula: "A date is usable only when it exists and getUTCFullYear() >= 2000; otherwise it becomes ''.",
          result: "ERP year-1900 placeholders and nulls do not appear as real due dates or create false date exceptions. Date-only ERP values are compared and displayed by their UTC calendar components so browser/server timezone conversion cannot shift them to the prior day.",
          source: "production-priority.ts → usableDate(), iso(), isPastDue(); date-utils.ts → formatCalendarDate(), isCalendarDatePastDue()",
        },
        {
          name: "Status normalization",
          stage: "transform",
          formula: "Uppercase source status; contains START → STARTED; contains RELEASE → RELEASED; otherwise ''.",
          result: "By product decision, the API exposes exactly two operator statuses to the board.",
          source: "production-priority.ts → normalizeStatus()",
        },
        {
          name: "Active production rows",
          stage: "guardrail",
          formula: "From required rows, keep rows with a non-empty productionordernumber and a normalized status of STARTED or RELEASED.",
          result: "orders[] excludes Scheduled, Complete, blank, and any other status text, the same way it always excluded completed/reported-finished rows, along with rows without a production work order.",
          source: "production-priority.ts → activeRows",
        },
        {
          name: "Route-derived build start/end dates",
          stage: "transform",
          formula: "From vw_productionroutedetailsd365 joined on productionordernumber + dataareaid: buildStartDate = scheduledfromdate of the first operation (by operationnumber ascending) whose operationname is not 'Warehouse Pick%'; buildEndDate = scheduledenddate of the last operation (by operationnumber ascending) whose operationname is not 'Warehouse Receive%'; buildEndDate falls back to deliverydate when the order has no route rows.",
          result: "Build Start Date and Build End Date reflect when in-house production work actually begins and finishes on the route, matching how the Shop Floor App treats warehouse pick/receive as staging steps rather than production work.",
          source: "production-priority.ts → route_ops, build_dates CTEs",
        },
        {
          name: "Build, ship, stage, and resource fields",
          stage: "transform",
          formula: "salesShipDate = confirmedshippingdate || requestedshippingdate; currentStage = Task || Assy_Resource || Resource1; resource = MachineResource || Resource1 || Resource; productionGroup = the third slash-delimited segment of Resource, combining the W/H prefix when the path uses separate segments; productionGroupName = the matching costproductiongroupstaging.groupname by production group and company, falling back to productionGroup.",
          result: "The queue keeps the concise production-group code while the pop-out can show the full D365FO group name, such as Assy07-COHEN, KYLE G-1117.",
          source: "production-priority.ts → activeRows.map()",
        },
        {
          name: "Exception flags",
          stage: "transform",
          formula: "Add HOLD when stage/resource contains Hold; BUILD & SHIP PAST DUE when both dates are past due; BUILD DATE PAST DUE or SHIP DATE PAST DUE for one; NO BUILD DATE when build date is blank; LINKAGE NOT VALIDATED or UNLINKED from linkage status.",
          result: "The status and detail panel can explain late, hold-instruction, missing-date, and linkage conditions without recalculating them independently. By product decision, a stop condition no longer changes an order's status or excludes it from priority.",
          source: "production-priority.ts → exceptionFlags",
        },
        {
          name: "Sales order lines (detail panel)",
          stage: "transform",
          formula: "For every line on the order's sales order (salesordernumber + dataareaid, not just the item matching the work order) in salesorderlinev2staging: line = linenum; item = itemnumber; description = itemdesc || linedescription; qty = orderedsalesquantity; unit = salesunitsymbol; configuration = productconfigurationid; configName = matching translatedconfigurationname from ecoresproductmasterconfigurationtranslationstaging (by productmasterconfigurationid + item number, preferring en-us); reference = productionordernumber of the production order whose demand keys (sales order + data area + item + inventory lot id) match the line; status = salesorderlinestatus mapped 1=Open order, 2=Delivered, 3=Invoiced, 4=Canceled.",
          result: "The order details pop-out shows a Sales Order Lines table (Line, Item, Description, Configuration, Config Name, Qty, Unit, Reference, Status) mirroring the Shop Floor App's full order-line list; lines with no configuration or matching production order show as blank/—, matching stocked (non-configured) lines.",
          source: "production-priority.ts → sales_lines_raw, config_names, production_refs, sales_order_lines CTEs",
        },
      ],
    },
    {
      title: "4. Future-demand derivation",
      summary: "Demand without a production work order is still calculated from the same filtered source rows, but by product decision it only feeds the data-quality count — the Board no longer displays a demand panel or KPI.",
      items: [
        {
          name: "Future-demand candidate",
          stage: "output",
          formula: "Keep required rows where productionordernumber is blank AND salesordernumber is non-empty AND confirmedshippingdate or requestedshippingdate is usable and >= today at midnight.",
          result: "Each candidate becomes demand[] with status NO WORK ORDER and never enters orders[] or the executable priority sequence.",
          source: "production-priority.ts → hasFutureShipDate(), demand",
        },
        {
          name: "Demand display fields",
          stage: "transform",
          formula: "requestedDate = ordercreationdatetime || requestedshippingdate; salesShipDate = confirmedshippingdate || requestedshippingdate; qty = Number(orderedsalesquantity) or null.",
          result: "These fields remain on the API response for downstream/data-quality use, even though the Board no longer renders a demand panel.",
          source: "production-priority.ts → demand.map()",
        },
        {
          name: "Data-quality-only usage",
          stage: "output",
          formula: "demand.length feeds dataQuality.futureDemand; the client does not filter, sort, or display individual demand rows.",
          result: "Future demand without a work order is visible only as a single count in the collapsible Data quality panel, not as an interactive list.",
          source: "production-priority.ts → dataQuality.futureDemand",
        },
      ],
    },
    {
      title: "5. Data-quality calculations and API response",
      summary: "The API counts the same normalized collections that it returns, so the data-quality panel is traceable to the live response.",
      items: [
        {
          name: "Work-order shape",
          stage: "output",
          formula: "machineRows = required filtered rows; validWorkOrders = orders whose workOrder matches /^\\d{6}$/; duplicateWorkOrders = number of distinct work-order values with count > 1.",
          result: "The panel shows source-row volume, valid six-digit work-order count, and duplicate work-order count.",
          source: "production-priority.ts → dataQuality",
        },
        {
          name: "Sales-order linkage counts",
          stage: "output",
          formula: "populatedSalesOrders and compatibility linkedOrders count non-empty salesOrder values; validatedSalesOrderLinks count all seven linkage prerequisites passing; partialLinkages count linkageStatus = Partial; unlinkedOrders count linkageStatus = Unlinked.",
          result: "Operators can distinguish a populated sales-order number from a fully validated header/line/production-demand relationship.",
          source: "production-priority.ts → dataQuality; production-priority-filters.ts → isValidatedProductionPriorityLinkage()",
        },
        {
          name: "Demand and validity counts",
          stage: "output",
          formula: "futureDemand = demand.length; futureDemandAlreadyLinked is currently 0; invalidSC3 counts returned orders with blank SC3; invalidDates counts source rows with a non-null deliverydate that cannot be parsed.",
          result: "The response exposes forward-demand and remaining shape/date indicators used by the Board and downloadable dataflow document.",
          source: "production-priority.ts → dataQuality",
        },
        {
          name: "Response validation and freshness",
          stage: "guardrail",
          formula: "Parse orders, demand, dataQuality, and dataAsOf with GetProductionPriorityResponse; cache a successful snapshot for 60,000 ms; dataAsOf = 'Azure PostgreSQL · ' + current ISO timestamp.",
          result: "A malformed response fails explicitly, repeated reads reuse the short server cache, and the browser can label evidence with its source timestamp.",
          source: "production-priority.ts → GetProductionPriorityResponse.parse(), getSnapshot()",
        },
      ],
    },
    {
      title: "6. Browser calculations and operator views",
      summary: "The browser does not query the database. It transforms the validated API snapshot into the selected team’s queue and presentation state.",
      items: [
        {
          name: "Team list, counts, and default",
          stage: "transform",
          formula: "teams = unique non-empty order.SC3 values sorted alphabetically; team count = non-complete orders per SC3; default team = highest count, then alphabetical tie-breaker; selected team persists in sessionStorage.",
          result: "SC3 controls the queue, KPIs, exceptions, and demand view without changing the server snapshot.",
          source: "use-production-data.ts → useSC3Teams(), useSC3Counts(), useSessionSC3()",
        },
        {
          name: "Group filter (SC1 over SC3)",
          stage: "transform",
          formula: "groups = unique non-empty order.SC1 values sorted alphabetically, with per-group counts of non-complete orders; selecting a group narrows the SC3 team row to teams whose orders share that SC1, resets the team selection to All, and persists the chosen group in sessionStorage (key sc1-group). Selecting All groups restores the full team list.",
          result: "Supervisors can filter to a whole family of SC3 teams (e.g. all SL-Series lines) at once instead of picking one team at a time, without changing the server snapshot.",
          source: "use-production-data.ts → useSC1Groups(), useSC1Counts(), useSessionSC1(), useSC3TeamsForGroup()",
        },
        {
          name: "Queue filtering",
          stage: "transform",
          formula: "Optionally restrict to a selected SC1 group, then select a specific SC3 team or All; search lowercases and matches workOrder, salesOrder, or customer; then apply the Started/Released status filter or the Past Due filter.",
          result: "The visible table is a selected, searchable operational view of the snapshot; the search control lives beside the KPI filter cards, with All group / All team providing a cross-team queue.",
          source: "use-production-data.ts → useProductionData()",
        },
        {
          name: "Queue sorting",
          stage: "transform",
          formula: "Work order/customer sorts lexically. Date sorts use the selected date ascending, with missing dates last and work-order tie-breaks. Default priority sort uses build end date, sales ship date, and work order.",
          result: "The first row in the visible queue is the next executable work order.",
          source: "use-production-data.ts → byDateThenWorkOrder(), useProductionData()",
        },
        {
          name: "Executable priority number",
          stage: "output",
          formula: "priority = index of the order in the visible, sorted queue + 1.",
          result: "By product decision, every visible order receives a numeric priority; a stop condition no longer removes an order from the sequence.",
          source: "use-production-data.ts → getExecutablePriority()",
        },
        {
          name: "KPI calculations",
          stage: "output",
          formula: "Active work orders = total orders in the current group/team/search scope; Started/Released = scoped orders with that status; Build date past due = scoped orders whose buildEndDate is before today. Clicking a KPI applies its All Active, Started, Released, or Past Due filter to the queue.",
          result: "The KPI strip provides both category totals and the queue filter controls, while the selected card indicates the active grid view.",
          source: "use-production-data.ts → useStats()",
        },
        {
          name: "Live evidence state",
          stage: "guardrail",
          formula: "Loading while the first query is pending; Live after a successful snapshot; Stale when a refresh fails after a prior snapshot; Unavailable when the first query fails with no snapshot.",
          result: "The Dataflow and Requirements Review documents do not present empty fallback zeros as verified live evidence.",
          source: "use-production-data.ts → usePrioritySnapshot(); generated documents are static and do not present live evidence",
        },
      ],
    },
    {
      title: "7. Deliberately not calculated",
      summary: "The following values are intentionally absent from the dataflow and API because the product scope is operational priority, not capacity planning.",
      items: [
        {
          name: "Capacity and utilization",
          stage: "guardrail",
          formula: "No available hours, labor hours, resource loading, utilization percentage, finite scheduling, bottleneck score, or capacity gap is calculated.",
          result: "The board communicates sequence, lateness, and stops without making capacity claims.",
          source: "Product scope decision documented in the Requirements Review and replit.md",
        },
        {
          name: "Executable schedule",
          stage: "guardrail",
          formula: "Priority is an ordered view index, not a promised start time, finish time, machine allocation, or optimized schedule.",
          result: "Supervisors use the order as a transparent decision aid; the app does not imply that an order is scheduled for a particular hour.",
          source: "use-production-data.ts → getExecutablePriority()",
        },
      ],
    },
  ] satisfies DataflowSection[],
} as const;
