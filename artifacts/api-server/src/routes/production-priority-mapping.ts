type SalesOrderCustomerNameSource = {
  salesheadercustomername: unknown;
  salesordername: unknown;
  name: unknown;
};

const text = (value: unknown) => (value == null ? "" : String(value).trim());

export const getClassificationLabel = (value: unknown) => text(value) || "Unclassified";

export const getOrderConfiguration = (
  workOrder: string,
  itemNumber: string,
  lines: readonly {
    reference: string;
    item: string;
    configuration: string;
    configName: string;
  }[],
) => {
  const matches = workOrder && itemNumber
    ? lines.filter((line) => line.reference === workOrder && line.item === itemNumber)
    : [];
  const ids = new Set(matches.map((line) => text(line.configuration)));
  if (ids.size !== 1 || !matches.length) {
    return { configId: "", configDescription: "" };
  }
  const configId = text(matches[0].configuration);
  const descriptions = [...new Set(matches.map((line) => text(line.configName)).filter(Boolean))];
  return {
    configId,
    configDescription: configId && descriptions.length === 1 ? descriptions[0] : "",
  };
};

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