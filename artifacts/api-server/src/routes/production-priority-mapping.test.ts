import assert from "node:assert/strict";
import test from "node:test";
import {
  getOrderConfiguration,
  getClassificationLabel,
  getSalesOrderCustomerName,
  getWorkOrderQuantity,
} from "./production-priority-mapping";

test("classification labels preserve arbitrary new groups and bucket blank values", () => {
  for (const label of ["IT503", "IT504", "New-SC3", "Future family"]) {
    assert.equal(getClassificationLabel(label), label);
  }
  assert.equal(getClassificationLabel(null), "Unclassified");
  assert.equal(getClassificationLabel("  "), "Unclassified");
});
test("uses only the cached configuration matching both work order and item", () => {
  const line = {
    reference: "365274", item: "09010630", configuration: "09010630-596256",
    configName: "Sump Pump, Hyd Grips, 2 FT Lgr Adj Columns, Std Screws, High Voltage (380-460)",
  };
  assert.deepEqual(getOrderConfiguration("365274", "09010630", [
    { ...line, reference: "365275", configuration: "WRONG" },
    { ...line, item: "OTHER", configuration: "WRONG" },
    line,
  ]), { configId: line.configuration, configDescription: line.configName });
});

test("keeps missing or conflicting configurations blank instead of borrowing another line", () => {
  assert.deepEqual(getOrderConfiguration("365274", "09010630", []),
    { configId: "", configDescription: "" });
  const line = { reference: "365274", item: "09010630", configuration: "A", configName: "Name" };
  assert.deepEqual(getOrderConfiguration("365274", "09010630", [line, { ...line, configuration: "B" }]),
    { configId: "", configDescription: "" });
  assert.deepEqual(getOrderConfiguration("365274", "09010630", [{ ...line, configName: "" }]),
    { configId: "A", configDescription: "" });
  assert.deepEqual(getOrderConfiguration("365274", "09010630", [{ ...line, configuration: "" }]),
    { configId: "", configDescription: "" });
});
test("uses the Sales Order header name instead of the delivery-address name", () => {
  const row = {
    salesheadercustomername: "Header Customer",
    salesordername: "View Customer",
    name: "Fallback Customer",
    deliveryaddressname: "Ship-To Location",
  };

  assert.equal(getSalesOrderCustomerName(row), "Header Customer");
});

test("falls back to the view's Sales Order name when header linkage is unavailable", () => {
  assert.deepEqual(
    getSalesOrderCustomerName({
      salesheadercustomername: "",
      salesordername: "View Customer",
      name: "Fallback Customer",
    }),
    "View Customer",
  );
});

test("returns remaining and scheduled Work Order quantities", () => {
  assert.deepEqual(
    getWorkOrderQuantity({
      scheduledquantity: "4.000000",
      estimatedquantity: "7.000000",
      remainingreportasfinishedquantity: "3.000000",
    }),
    { remaining: 3, scheduled: 4 },
  );
});

test("falls back to scheduled or estimated quantity when remaining is unavailable", () => {
  assert.deepEqual(
    getWorkOrderQuantity({
      scheduledquantity: null,
      estimatedquantity: "2.500000",
      remainingreportasfinishedquantity: null,
    }),
    { remaining: 2.5, scheduled: 2.5 },
  );
});