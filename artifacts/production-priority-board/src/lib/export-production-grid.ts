import type { ProductionOrder } from "@/lib/mock-data";

const toExcelDate = (value: string) => {
  if (!value) return null;

  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? value : date;
};

export async function exportProductionGridToExcel(
  orders: ProductionOrder[],
  priorityById: ReadonlyMap<string, number>,
) {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "Production Priority Board";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Production Priority");
  worksheet.columns = [
    { header: "Priority", key: "priority", width: 10 },
    { header: "Work Order", key: "workOrder", width: 18 },
    { header: "Part Number", key: "itemNumber", width: 20 },
    { header: "Description", key: "description", width: 42 },
    { header: "Customer", key: "customer", width: 32 },
    { header: "Sales Order", key: "salesOrder", width: 18 },
    { header: "Customer Reference", key: "customerPO", width: 22 },
    { header: "Build Start", key: "buildStartDate", width: 15 },
    { header: "Build End", key: "buildEndDate", width: 15 },
    { header: "Ship Date", key: "salesShipDate", width: 15 },
    { header: "Status", key: "status", width: 15 },
    { header: "Production Group", key: "productionGroup", width: 20 },
    {
      header: "Production Group Name",
      key: "productionGroupName",
      width: 32,
    },
  ];

  for (const order of orders) {
    worksheet.addRow({
      priority: priorityById.get(order.id) ?? "",
      workOrder: order.workOrder,
      itemNumber: order.itemNumber,
      description: order.description,
      customer: order.customer,
      salesOrder: order.salesOrder,
      customerPO: order.customerPO,
      buildStartDate: toExcelDate(order.buildStartDate),
      buildEndDate: toExcelDate(order.buildEndDate),
      salesShipDate: toExcelDate(order.salesShipDate),
      status: order.status,
      productionGroup: order.productionGroup,
      productionGroupName: order.productionGroupName,
    });
  }

  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: "A1",
    to: "M1",
  };
  worksheet.getRow(1).font = { bold: true, color: { argb: "FF00281D" } };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFB7FF00" },
  };
  worksheet.getColumn("buildStartDate").numFmt = "mm/dd/yyyy";
  worksheet.getColumn("buildEndDate").numFmt = "mm/dd/yyyy";
  worksheet.getColumn("salesShipDate").numFmt = "mm/dd/yyyy";

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = href;
  link.download = `production-priority-${date}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}
