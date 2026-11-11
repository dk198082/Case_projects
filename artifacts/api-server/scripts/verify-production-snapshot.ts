import assert from "node:assert/strict";
import { pool } from "@workspace/db";
import { loadSnapshot } from "../src/routes/production-priority";

// Explicit read-only acceptance check against the actual API normalization path.
try {
  const snapshot = await loadSnapshot();
  const expected = (await pool.query<{ productionordernumber: string }>(`
    SELECT DISTINCT p.productionordernumber
    FROM d365fo.prodproductionorderheaderstaging p
    JOIN d365fo.ecoresreleasedproductv2staging e
      ON e.itemnumber=p.itemnumber AND e.dataareaid=p.dataareaid
    JOIN d365fo.salesorderheaderv3staging h
      ON h.salesordernumber=p.demandsalesordernumber AND h.dataareaid=p.dataareaid
    JOIN d365fo.salesorderlinev2staging l
      ON l.salesordernumber=p.demandsalesordernumber AND l.dataareaid=p.dataareaid
      AND l.itemnumber=p.itemnumber AND l.inventorylotid=p.demandsalesorderlineinventorylotid
    WHERE p.dataareaid='TOUS' AND p.productionorderstatus IN (3,4)
      AND BTRIM(COALESCE(e.salesclassification2,''))='Machine'
      AND NULLIF(BTRIM(p.demandsalesordernumber),'') IS NOT NULL
      AND NULLIF(BTRIM(p.demandsalesorderlineinventorylotid),'') IS NOT NULL
  `)).rows.map((row) => row.productionordernumber).sort();
  assert.deepEqual(snapshot.orders.map((row) => row.workOrder).sort(), expected);
  assert.equal(new Set(snapshot.orders.map((row) => row.workOrder)).size, expected.length);
  assert.ok(snapshot.orders.every((row) => row.SC2 === "Machine" && row.linkageAudit.company === "TOUS"));
  assert.ok(snapshot.orders.every((row) => row.linkageStatus === "Linked"));
  console.log(JSON.stringify({
    orders: snapshot.orders.length,
    missing: 0, unexpected: 0, duplicates: 0,
    unlinked: snapshot.orders.filter((row) => row.linkageStatus === "Unlinked").length,
    sc3Filters: [...new Set(snapshot.orders.map((row) => row.SC3))].sort(),
    reportedOrders: snapshot.orders.filter((row) => ["367617", "367645", "367718"].includes(row.workOrder))
      .map((row) => ({ workOrder: row.workOrder, status: row.status, SC3: row.SC3 })),
  }, null, 2));
} finally {
  await pool.end();
}
