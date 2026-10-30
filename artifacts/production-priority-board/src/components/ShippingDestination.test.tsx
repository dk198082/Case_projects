import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ShippingDestination } from "./ShippingDestination";

const { shippingHook, refetch } = vi.hoisted(() => ({
  shippingHook: vi.fn(), refetch: vi.fn(),
}));
vi.mock("@workspace/api-client-react", () => ({
  useGetShippingDestination: shippingHook,
  getGetShippingDestinationQueryKey: (params: { workOrder: string; company: string }) => ["shipping-destination", params],
}));

beforeEach(() => {
  shippingHook.mockReturnValue({
    isPending: false, isError: false, data: { destination: "La Porte, TX, United States" }, refetch,
  });
});

it("shows the shipping address and scopes the query by work order and company", () => {
  const view = render(<ShippingDestination workOrder="367415" company="TOUS" />);
  expect(screen.getByText("Shipping Destination")).toBeTruthy();
  expect(screen.getByText("La Porte, TX, United States")).toBeTruthy();
  expect(shippingHook).toHaveBeenLastCalledWith(
    { workOrder: "367415", company: "TOUS" }, expect.objectContaining({ query: expect.objectContaining({ enabled: true }) }),
  );
  view.rerender(<ShippingDestination workOrder="OTHER" company="OTHERCO" />);
  expect(shippingHook.mock.lastCall?.[0]).toEqual({ workOrder: "OTHER", company: "OTHERCO" });
});

it("distinguishes loading, unavailable data and a failed lookup with retry", () => {
  shippingHook.mockReturnValue({ isPending: true, isError: false, refetch });
  const view = render(<ShippingDestination workOrder="367415" company="TOUS" />);
  expect(screen.getByRole("status").textContent).toContain("Loading");
  shippingHook.mockReturnValue({ isPending: false, isError: true, refetch });
  view.rerender(<ShippingDestination workOrder="367415" company="TOUS" />);
  expect(screen.getByRole("alert").textContent).toContain("Unable to load");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(refetch).toHaveBeenCalledTimes(1);
  shippingHook.mockReturnValue({ isPending: false, isError: false, data: { destination: "" }, refetch });
  view.rerender(<ShippingDestination workOrder="367415" company="TOUS" />);
  expect(screen.getByText("Not provided in ERP shipping address")).toBeTruthy();
});

it("does not request an address without company context", () => {
  render(<ShippingDestination workOrder="367415" company="" />);
  expect(shippingHook.mock.lastCall?.[1].query.enabled).toBe(false);
  expect(screen.getByText(/Company unavailable/)).toBeTruthy();
});
