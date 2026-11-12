import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProductionGantt } from "./ProductionGantt";
import type { ProductionOrder } from "@/lib/mock-data";

const order = (id: string, dates: Partial<ProductionOrder> = {}) => ({
  id, workOrder: `WO-${id}`, salesOrder: `SO-${id}`, itemNumber: "PART", customer: "Test customer",
  status: "STARTED", workOrderQty: 3, scheduledWorkOrderQty: 5,
  productionGroup: "Assembly", buildStartDate: "2026-09-01",
  buildEndDate: "2026-09-05", salesShipDate: "2026-09-10", ...dates,
}) as ProductionOrder;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ProductionGantt", () => {
  it("removes the Today button, prefixes the customer with its sales order, and puts end-only text left of the marker", () => {
    render(<ProductionGantt
      orders={[order("end", { buildStartDate: "" }), order("start", { buildEndDate: "", salesOrder: "" })]}
      priorityById={new Map()}
      onSelectOrder={vi.fn()}
    />);
    expect(screen.queryByRole("button", { name: /today/i })).toBeNull();
    const row = screen.getByTestId("gantt-row-end");
    expect(row.getAttribute("aria-label")).toContain("sales order SO-end, Test customer");
    const customerLine = screen.getByText("SO-end ·").parentElement!;
    expect(customerLine.textContent).toBe("SO-end ·Test customer");
    const endLabel = screen.getByText("End only, no build start");
    expect(endLabel.style.right).toContain("calc(");
    expect(endLabel.style.left).toBe("");
    expect(screen.getByText("Start only, no build end").style.left).not.toBe("");
    expect(screen.getByTestId("gantt-row-start").getAttribute("aria-label")).toContain("sales order none, Test customer");
  });

  it("retains supplied order and priority and opens details by mouse or keyboard", () => {
    const orders = [order("second"), order("first", { buildStartDate: "", buildEndDate: "" })];
    const select = vi.fn();
    render(<ProductionGantt orders={orders} priorityById={new Map([["second", 8]])} onSelectOrder={select} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0].getAttribute("aria-label")).toContain("Priority 8, work order WO-second");
    expect(rows[1].getAttribute("aria-label")).toContain("No build dates");
    fireEvent.click(rows[0]);
    fireEvent.keyDown(rows[1], { key: "Enter" });
    expect(select.mock.calls.map(([value]) => value.id)).toEqual(["second", "first"]);
    fireEvent.click(screen.getByTestId("gantt-zoom-week"));
    expect(screen.getByTestId("gantt-zoom-week").getAttribute("aria-pressed")).toBe("true");
  });

  it("makes every row accessible through pagination and resets when the filtered set changes", () => {
    const orders = Array.from({ length: 61 }, (_, i) => order(String(i)));
    const props = { priorityById: new Map<string, number>(), onSelectOrder: vi.fn() };
    const { rerender } = render(<ProductionGantt orders={orders} {...props} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(60);
    fireEvent.click(screen.getByTestId("gantt-next-page"));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByTestId("gantt-row-60")).toBeTruthy();
    rerender(<ProductionGantt orders={[]} {...props} />);
    expect(screen.getByText("No active work orders match the current view.")).toBeTruthy();
    rerender(<ProductionGantt orders={orders} {...props} />);
    expect(screen.getByTestId("gantt-row-0")).toBeTruthy();
  });
});