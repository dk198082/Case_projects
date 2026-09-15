import { ProductionOrder } from "@/lib/mock-data";
import { formatCalendarDate } from "@/lib/date-utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

export function OrderDetailsDialog({ 
  order, 
  onClose 
}: { 
  order: ProductionOrder | null;
  onClose: () => void;
}) {
  if (!order) return null;

  return (
    <Sheet open={!!order} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full max-w-none overflow-y-auto border-primary/20 bg-card/95 p-4 sm:max-w-6xl md:p-6"
      >
        <SheetHeader className="p-0 pr-8 text-left">
          <div className="flex items-center justify-between mt-2">
            <SheetTitle className="text-2xl font-mono text-primary flex items-center gap-3">
              {order.workOrder}
            </SheetTitle>
            <Badge variant="outline" className="text-muted-foreground border-muted-foreground">
              {order.status}
            </Badge>
          </div>
          <SheetDescription className="font-mono text-muted-foreground mt-1">
            {order.itemNumber} - {order.description}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-4">
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
            <div className="space-y-6">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Production Group</p>
                <p className="font-mono">{order.productionGroupName || order.productionGroup || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Build Start Date</p>
                <p className="font-mono">
                  {formatCalendarDate(order.buildStartDate)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Build End Date</p>
                <p className="font-mono">
                  {formatCalendarDate(order.buildEndDate)}
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Sales Order</p>
                <p className="font-mono">{order.salesOrder}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Customer</p>
                <p className="font-medium text-foreground truncate" title={order.customer}>{order.customer}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Sales Ship Date</p>
                <p className="font-mono">{formatCalendarDate(order.salesShipDate)}</p>
              </div>
            </div>
          </div>

          {order.customerReference && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Engineering / Cust Ref</p>
              <div className="mt-1 text-sm bg-muted/30 p-3 rounded-md border border-border/30">
                {order.customerReference}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2 pb-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Sales Order Lines</p>
          {order.salesOrderLines.length === 0 ? (
            <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md border border-border/30">
              No sales order lines available.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border/30">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="px-3 py-2 text-left font-medium">Line</th>
                    <th className="px-3 py-2 text-left font-medium">Item</th>
                    <th className="px-3 py-2 text-left font-medium">Description</th>
                    <th className="px-3 py-2 text-left font-medium">Configuration</th>
                    <th className="px-3 py-2 text-left font-medium">Config Name</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-left font-medium">Unit</th>
                    <th className="px-3 py-2 text-left font-medium">Reference</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {order.salesOrderLines.map((line, index) => (
                    <tr
                      key={`${line.line}-${line.item}-${index}`}
                      className="border-t border-border/30"
                    >
                      <td className="px-3 py-2 font-mono whitespace-nowrap">{line.line}</td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">{line.item}</td>
                      <td className="px-3 py-2 max-w-[220px] truncate" title={line.description}>
                        {line.description || "—"}
                      </td>
                      <td className="px-3 py-2 font-mono max-w-[120px] truncate" title={line.configuration}>
                        {line.configuration || "—"}
                      </td>
                      <td className="px-3 py-2 max-w-[200px] truncate" title={line.configName}>
                        {line.configName || "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{line.qty ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{line.unit || "—"}</td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">{line.reference || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {line.status ? (
                          <Badge variant="outline" className="text-muted-foreground border-muted-foreground">
                            {line.status}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
