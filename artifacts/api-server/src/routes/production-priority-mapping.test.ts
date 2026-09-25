import assert from "node:assert/strict";
import test from "node:test";
import {
  getSalesOrderCustomerName,
  getWorkOrderQuantity,
} from "./production-priority-mapping";

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