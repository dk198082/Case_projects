type SalesOrderCustomerNameSource = {
  salesheadercustomername: unknown;
  salesordername: unknown;
  name: unknown;
};

const text = (value: unknown) => (value == null ? "" : String(value).trim());

export const getSalesOrderCustomerName = (
  row: SalesOrderCustomerNameSource,
) =>
  text(row.salesheadercustomername) ||
  text(row.salesordername) ||
  text(row.name) ||
  "—";

export const getWorkOrderQuantity = (row: {
  scheduledquantity: unknown;
  estimatedquantity: unknown;
  remainingreportasfinishedquantity: unknown;
}) => {
  const numericQuantity = (value: unknown) => {
    if (value == null || String(value).trim() === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const scheduled =
    numericQuantity(row.scheduledquantity) ??
    numericQuantity(row.estimatedquantity) ??
    0;

  return {
    scheduled,
    remaining:
      numericQuantity(row.remainingreportasfinishedquantity) ?? scheduled,
  };
};