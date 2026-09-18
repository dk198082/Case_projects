import assert from "node:assert/strict";
import test from "node:test";
import { getSalesOrderCustomerName } from "./production-priority-mapping";

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
  assert.equal(
    getSalesOrderCustomerName({
      salesheadercustomername: "",
      salesordername: "View Customer",
      name: "Fallback Customer",
    }),
    "View Customer",
  );
});