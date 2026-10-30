import { getGetShippingDestinationQueryKey, useGetShippingDestination } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

export function ShippingDestination({ workOrder, company }: { workOrder: string; company: string }) {
  const address = useGetShippingDestination(
    { workOrder, company },
    { query: {
      queryKey: getGetShippingDestinationQueryKey({ workOrder, company }),
      enabled: Boolean(workOrder && company), staleTime: 60_000, retry: 1,
    } },
  );

  return <div className="space-y-1">
    <p className="text-xs text-muted-foreground uppercase tracking-wider">Shipping Destination</p>
    {!company ? <p className="text-sm text-muted-foreground">Company unavailable; shipping address cannot be looked up.</p>
      : address.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading shipping destination…</p>
      : address.isError ? <div className="flex flex-wrap items-center gap-2">
        <p role="alert" className="text-sm text-destructive">Unable to load shipping destination.</p>
        <Button variant="outline" size="sm" onClick={() => void address.refetch()}>Retry</Button>
      </div>
      : <p className="font-mono break-words">{address.data?.destination || "Not provided in ERP shipping address"}</p>}
  </div>;
}
