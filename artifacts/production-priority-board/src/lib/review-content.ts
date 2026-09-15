export type ReviewStatus = "fulfilled" | "partial" | "out-of-scope";

export type ReviewItem = {
  title: string;
  status: ReviewStatus;
  liveValidation?: "sales-order-linkage";
  requirement: string;
  functional: string;
  technical: string;
};

export type ReviewSection = {
  title: string;
  summary: string;
  items: ReviewItem[];
};

/**
 * Single source for the requirements review.
 *
 * When a user-visible behavior, data rule, or scope decision changes, update
 * this manifest and its review date alongside the implementation change.
 */
export const REQUIREMENTS_REVIEW: {
  version: string;
  reviewedOn: string;
  sourceDocument: string;
  title: string;
  sections: ReviewSection[];
} = {
  version: "2026.08.26",
  reviewedOn: "26 August 2026",
  sourceDocument: "PRODUCTION_PRIORITY_BOARD_replit_app_develop_1787559712168.docx",
  title: "Production Priority Board requirements review",
  sections: [
    {
      title: "Source, scope & architecture",
      summary: "The board is an operational priority and visibility tool, not a scheduling or capacity-planning engine.",
      items: [
        {
          title: "Live source and runtime boundary",
          status: "fulfilled",
          requirement: "Use the supplied production data while keeping the UI independent from the raw source format.",
          functional: "The board loads the current production snapshot and keeps the original workbook only as an audit/reference artifact.",
          technical: "The browser reads the read-only production-priority API. The API adapter reads Azure PostgreSQL through d365fo.vw_salesprodmachines365 and normalizes the response.",
        },
        {
          title: "Layered data architecture",
          status: "fulfilled",
          requirement: "Separate source data, linking/normalization, business rules, SC3 view, and presentation.",
          functional: "Operators see a concise queue without raw workbook parsing details.",
          technical: "Azure normalization and stop/filter rules live in the API; SC3 filtering, sorting, KPIs, and display behavior live in reusable hooks and page components.",
        },
        {
          title: "Capacity-planning boundary",
          status: "out-of-scope",
          requirement: "Do not show resource loading, utilization, labor capacity, finite scheduling, available hours, or bottleneck calculations.",
          functional: "The board answers what to work on next and what is late or blocked without pretending to optimize capacity.",
          technical: "No capacity, labor, utilization, bottleneck, or resource-loading calculations are present in the live contract or UI.",
        },
      ],
    },
    {
      title: "Linkage, source fidelity & validation",
      summary: "Production and commercial context is carried from the source view, with visible data-quality indicators.",
      items: [
        {
          title: "Production/order relationship visibility",
          status: "partial",
          liveValidation: "sales-order-linkage",
          requirement: "Connect work orders to sales orders and retain the production, customer, and SC3 relationship.",
          functional: "A work-order row shows production and commercial context from the live source and makes partial or unlinked exceptions explicit.",
          technical: "The API reconciles source sales headers and item lines to production-order demand using sales order, company, item, and inventory-lot demand identifiers. This requirement becomes fulfilled only while that audit is live.",
        },
        {
          title: "No invented source values",
          status: "fulfilled",
          requirement: "Blank source fields remain blank or display an em dash; customer information must come from linked source data.",
          functional: "Unavailable customer, date, destination, or reference details show as — instead of fabricated values.",
          technical: "The adapter trims source text, treats invalid/placeholder dates as empty, and maps absent fields to empty strings that the UI renders safely.",
        },
        {
          title: "Pre-render data-quality checks",
          status: "partial",
          requirement: "Validate work-order shape, linkage, SC3 values, dates, duplicates, future demand, and stop detection before rendering.",
          functional: "The expandable Data quality panel exposes the current validation counts without distracting production users.",
          technical: "The API reports valid six-digit work orders, duplicate orders, populated sales-order numbers, fully validated links, partial/unlinked links, invalid SC3 values, invalid dates, and future demand.",
        },
      ],
    },
    {
      title: "SC3 team structure & navigation",
      summary: "SC3 is the primary operating context and controls the queue, KPIs, exceptions, and demand view.",
      items: [
        {
          title: "Dynamic active-team selector",
          status: "fulfilled",
          requirement: "Organize the board around SC3 and show active-order counts for available teams.",
          functional: "Production users can select an SC3 team and immediately see its active-order count and queue.",
          technical: "The client derives the selector and counts from the API’s current non-complete orders. The server applies the approved SC3 allow-list before returning data.",
        },
        {
          title: "Default team and session memory",
          status: "fulfilled",
          requirement: "Open on the team with the largest active workload and remember the user’s selection during the browser session.",
          functional: "The busiest available SC3 is selected initially; returning users keep their team while the session remains active.",
          technical: "useSessionSC3 ranks active team counts and stores the selected value in sessionStorage.",
        },
        {
          title: "Required source filters",
          status: "fulfilled",
          requirement: "Exclude the configured item, disallowed SC1/SC2/SC3 values, completed statuses, and consignment pools.",
          functional: "Operators only see the approved production scope; these rules cannot be disabled from the UI.",
          technical: "The same predicate is applied in the Azure SQL WHERE clause and again server-side before orders, demand, KPIs, and teams are produced.",
        },
        {
          title: "SC1 group filter over SC3 teams",
          status: "fulfilled",
          requirement: "Allow filtering by a whole group of SC3 teams at once, using SC1 as the grouping value.",
          functional: "Operators can select a Sales Classification 1 group above the team row; the team row narrows to that group's teams and the queue/KPIs update to the combined group.",
          technical: "useSC1Groups/useSC1Counts/useSessionSC1 derive groups and persist the selection in sessionStorage; useSC3TeamsForGroup scopes the team list; useProductionData applies the SC1 filter before the SC3 filter.",
        },
      ],
    },
    {
      title: "Priority queue & dates",
      summary: "The primary view is a dense, traceable list driven by route-derived build need first.",
      items: [
        {
          title: "Single priority list",
          status: "fulfilled",
          requirement: "Present one vertically ordered list, with the first executable item as the next production priority.",
          functional: "The selected team’s queue is shown as a table so several orders can be compared at once.",
          technical: "The client calculates executable priority after SC3, search, status, past-due, and sort filters are applied.",
        },
        {
          title: "Internal build date leads",
          status: "fulfilled",
          requirement: "Prioritize internal build need, then sales ship date, then work order.",
          functional: "Build start, build end, and ship dates are all visible; the build end date drives the default order.",
          technical: "Build start/end dates are derived per work order from the production route (first non-warehouse-pick operation start, last non-warehouse-receive operation end). Default sorting uses build end date, sales ship date, and work-order tie-breakers.",
        },
        {
          title: "Stopped-order status override removed",
          status: "out-of-scope",
          requirement: "By product decision, a stop condition no longer changes an order's displayed status or removes it from executable priority.",
          functional: "A Started or Released order that also carries a stop condition (sales processing stop, sales-order stop flag, or Hold instruction) now displays and sorts exactly like any other Started or Released order.",
          technical: "The server no longer computes a stopped flag, stop reasons, or a STOPPED status overlay; the sales-processing-stop audit join was removed from the query, and the client no longer excludes any order from the executable priority sequence or shows an Order stopped KPI.",
        },
        {
          title: "Date exceptions",
          status: "fulfilled",
          requirement: "Highlight build past due, ship past due, both past due, and missing build dates.",
          functional: "Red dates and exception badges make late work visible without filling the entire row red.",
          technical: "Exception flags are derived from normalized source dates; year-1900 placeholders are treated as missing.",
        },
      ],
    },
    {
      title: "Status, stage & exceptions",
      summary: "ERP status and resource context are translated into operator-friendly labels without inventing new states.",
      items: [
        {
          title: "Operator status normalization",
          status: "fulfilled",
          requirement: "By product decision, show only two operator statuses: STARTED and RELEASED.",
          functional: "Rows show only Started or Released; orders that are Scheduled, Complete, blank, or any other source status are excluded from the board entirely, the same way completed orders always were.",
          technical: "The API keeps a row only when its normalized status is STARTED or RELEASED; every other source status value is filtered out of orders[] before the response is built.",
        },
        {
          title: "Stage/resource presentation",
          status: "fulfilled",
          requirement: "Retain current stage/resource context for order details while keeping the main queue concise.",
          functional: "The main table stays readable while the order detail view retains current stage and the full Resource value.",
          technical: "The adapter aliases mixed-case resource fields into stable API fields; OrderDetailsDialog exposes current stage and resource without adding them to the main table.",
        },
      ],
    },
    {
      title: "Demand, details, filters & search",
      summary: "Forward demand stays separate from actionable work, with concise rows and deeper detail on demand.",
      items: [
        {
          title: "Upcoming demand without a work order",
          status: "out-of-scope",
          requirement: "Show future machine demand separately and never assign it a production priority.",
          functional: "By product decision, the Board no longer surfaces an Upcoming demand panel or a demand KPI; supervisors work the executable queue only.",
          technical: "The API still derives demand from filtered rows with a sales order, future ship date, and no production order, but only to feed the futureDemand count in the data-quality panel — the client no longer renders or filters demand rows for display.",
        },
        {
          title: "Production detail view",
          status: "fulfilled",
          requirement: "Open a right-side drawer with production/commercial details for a selected work order.",
          functional: "Clicking a work order opens a right-side detail drawer that preserves the queue context.",
          technical: "OrderDetailsDialog uses an accessible sheet panel to expose source fields, dates, raw resource, and linkage while retaining a full-width mobile presentation.",
        },
        {
          title: "Simple filters and search",
          status: "fulfilled",
          requirement: "Support All Active, Started, Released, Past Due, and search within the selected team.",
          functional: "Operators can change status/date views, sort the queue, search by WO/SO/customer/PO/item, or select All to view every SC3 team.",
          technical: "useProductionData applies the team, status, date, and search filters before calculating priority; the UI exposes a small fixed filter set.",
        },
      ],
    },
    {
      title: "Presentation, responsiveness & operator success",
      summary: "The visual system emphasizes priority, dates, customer context, status, and exceptions on dark green surfaces.",
      items: [
        {
          title: "Visual hierarchy and palette",
          status: "fulfilled",
          requirement: "Use the dark green/lime corporate palette with readable secondary text, amber warnings, and red serious exceptions.",
          functional: "Priority, work order, build date, customer, sales order, ship date, and status are visible in the main row; stage and exception context remains available in order details.",
          technical: "The theme tokens use #00281D, #B7FF00, #C2D2BE, white, amber, and red across board surfaces and state treatments.",
        },
        {
          title: "Desktop and mobile layout",
          status: "fulfilled",
          requirement: "Optimize for a 1920×1080 production screen while remaining usable on laptops and mobile widths.",
          functional: "The table is dense on desktop, scrolls horizontally when needed, and the team/KPI controls wrap for smaller screens.",
          technical: "Responsive Tailwind layout, horizontal table overflow, compact row spacing, and mobile-safe stacking are implemented in Dashboard.",
        },
        {
          title: "Five-second operator questions",
          status: "partial",
          requirement: "A supervisor should quickly identify next work, late work, started/released work, customer, build date, ship date, and forward demand.",
          functional: "The board covers these questions when the source has the relevant fields; the requirements document records data-dependent gaps rather than hiding them.",
          technical: "Queue, KPIs, exceptions, details, and demand are present. Current live data can legitimately produce zero demand or omit teams whose only rows are complete.",
        },
      ],
    },
  ],
};
