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