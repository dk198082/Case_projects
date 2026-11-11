import assert from "node:assert/strict";
import {
  getProductionPriorityLinkageStatus,
  isRequiredProductionPriorityRow,
  isEligibleSalesLinkedMachineOrder,
  isValidatedProductionPriorityLinkage,
  type ProductionPriorityFilterRow,
  type ProductionPriorityLinkageRow,
} from "./production-priority-filters";

const approvedRow: ProductionPriorityFilterRow = {
  dataareaid: "TOUS",
  itemnumber: "09010600",
  salesorderpoolid: "Production",
  sc1: "SL-Series",
  sc2: "Machine",
  sc3: "2000SL",
  status: "Started",
};

const cases: Array<{
  name: string;
  row: ProductionPriorityFilterRow;
  expected: boolean;
}> = [
  { name: "allows an approved source row", row: approvedRow, expected: true },
  {
    name: "includes formerly excluded item 02002107",
    row: { ...approvedRow, itemnumber: "02002107" },
    expected: true,
  },
  {
    name: "includes a new SC1",
    row: { ...approvedRow, sc1: "Other" },
    expected: true,
  },
  {
    name: "excludes an unapproved SC2",
    row: { ...approvedRow, sc2: "Assembly" },
    expected: false,
  },
  {
    name: "includes a new SC3 without changing an allowlist",
    row: { ...approvedRow, sc3: "Other" },
    expected: true,
  },
  {
    name: "allows MP1500 SC3",
    row: { ...approvedRow, sc3: "MP1500" },
    expected: true,
  },
  {
    name: "allows MP1200MAN SC3",
    row: { ...approvedRow, sc3: "MP1200MAN" },
    expected: true,
  },
  {
    name: "allows MP1200ETO SC3",
    row: { ...approvedRow, sc3: "MP1200ETO" },
    expected: true,
  },
  {
    name: "excludes Completed status",
    row: { ...approvedRow, status: "Completed" },
    expected: false,
  },
  {
    name: "excludes ReportedFinished status",
    row: { ...approvedRow, status: "ReportedFinished" },
    expected: false,
  },
  {
    name: "excludes spaced Reported Finished status",
    row: { ...approvedRow, status: "Reported Finished" },
    expected: false,
  },
  {
    name: "includes Machine orders in consignment sales-order pools",
    row: { ...approvedRow, salesorderpoolid: "West Consign Orders" },
    expected: true,
  },
  ...["IT503", "IT504", "3000SL", null, ""].map((sc3) => ({
    name: `includes active Machine orders with SC3 ${sc3}`,
    row: { ...approvedRow, sc3 }, expected: true,
  })),
  { name: "includes missing SC1 and sales pool", row: { ...approvedRow, sc1: null, salesorderpoolid: null }, expected: true },
  { name: "allows Released", row: { ...approvedRow, status: "Released" }, expected: true },
  { name: "excludes Scheduled", row: { ...approvedRow, status: "Scheduled" }, expected: false },
  { name: "excludes another company", row: { ...approvedRow, dataareaid: "TOUK" }, expected: false },
  ...["Electmech", "Hydraulic", null].map((sc2) => ({
    name: `excludes non-Machine SC2 ${sc2}`, row: { ...approvedRow, sc2 }, expected: false,
  })),
];

for (const { name, row, expected } of cases) {
  assert.equal(isRequiredProductionPriorityRow(row), expected, name);
}

console.log(`Verified ${cases.length} required production-filter cases.`);

const matchedLinkage: ProductionPriorityLinkageRow = {
  salesordernumber: "SO-12345",
  dataareaid: "TOUS",
  itemnumber: "09010600",
  inventorylotdemandid: "LOT-12345",
  salesheadermatched: true,
  saleslinematched: true,
  productiondemandmatched: true,
};

const linkageCases: Array<{
  name: string;
  row: ProductionPriorityLinkageRow;
  expectedStatus: "Linked" | "Partial" | "Unlinked";
  isValidated: boolean;
}> = [
  {
    name: "validates a header, line, and inventory-lot demand match",
    row: matchedLinkage,
    expectedStatus: "Linked",
    isValidated: true,
  },
  {
    name: "marks a populated sales order partial when its sales header is unmatched",
    row: { ...matchedLinkage, salesheadermatched: false },
    expectedStatus: "Partial",
    isValidated: false,
  },
  {
    name: "marks a populated sales order partial when its production demand lot is unmatched",
    row: { ...matchedLinkage, productiondemandmatched: false },
    expectedStatus: "Partial",
    isValidated: false,
  },
  {
    name: "marks a populated sales order partial when its item line is unmatched",
    row: { ...matchedLinkage, saleslinematched: false },
    expectedStatus: "Partial",
    isValidated: false,
  },
  {
    name: "marks a linkage partial when the company identifier is blank",
    row: { ...matchedLinkage, dataareaid: " " },
    expectedStatus: "Partial",
    isValidated: false,
  },
  {
    name: "marks a linkage partial when the item identifier is blank",
    row: { ...matchedLinkage, itemnumber: "" },
    expectedStatus: "Partial",
    isValidated: false,
  },
  {
    name: "marks a linkage partial when the inventory-lot demand identifier is blank",
    row: { ...matchedLinkage, inventorylotdemandid: "" },
    expectedStatus: "Partial",
    isValidated: false,
  },
  {
    name: "marks a missing sales-order number unlinked",
    row: { ...matchedLinkage, salesordernumber: "" },
    expectedStatus: "Unlinked",
    isValidated: false,
  },
];

for (const { name, row, expectedStatus, isValidated } of linkageCases) {
  assert.equal(getProductionPriorityLinkageStatus(row), expectedStatus, name);
  assert.equal(isValidatedProductionPriorityLinkage(row), isValidated, name);
}

console.log(`Verified ${linkageCases.length} sales-order linkage cases.`);

for (const { name, row, isValidated } of linkageCases) {
  assert.equal(
    isEligibleSalesLinkedMachineOrder({ ...approvedRow, ...row }),
    isValidated,
    `Board admission: ${name}`,
  );
}
for (const sc3 of ["IT503", "IT504", "Future-SC3", null]) {
  assert.equal(isEligibleSalesLinkedMachineOrder({
    ...approvedRow, ...matchedLinkage, sc3,
  }), true);
}
assert.equal(isEligibleSalesLinkedMachineOrder({
  ...approvedRow, ...matchedLinkage, status: "Scheduled",
}), false);
assert.equal(isEligibleSalesLinkedMachineOrder({
  ...approvedRow, ...matchedLinkage, sc2: "Hydraulic",
}), false);