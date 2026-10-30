import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MOCK_ORDERS } from "@/lib/mock-data";
import { OrderDetailsDialog } from "./OrderDetailsDialog";

vi.mock("./ShippingDestination", () => ({
  ShippingDestination: () => <p>Example shipping destination</p>,
}));

it("shows Engineering / Cust Ref only in the left column directly below Build End Date", () => {
  render(<OrderDetailsDialog
    order={{ ...MOCK_ORDERS[0], customerReference: "Example engineering reference" }}
    onClose={() => {}}
  />);
  const buildEndField = screen.getByText("Build End Date").parentElement!;
  const referenceField = screen.getByText("Engineering / Cust Ref").parentElement!;
  const leftColumn = buildEndField.parentElement!;
  expect(referenceField.parentElement).toBe(leftColumn);
  expect(referenceField.previousElementSibling).toBe(buildEndField);
  expect(screen.getAllByText("Engineering / Cust Ref")).toHaveLength(1);
  expect(leftColumn.textContent).toContain("Example engineering reference");
  const rightColumn = screen.getByText("Customer").parentElement!.parentElement!;
  expect(rightColumn.contains(referenceField)).toBe(false);
});

it("does not render an empty engineering-reference section", () => {
  render(<OrderDetailsDialog order={{ ...MOCK_ORDERS[0], customerReference: "" }} onClose={() => {}} />);
  expect(screen.queryByText("Engineering / Cust Ref")).toBeNull();
});

it("shows Config ID and Config Description directly beneath the part details", () => {
  render(<OrderDetailsDialog order={{
    ...MOCK_ORDERS[0],
    itemNumber: "09010630",
    description: "Model 2000SL",
    configId: "09010630-596256",
    configDescription: "Sump Pump, Hyd Grips, 2 FT Lgr Adj Columns",
  }} onClose={() => {}} />);
  const part = screen.getByText("09010630 - Model 2000SL");
  const configuration = screen.getByText(/Config:/);
  expect(configuration.previousElementSibling).toBe(part);
  expect(part.classList.contains("text-foreground")).toBe(true);
  expect(configuration.classList.contains("text-muted-foreground")).toBe(true);
  expect(configuration.textContent?.replace(/\s+/g, " ").trim()).toBe(
    "Config: 09010630-596256 - Sump Pump, Hyd Grips, 2 FT Lgr Adj Columns",
  );
});

it("keeps configuration labels visible when the values are missing", () => {
  render(<OrderDetailsDialog order={{
    ...MOCK_ORDERS[0], configId: "", configDescription: "",
  }} onClose={() => {}} />);
  expect(screen.getByText(/Config:/).textContent?.replace(/\s+/g, " ").trim()).toBe("Config: — - —");
});
