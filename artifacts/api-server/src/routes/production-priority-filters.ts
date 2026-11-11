export type ProductionPriorityFilterRow = {
  dataareaid: string | null;
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

const text = (value: string | null) => value?.trim() ?? "";
const normalizedStatus = (value: string | null) =>
  text(value).replaceAll(" ", "").toUpperCase();

export const isRequiredProductionPriorityRow = (
  row: ProductionPriorityFilterRow,
) =>
  text(row.dataareaid) === "TOUS" &&
  text(row.sc2) === "Machine" &&
  ["STARTED", "RELEASED"].includes(normalizedStatus(row.status));

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

export const isEligibleSalesLinkedMachineOrder = (
  row: ProductionPriorityFilterRow & ProductionPriorityLinkageRow,
) => isRequiredProductionPriorityRow(row) && isValidatedProductionPriorityLinkage(row);

export const requiredProductionPriorityWhereSql = () => `
  BTRIM(COALESCE(dataareaid, '')) = 'TOUS'
  AND BTRIM(COALESCE(sc2, '')) = 'Machine'
  AND UPPER(REPLACE(BTRIM(COALESCE(status, '')), ' ', '')) IN (
    'STARTED', 'RELEASED'
  )
  AND NULLIF(BTRIM(salesordernumber), '') IS NOT NULL
  AND NULLIF(BTRIM(inventorylotdemandid), '') IS NOT NULL
  AND salesheadermatched AND saleslinematched AND productiondemandmatched
`;