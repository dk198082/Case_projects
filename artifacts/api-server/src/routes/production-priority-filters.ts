export type ProductionPriorityFilterRow = {
  itemnumber: string | null;
  salesorderpoolid: string | null;
  sc1: string | null;
  sc2: string | null;
  sc3: string | null;
  status: string | null;
};

export type ProductionPriorityLinkageRow = {
  salesordernumber: string | null;
  dataareaid: string | null;
  itemnumber: string | null;
  inventorylotdemandid: string | null;
  salesheadermatched: boolean;
  saleslinematched: boolean;
  productiondemandmatched: boolean;
};

export const ALLOWED_SC1 = [
  "Automated",
  "FoldingEnd",
  "HDT",
  "Met-Impact",
  "MFI",
  "Plas-Impac",
  "Retrofit",
  "SL-Series",
  "Torsion",
  "Horizontal",
] as const;

export const ALLOWED_SC2 = ["Electmech", "Machine", "Hydraulic"] as const;

export const ALLOWED_SC3 = [
  "2000SL",
  "SL-ST",
  "Misc",
  "IT406",
  "HDVT3",
  "600SL",
  "Torsion",
  "300SL",
  "1000SL",
  "NO-CNSL",
  "MP1500",
  "MP1200MAN",
  "MP1200MWLD",
  "MP1200ETO",
  "CNSL-HYD",
  "IT542",
  "799",
  "CNSL-NOHYD",
  "HDVT6",
] as const;

const SC1_VALUES = new Set<string>(ALLOWED_SC1);
const SC2_VALUES = new Set<string>(ALLOWED_SC2);
const SC3_VALUES = new Set<string>(ALLOWED_SC3);

const text = (value: string | null) => value?.trim() ?? "";
const normalizedStatus = (value: string | null) =>
  text(value).replaceAll(" ", "").toUpperCase();
const quoteSqlValue = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sqlList = (values: readonly string[]) => values.map(quoteSqlValue).join(", ");

export const isRequiredProductionPriorityRow = (
  row: ProductionPriorityFilterRow,
) =>
  text(row.itemnumber) !== "02002107" &&
  SC1_VALUES.has(text(row.sc1)) &&
  SC2_VALUES.has(text(row.sc2)) &&
  SC3_VALUES.has(text(row.sc3)) &&
  !["COMPLETED", "REPORTEDFINISHED"].includes(normalizedStatus(row.status)) &&
  !text(row.salesorderpoolid).toLowerCase().includes("consign");

export const isValidatedProductionPriorityLinkage = (
  row: ProductionPriorityLinkageRow,
) =>
  text(row.salesordernumber) !== "" &&
  text(row.dataareaid) !== "" &&
  text(row.itemnumber) !== "" &&
  text(row.inventorylotdemandid) !== "" &&
  row.salesheadermatched &&
  row.saleslinematched &&
  row.productiondemandmatched;

export const getProductionPriorityLinkageStatus = (
  row: ProductionPriorityLinkageRow,
) => {
  if (!text(row.salesordernumber)) return "Unlinked" as const;
  return isValidatedProductionPriorityLinkage(row)
    ? "Linked" as const
    : "Partial" as const;
};

export const requiredProductionPriorityWhereSql = () => `
  BTRIM(COALESCE(itemnumber, '')) <> '02002107'
  AND BTRIM(COALESCE(sc2, '')) IN (${sqlList(ALLOWED_SC2)})
  AND BTRIM(COALESCE(sc1, '')) IN (${sqlList(ALLOWED_SC1)})
  AND BTRIM(COALESCE(sc3, '')) IN (${sqlList(ALLOWED_SC3)})
  AND UPPER(REPLACE(BTRIM(COALESCE(status, '')), ' ', '')) NOT IN (
    'COMPLETED', 'REPORTEDFINISHED'
  )
  AND COALESCE(salesorderpoolid, '') NOT ILIKE '%Consign%'
`;