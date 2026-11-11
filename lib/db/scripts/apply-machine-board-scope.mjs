import pg from "pg";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Explicit authorized maintenance only. Never run during startup or requests.
// Default inspects only; --apply atomically changes the view/procedure and cache.
const apply = process.argv.includes("--apply");
if (process.env.AZURE_PG_SCHEMA !== "d365fo") throw new Error("Expected d365fo.");
const root = fileURLToPath(new URL("../../../", import.meta.url));
const pool = new pg.Pool({
  host: process.env.AZURE_PG_HOST, port: Number(process.env.AZURE_PG_PORT ?? 5432),
  database: process.env.AZURE_PG_DATABASE,
  user: process.env.AZURE_PG_USER ?? process.env.AZURE_PG_SP_USER,
  password: process.env.AZURE_PG_PASSWORD,
  ssl: process.env.AZURE_PG_SSLMODE?.toLowerCase() === "disable" ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000, max: 1,
});
const client = await pool.connect();
const expectedSql = `
  SELECT DISTINCT p.dataareaid, p.productionordernumber
  FROM d365fo.prodproductionorderheaderstaging p
  JOIN d365fo.ecoresreleasedproductv2staging e
    ON e.dataareaid=p.dataareaid AND e.itemnumber=p.itemnumber
  JOIN d365fo.salesorderheaderv3staging h
    ON h.dataareaid=p.dataareaid AND h.salesordernumber=p.demandsalesordernumber
  JOIN d365fo.salesorderlinev2staging l
    ON l.dataareaid=p.dataareaid AND l.salesordernumber=p.demandsalesordernumber
    AND l.itemnumber=p.itemnumber AND l.inventorylotid=p.demandsalesorderlineinventorylotid
  WHERE p.dataareaid='TOUS' AND p.productionorderstatus IN (3,4)
    AND NULLIF(BTRIM(p.demandsalesordernumber),'') IS NOT NULL
    AND NULLIF(BTRIM(p.demandsalesorderlineinventorylotid),'') IS NOT NULL
    AND BTRIM(COALESCE(e.salesclassification2,''))='Machine'`;
try {
  await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL statement_timeout='120s'");
  const originalView = (await client.query(
    "SELECT pg_get_viewdef('d365fo.vw_salesprodmachines365_app'::regclass,true) AS definition",
  )).rows[0].definition;
  const originalProcedure = (await client.query(
    "SELECT pg_get_functiondef('d365fo.sp_refresh_production_priority_cache()'::regprocedure) AS definition",
  )).rows[0].definition;
  const expected = (await client.query(expectedSql)).rows;
  console.log(JSON.stringify({ apply, expectedEligibleOrders: expected.length }));
  if (!apply) {
    await client.query("ROLLBACK");
  } else {
    if (originalProcedure.includes("productioninventorylotdemandid")) {
      throw new Error("Scope migration already applied; use the existing refresh orchestration.");
    }
    const backupDir = `${root}generated-artifacts/machine-scope-backup-${Date.now()}`;
    await mkdir(backupDir, { recursive: true });
    // Preserve original business definitions. Additive cache columns may remain
    // during rollback; restoring the old population does not require dropping them.
    await writeFile(`${backupDir}/rollback.sql`,
      `BEGIN;\nCREATE OR REPLACE VIEW d365fo.vw_salesprodmachines365_app AS\n` +
      `SELECT old_view.*, NULL::text AS productioninventorylotdemandid FROM (\n` +
      originalView.replace(/;\s*$/, "") + `\n) old_view;\n` +
      originalProcedure + `;\nCALL d365fo.sp_refresh_production_priority_cache();\nCOMMIT;\n`);
    await client.query(await readFile(`${root}lib/db/sql/production-priority-machine-source.sql`, "utf8"));
    await client.query(`ALTER TABLE d365fo.production_priority_app_cache
      ADD COLUMN IF NOT EXISTS configuration varchar(50),
      ADD COLUMN IF NOT EXISTS translatedconfigurationname varchar(80)`);
    let procedure = originalProcedure.replaceAll("\r\n", "\n");
    const replaceOnce = (before, after) => {
      if (procedure.split(before).length !== 2) throw new Error("Unexpected procedure shape: " + before);
      procedure = procedure.replace(before, after);
    };
    const scopeStart = procedure.indexOf("        WHERE\n", procedure.indexOf("WITH machine AS MATERIALIZED"));
    const scopeEnd = procedure.indexOf("\n    ),", scopeStart);
    if (scopeStart < 0 || scopeEnd < 0) throw new Error("Cannot locate machine scope.");
    procedure = procedure.slice(0, scopeStart) +
      `        WHERE m.dataareaid = 'TOUS'\n` +
      `          AND BTRIM(COALESCE(m.sc2, '')) = 'Machine'\n` +
      `          AND m.productionorderstatus IN (3, 4)` + procedure.slice(scopeEnd);
    replaceOnce("        cache_refreshed_at\n", "        configuration,\n        translatedconfigurationname,\n        cache_refreshed_at\n");
    replaceOnce("        CURRENT_TIMESTAMP\n", "        m.configuration,\n        m.translatedconfigurationname,\n        CURRENT_TIMESTAMP\n");
    replaceOnce("         AND l.itemnumber = m.itemnumber\n",
      "         AND l.itemnumber = m.itemnumber\n" +
      "         AND l.inventorylotid = m.productioninventorylotdemandid\n" +
      "         AND NULLIF(BTRIM(m.productioninventorylotdemandid), '') IS NOT NULL\n");
    replaceOnce("        la.inventorylotdemandid,\n",
      "        COALESCE(m.productioninventorylotdemandid, ''),\n");
    replaceOnce("            m.audit_row_id;\n",
      "            m.audit_row_id\n" +
      "    WHERE la.salesheadermatched AND la.saleslinematched AND la.productiondemandmatched;\n");
    await client.query(procedure);
    await client.query("CALL d365fo.sp_refresh_production_priority_cache()");
    const missing = (await client.query(`${expectedSql}
      EXCEPT SELECT dataareaid, productionordernumber FROM d365fo.production_priority_app_cache`)).rows;
    const unexpected = (await client.query(`SELECT dataareaid, productionordernumber
      FROM d365fo.production_priority_app_cache EXCEPT ${expectedSql}`)).rows;
    const duplicates = (await client.query(`SELECT dataareaid,productionordernumber,count(*)
      FROM d365fo.production_priority_app_cache GROUP BY 1,2 HAVING count(*)<>1`)).rows;
    if (missing.length || unexpected.length || duplicates.length) {
      throw new Error(JSON.stringify({ missing, unexpected, duplicates }));
    }
    const totals = (await client.query(`SELECT count(*) AS orders,
      count(*) FILTER (WHERE NULLIF(BTRIM(salesordernumber),'') IS NULL) AS unlinked_orders,
      count(*) FILTER (WHERE NULLIF(BTRIM(sc3),'') IS NULL) AS unclassified_orders
      FROM d365fo.production_priority_app_cache`)).rows;
    console.log("Reconciliation", JSON.stringify({ missing, unexpected, duplicates, totals }));
    console.log("ReportedOrders", JSON.stringify((await client.query(`SELECT productionordernumber,
      status,sc2,sc3 FROM d365fo.production_priority_app_cache
      WHERE productionordernumber IN ('367617','367645','367718')`)).rows));
    await client.query("COMMIT");
    console.log("Committed. Original definitions:", backupDir);
  }
} catch (error) {
  await client.query("ROLLBACK");
  console.error(JSON.stringify({ code: error.code, message: error.message, rolledBack: true }));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
