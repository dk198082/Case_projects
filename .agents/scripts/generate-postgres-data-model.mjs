import { mkdir, writeFile } from "node:fs/promises";

const outDir = new URL("../outputs/", import.meta.url);
await mkdir(outDir, { recursive: true });

const objects = [
  {
    name: "vw_salesprodmachines365",
    type: "View",
    rows: "View",
    role: "Primary production-priority source. One working set combines sales demand, production-order status, classifications, dates, resource routing, and descriptive fields.",
    keys: ["salesordernumber", "dataareaid", "itemnumber", "productionordernumber", "productiongroupid"],
    fields: [
      "salesordernumber", "dataareaid", "salesorderpoolid", "salesordername",
      "deliveryaddressname", "confirmedshippingdate", "requestedshippingdate",
      "ordercreationdatetime", "engineeringnotes", "itemnumber", "itemdesc",
      "orderedsalesquantity", "deliverydate", "scheduledstartdate",
      "productionorderstatus", "starteddate", "endeddate", "status",
      "productionordername", "productionordernumber", "sc1", "sc2", "sc3",
      "name", "Resource1", "Resource", "Task", "Assy_Resource",
      "MachineResource", "productiongroupid",
    ],
    outputs: "Board rows, future demand, customer/destination fallbacks, work-order and sales-order identifiers, dates, status, resource/stage, classification filters, description, quantity, and notes.",
    notes: "Filtered first into a MATERIALIZED working set. The API adds a synthetic audit_row_id so all later enrichments aggregate back to the correct source row.",
  },
  {
    name: "salesorderheaderv3staging",
    type: "Table",
    rows: "≈112,743",
    role: "Sales Order header enrichment and linkage validation.",
    keys: ["salesordernumber", "dataareaid"],
    fields: ["salesordernumber", "dataareaid", "salesordername"],
    outputs: "Authoritative Customer Name and evidence that the Sales Order header exists.",
    notes: "Customer Name comes from salesordername. deliveryaddressname is not a customer name; it remains a ship-to/destination label.",
  },
  {
    name: "salesorderlinev2staging",
    type: "Table",
    rows: "≈355,646",
    role: "Provides the complete Sales Order line list and connects sales demand to production demand.",
    keys: ["salesordernumber", "dataareaid", "itemnumber", "inventorylotid"],
    fields: [
      "salesordernumber", "dataareaid", "linenum", "itemnumber", "itemdesc",
      "linedescription", "productconfigurationid", "orderedsalesquantity",
      "salesunitsymbol", "salesorderlinestatus", "inventorylotid",
    ],
    outputs: "Line number, item, description, configuration, quantity, unit, status, inventory-lot demand ID, and Sales Order line linkage status.",
    notes: "The detail panel intentionally loads every line for the Sales Order, not only the line matching the board row’s item.",
  },
  {
    name: "prodproductionorderheaderstaging",
    type: "Table",
    rows: "≈172,520",
    role: "Validates the production-demand relationship and resolves a production-order reference for each Sales Order line.",
    keys: [
      "productionordernumber", "demandsalesordernumber", "dataareaid",
      "itemnumber", "demandsalesorderlineinventorylotid",
    ],
    fields: [
      "productionordernumber", "demandsalesordernumber", "dataareaid",
      "itemnumber", "demandsalesorderlineinventorylotid",
    ],
    outputs: "Production-demand linkage status and the line-level production-order Reference shown in order details.",
    notes: "Reference lookup is deduplicated once in a MATERIALIZED CTE, keyed by company, Sales Order, item, and demand lot.",
  },
  {
    name: "vw_productionroutedetailsd365",
    type: "View",
    rows: "View",
    role: "Supplies dated manufacturing route operations used to derive build start and end dates.",
    keys: ["productionordernumber", "dataareaid", "operationnumber"],
    fields: [
      "productionordernumber", "dataareaid", "operationnumber", "operationname",
      "scheduledfromdate", "scheduledenddate",
    ],
    outputs: "Build Start Date from the first production operation and Build End Date from the last production operation.",
    notes: "Warehouse Pick and Warehouse Receive operations are excluded. Placeholder dates before year 2000 are ignored.",
  },
  {
    name: "ecoresproductmasterconfigurationtranslationstaging",
    type: "Table",
    rows: "≈8,524",
    role: "Translates a product configuration code into its readable configuration name.",
    keys: ["productmasterconfigurationid", "productmasternumber", "languageid"],
    fields: [
      "productmasterconfigurationid", "productmasternumber",
      "translatedconfigurationname", "languageid",
    ],
    outputs: "Configuration Name in the Sales Order line details.",
    notes: "Rows are deduplicated by configuration and item; en-us is preferred when multiple languages exist.",
  },
  {
    name: "costproductiongroupstaging",
    type: "Table",
    rows: "≈96",
    role: "Resolves a production-group code to its readable production-group name.",
    keys: ["groupid", "dataareaid"],
    fields: ["groupid", "dataareaid", "groupname", "tomodifieddatetime"],
    outputs: "Production Group Name used in the board and detail context.",
    notes: "The newest row by tomodifieddatetime is selected for each company and group ID.",
  },
  {
    name: "sessions",
    type: "Table",
    rows: "≈42",
    role: "Server-side Express session storage for authenticated Production Priority Board users.",
    keys: ["sid"],
    fields: ["sid", "sess", "expire"],
    outputs: "Persistent authenticated session state and expiration control.",
    notes: "Independent of production data. sid is the primary key; expire is indexed for cleanup. sess is JSONB.",
  },
];

const relationships = [
  ["Machine view", "Sales Order header", "salesordernumber + dataareaid", "0..1"],
  ["Machine view", "Sales Order lines", "salesordernumber + dataareaid", "0..many"],
  ["Sales Order header", "Sales Order lines", "salesordernumber + dataareaid", "1..many"],
  ["Sales Order lines", "Production header", "company + Sales Order + item + inventory lot", "0..many"],
  ["Machine view", "Route details", "productionordernumber + dataareaid", "0..many"],
  ["Sales Order lines", "Configuration translation", "configuration ID + item number", "0..1"],
  ["Machine view", "Production group", "productiongroupid + dataareaid", "0..1"],
];

const escape = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const objectSection = (item, index) => `
  <section class="object page-break-before">
    <div class="object-title">
      <div>
        <div class="eyebrow">Object ${String(index + 1).padStart(2, "0")} · ${escape(item.type)}</div>
        <h2>${escape(item.name)}</h2>
      </div>
      <div class="metric"><strong>${escape(item.rows)}</strong><span>estimated rows</span></div>
    </div>
    <p class="lead">${escape(item.role)}</p>
    <div class="two-col">
      <div class="panel">
        <h3>Join / identity fields</h3>
        <div class="pills">${item.keys.map((field) => `<code>${escape(field)}</code>`).join("")}</div>
      </div>
      <div class="panel">
        <h3>Application output</h3>
        <p>${escape(item.outputs)}</p>
      </div>
    </div>
    <div class="panel fields">
      <h3>Columns read by the application</h3>
      <div class="field-grid">${item.fields.map((field) => `<code>${escape(field)}</code>`).join("")}</div>
    </div>
    <div class="callout"><strong>Implementation note</strong><span>${escape(item.notes)}</span></div>
  </section>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Production Priority Board — PostgreSQL Data Model</title>
<style>
  @page { size: Letter; margin: 0.55in; }
  :root {
    --ink: #14231b; --muted: #53665a; --line: #b9c8bd;
    --green: #0b5a39; --lime: #9dcc29; --wash: #f1f6f2; --dark: #063f2a;
    font-family: Arial, "Segoe UI", sans-serif; color: var(--ink);
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: white; font-size: 10.3pt; line-height: 1.45; }
  section { break-inside: avoid; }
  .cover { min-height: 9.2in; display: flex; flex-direction: column; justify-content: space-between; padding: .35in .25in; }
  .cover h1 { max-width: 6.8in; margin: .18in 0; font-size: 35pt; line-height: 1.02; letter-spacing: -1.4px; color: var(--dark); }
  .cover .subtitle { max-width: 6.5in; font-size: 14pt; color: var(--muted); }
  .cover-band { height: 12px; width: 1.25in; background: var(--lime); margin-bottom: .3in; }
  .cover-meta { display: grid; grid-template-columns: 1fr 1fr; gap: .2in; border-top: 1px solid var(--line); padding-top: .2in; color: var(--muted); }
  .cover-meta strong { display: block; color: var(--ink); }
  .page-break-before { break-before: page; }
  .eyebrow { text-transform: uppercase; letter-spacing: 1.4px; color: var(--green); font-size: 8pt; font-weight: 700; }
  h2 { margin: 6px 0 12px; color: var(--dark); font-size: 23pt; line-height: 1.08; }
  h3 { margin: 0 0 8px; color: var(--green); font-size: 10pt; text-transform: uppercase; letter-spacing: .55px; }
  p { margin: 0; }
  .lead { font-size: 12pt; color: var(--muted); margin-bottom: 18px; }
  .section-head { border-bottom: 3px solid var(--lime); padding-bottom: 10px; margin-bottom: 18px; }
  .scope-grid, .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .panel { border: 1px solid var(--line); background: var(--wash); padding: 14px; break-inside: avoid; }
  .panel ul { margin: 6px 0 0 18px; padding: 0; }
  .panel li { margin: 5px 0; }
  .architecture { margin-top: 16px; border: 1px solid var(--line); padding: 16px; }
  svg { width: 100%; height: auto; display: block; }
  .legend { display: flex; gap: 18px; margin-top: 10px; color: var(--muted); font-size: 8.5pt; }
  .legend b { color: var(--ink); }
  table { width: 100%; border-collapse: collapse; font-size: 8.7pt; }
  th { text-align: left; color: white; background: var(--green); padding: 8px; }
  td { border-bottom: 1px solid var(--line); padding: 8px; vertical-align: top; }
  tr:nth-child(even) td { background: var(--wash); }
  code { font-family: "SFMono-Regular", Consolas, monospace; font-size: 8.2pt; }
  .object { padding-top: 2px; }
  .object-title { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 3px solid var(--lime); padding-bottom: 10px; margin-bottom: 16px; }
  .object-title h2 { margin-bottom: 0; overflow-wrap: anywhere; }
  .metric { text-align: right; min-width: 1.25in; color: var(--muted); }
  .metric strong { display: block; color: var(--dark); font-size: 17pt; }
  .metric span { font-size: 8pt; text-transform: uppercase; letter-spacing: .5px; }
  .pills, .field-grid { display: flex; flex-wrap: wrap; gap: 6px; }
  .pills code, .field-grid code { display: inline-block; padding: 5px 7px; border: 1px solid var(--line); background: white; overflow-wrap: anywhere; }
  .fields { margin-top: 12px; }
  .field-grid code { width: calc(33.333% - 4px); }
  .callout { display: grid; grid-template-columns: 1.35in 1fr; gap: 12px; margin-top: 12px; padding: 12px 14px; color: white; background: var(--dark); }
  .callout strong { color: #c9f466; text-transform: uppercase; font-size: 8pt; letter-spacing: .6px; }
  .rules { display: grid; gap: 10px; }
  .rule { border-left: 5px solid var(--lime); padding: 10px 12px; background: var(--wash); }
  .rule strong { display: block; color: var(--green); margin-bottom: 3px; }
  .footer-note { margin-top: 18px; color: var(--muted); font-size: 8.5pt; }
</style>
</head>
<body>
  <section class="cover">
    <div>
      <div class="cover-band"></div>
      <div class="eyebrow">Technical Reference · Production Priority Board</div>
      <h1>PostgreSQL Data Model</h1>
      <p class="subtitle">All PostgreSQL tables and views directly used by the application, including relationships, join keys, field usage, transformation rules, and operational constraints.</p>
    </div>
    <div class="cover-meta">
      <div><strong>Scope</strong>Current application runtime</div>
      <div><strong>Prepared</strong>18 September 2026</div>
      <div><strong>Source</strong>Azure PostgreSQL / D365FO staging schema</div>
      <div><strong>Inventory</strong>6 tables · 2 views</div>
    </div>
  </section>

  <section class="page-break-before">
    <div class="section-head"><div class="eyebrow">01 · Scope</div><h2>What this model covers</h2></div>
    <div class="scope-grid">
      <div class="panel">
        <h3>Included</h3>
        <ul>
          <li>Every PostgreSQL object directly referenced by the API or session store.</li>
          <li>The columns actually read by the application.</li>
          <li>Logical relationships and normalized join keys.</li>
          <li>Derived dates, enrichment rules, and linkage validation.</li>
          <li>Live approximate row counts for physical tables.</li>
        </ul>
      </div>
      <div class="panel">
        <h3>Not included</h3>
        <ul>
          <li>Underlying base objects hidden inside the two database views.</li>
          <li>Columns present in source tables but never read by this application.</li>
          <li>Admin Console data, which is accessed through an HTTP API rather than PostgreSQL.</li>
          <li>Browser-only state and generated API response types.</li>
        </ul>
      </div>
    </div>
    <div class="architecture">
      <h3>Runtime architecture</h3>
      <svg viewBox="0 0 920 265" role="img" aria-label="Runtime architecture">
        <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#0b5a39"/></marker></defs>
        <rect x="15" y="70" width="205" height="105" rx="8" fill="#063f2a"/>
        <text x="118" y="105" text-anchor="middle" fill="#c9f466" font-size="14" font-weight="700">Azure PostgreSQL</text>
        <text x="118" y="130" text-anchor="middle" fill="white" font-size="12">D365FO views + staging tables</text>
        <text x="118" y="152" text-anchor="middle" fill="white" font-size="12">sessions table</text>
        <line x1="220" y1="122" x2="345" y2="122" stroke="#0b5a39" stroke-width="3" marker-end="url(#arrow)"/>
        <rect x="350" y="70" width="205" height="105" rx="8" fill="#f1f6f2" stroke="#0b5a39"/>
        <text x="452" y="105" text-anchor="middle" fill="#063f2a" font-size="14" font-weight="700">API Server</text>
        <text x="452" y="130" text-anchor="middle" fill="#53665a" font-size="12">Read-only snapshot query</text>
        <text x="452" y="152" text-anchor="middle" fill="#53665a" font-size="12">60-second in-memory cache</text>
        <line x1="555" y1="122" x2="680" y2="122" stroke="#0b5a39" stroke-width="3" marker-end="url(#arrow)"/>
        <rect x="685" y="70" width="220" height="105" rx="8" fill="#f1f6f2" stroke="#0b5a39"/>
        <text x="795" y="105" text-anchor="middle" fill="#063f2a" font-size="14" font-weight="700">Priority Board</text>
        <text x="795" y="130" text-anchor="middle" fill="#53665a" font-size="12">Active production queue</text>
        <text x="795" y="152" text-anchor="middle" fill="#53665a" font-size="12">Future demand + order details</text>
      </svg>
      <p class="footer-note">The browser never connects directly to PostgreSQL. Database credentials and source access remain server-side.</p>
    </div>
  </section>

  <section class="page-break-before">
    <div class="section-head"><div class="eyebrow">02 · Entity relationships</div><h2>Logical data model</h2></div>
    <svg viewBox="0 0 940 680" role="img" aria-label="PostgreSQL logical relationship diagram">
      <defs><marker id="relArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#54705d"/></marker></defs>
      <rect x="335" y="20" width="270" height="100" rx="7" fill="#063f2a"/>
      <text x="470" y="51" text-anchor="middle" fill="#c9f466" font-size="15" font-weight="700">vw_salesprodmachines365</text>
      <text x="470" y="76" text-anchor="middle" fill="white" font-size="11">Central production + demand view</text>
      <text x="470" y="97" text-anchor="middle" fill="white" font-size="10">SO · company · item · production order</text>

      <rect x="25" y="210" width="250" height="90" rx="7" fill="#f1f6f2" stroke="#0b5a39"/>
      <text x="150" y="240" text-anchor="middle" fill="#063f2a" font-size="13" font-weight="700">salesorderheaderv3staging</text>
      <text x="150" y="264" text-anchor="middle" fill="#53665a" font-size="10">Customer name + header match</text>
      <text x="150" y="283" text-anchor="middle" fill="#53665a" font-size="9">SO + company</text>

      <rect x="345" y="210" width="250" height="90" rx="7" fill="#f1f6f2" stroke="#0b5a39"/>
      <text x="470" y="240" text-anchor="middle" fill="#063f2a" font-size="13" font-weight="700">salesorderlinev2staging</text>
      <text x="470" y="264" text-anchor="middle" fill="#53665a" font-size="10">Full Sales Order line details</text>
      <text x="470" y="283" text-anchor="middle" fill="#53665a" font-size="9">SO + company + item + lot</text>

      <rect x="665" y="210" width="250" height="90" rx="7" fill="#f1f6f2" stroke="#0b5a39"/>
      <text x="790" y="238" text-anchor="middle" fill="#063f2a" font-size="12" font-weight="700">vw_productionroutedetailsd365</text>
      <text x="790" y="264" text-anchor="middle" fill="#53665a" font-size="10">Build start/end operations</text>
      <text x="790" y="283" text-anchor="middle" fill="#53665a" font-size="9">production order + company</text>

      <rect x="75" y="410" width="260" height="90" rx="7" fill="#f1f6f2" stroke="#0b5a39"/>
      <text x="205" y="438" text-anchor="middle" fill="#063f2a" font-size="11.5" font-weight="700">prodproductionorderheaderstaging</text>
      <text x="205" y="464" text-anchor="middle" fill="#53665a" font-size="10">Demand validation + line reference</text>
      <text x="205" y="483" text-anchor="middle" fill="#53665a" font-size="9">company + SO + item + lot</text>

      <rect x="365" y="410" width="260" height="90" rx="7" fill="#f1f6f2" stroke="#0b5a39"/>
      <text x="495" y="436" text-anchor="middle" fill="#063f2a" font-size="10.8" font-weight="700">configurationtranslationstaging</text>
      <text x="495" y="464" text-anchor="middle" fill="#53665a" font-size="10">Readable configuration name</text>
      <text x="495" y="483" text-anchor="middle" fill="#53665a" font-size="9">configuration ID + item</text>

      <rect x="655" y="410" width="260" height="90" rx="7" fill="#f1f6f2" stroke="#0b5a39"/>
      <text x="785" y="438" text-anchor="middle" fill="#063f2a" font-size="12" font-weight="700">costproductiongroupstaging</text>
      <text x="785" y="464" text-anchor="middle" fill="#53665a" font-size="10">Production group name</text>
      <text x="785" y="483" text-anchor="middle" fill="#53665a" font-size="9">group ID + company</text>

      <rect x="345" y="580" width="250" height="75" rx="7" fill="#063f2a"/>
      <text x="470" y="610" text-anchor="middle" fill="#c9f466" font-size="14" font-weight="700">sessions</text>
      <text x="470" y="633" text-anchor="middle" fill="white" font-size="10">Independent authentication state</text>

      <path d="M390 120 L190 210" fill="none" stroke="#54705d" stroke-width="2" marker-end="url(#relArrow)"/>
      <path d="M470 120 L470 210" fill="none" stroke="#54705d" stroke-width="2" marker-end="url(#relArrow)"/>
      <path d="M550 120 L750 210" fill="none" stroke="#54705d" stroke-width="2" marker-end="url(#relArrow)"/>
      <path d="M420 300 L240 410" fill="none" stroke="#54705d" stroke-width="2" marker-end="url(#relArrow)"/>
      <path d="M500 300 L500 410" fill="none" stroke="#54705d" stroke-width="2" marker-end="url(#relArrow)"/>
      <path d="M560 120 C700 140, 750 300, 785 410" fill="none" stroke="#54705d" stroke-width="2" marker-end="url(#relArrow)"/>
      <text x="291" y="163" fill="#53665a" font-size="9">0..1</text>
      <text x="478" y="166" fill="#53665a" font-size="9">0..many</text>
      <text x="664" y="163" fill="#53665a" font-size="9">0..many</text>
    </svg>
    <div class="callout"><strong>Key convention</strong><span>Most D365FO relationships are company-aware. dataareaid must be included with the business identifier to prevent cross-company matches.</span></div>
  </section>

  <section class="page-break-before">
    <div class="section-head"><div class="eyebrow">03 · Inventory</div><h2>PostgreSQL objects used</h2></div>
    <table>
      <thead><tr><th>Object</th><th>Type</th><th>Approx. rows</th><th>Primary purpose</th></tr></thead>
      <tbody>${objects.map((item) => `<tr><td><code>${escape(item.name)}</code></td><td>${item.type}</td><td>${item.rows}</td><td>${escape(item.role)}</td></tr>`).join("")}</tbody>
    </table>
    <div class="panel" style="margin-top:16px">
      <h3>Relationship summary</h3>
      <table>
        <thead><tr><th>From</th><th>To</th><th>Join key</th><th>Cardinality</th></tr></thead>
        <tbody>${relationships.map((row) => `<tr>${row.map((cell, i) => `<td>${i === 2 ? `<code>${escape(cell)}</code>` : escape(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
    <p class="footer-note">Physical-table row counts are PostgreSQL statistics captured on 18 September 2026 and are approximate. Views do not expose a stable stored row count.</p>
  </section>

  ${objects.map(objectSection).join("")}

  <section class="page-break-before">
    <div class="section-head"><div class="eyebrow">12 · Processing rules</div><h2>How the model becomes board data</h2></div>
    <div class="rules">
      <div class="rule"><strong>1. Establish the working set</strong>Filter the central machine view to required production-priority rows, assign audit_row_id, and materialize the result.</div>
      <div class="rule"><strong>2. Validate linkage</strong>Join Sales Order header, matching Sales Order line, and production-demand header. Aggregate header/line/production match flags per source row.</div>
      <div class="rule"><strong>3. Derive build dates</strong>Join route operations by production order and company. Exclude warehouse operations and invalid pre-2000 dates; choose first and last valid production operations.</div>
      <div class="rule"><strong>4. Build complete order-line details</strong>Load all lines for each Sales Order. Enrich configuration names and line-level production references through set-based, deduplicated lookups.</div>
      <div class="rule"><strong>5. Enrich production group</strong>Resolve the latest company-specific group name from the production-group staging table.</div>
      <div class="rule"><strong>6. Normalize API output</strong>Split rows into active orders and future demand, normalize dates/statuses, calculate exception flags, and return a read-only snapshot.</div>
    </div>
  </section>

  <section class="page-break-before">
    <div class="section-head"><div class="eyebrow">13 · Controls and caveats</div><h2>Data quality and performance rules</h2></div>
    <div class="rules">
      <div class="rule"><strong>Normalize string keys</strong>Join keys use BTRIM and empty-string handling because D365FO staging values can contain whitespace or blanks.</div>
      <div class="rule"><strong>Always retain company context</strong>Use dataareaid with Sales Order, production order, and production-group identifiers whenever the source provides it.</div>
      <div class="rule"><strong>Do not confuse customer and destination</strong>Customer Name is salesorderheaderv3staging.salesordername. deliveryaddressname is only the ship-to destination.</div>
      <div class="rule"><strong>Avoid correlated large-table lookups</strong>Sales lines and production headers are large. Deduplicate once in MATERIALIZED CTEs and use set-based joins; do not use a per-row LATERAL scan.</div>
      <div class="rule"><strong>Treat dates before 2000 as placeholders</strong>Route sources can carry 1900-era placeholder dates. They are excluded before selecting build dates.</div>
      <div class="rule"><strong>Views are contracts</strong>This document models the columns the application consumes from each view. Changes inside a view can affect semantics even when its public column list remains unchanged.</div>
      <div class="rule"><strong>Session data is operational</strong>The sessions table contains authentication state, not production-domain records. It is isolated from all business-data joins.</div>
    </div>
    <div class="callout" style="margin-top:18px"><strong>Maintenance</strong><span>Regenerate this document whenever a source object, join key, selected column, transformation, or session-storage rule changes.</span></div>
  </section>
</body>
</html>`;

await writeFile(new URL("production-priority-postgres-data-model.html", outDir), html, "utf8");
console.log("Generated PostgreSQL data model HTML.");