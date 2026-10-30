import assert from "node:assert/strict";
import test from "node:test";
import { formatShippingDestination, shippingDestinationQuery } from "./shipping-destination";

test("formats shipping city, state and country without using customer/address names", () => {
  assert.deepEqual(formatShippingDestination({
    city: " La Porte ", state: " TX ", countrycode: "us", countryid: "USA",
  }), {
    city: "La Porte", state: "TX", country: "United States",
    destination: "La Porte, TX, United States",
  });
});

test("omits missing address parts and preserves the ERP country ID when ISO is unavailable", () => {
  assert.equal(formatShippingDestination({
    city: "Paris", state: null, countrycode: null, countryid: "FRA",
  }).destination, "Paris, FRA");
  assert.equal(formatShippingDestination({
    city: null, state: null, countrycode: null, countryid: null,
  }).destination, "");
});

test("shipping lookup is scoped to a cached work order and company with bound parameters", () => {
  const query = shippingDestinationQuery("d365fo");
  assert.match(query, /c\.productionordernumber = \$1/);
  assert.match(query, /c\.dataareaid = \$2/);
  assert.match(query, /h\.dataareaid = c\.dataareaid/);
  assert.match(query, /h\.salesordernumber = c\.salesordernumber/);
  assert.match(query, /LIMIT 1/);
  assert.doesNotMatch(query, /\b(UPDATE|DELETE|INSERT|CALL|TRUNCATE)\b/i);
  assert.throws(() => shippingDestinationQuery('invalid";schema'), /valid PostgreSQL schema/);
});
