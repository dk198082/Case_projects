import pg from "pg";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Authorized one-time maintenance only; no app startup/request integration.
const apply = process.argv.includes("--apply");
if (process.env.AZURE_PG_SCHEMA !== "d365fo") throw new Error("Expected d365fo.");
const root = fileURLToPath(new URL("../../../", import.meta.url));
const pool = new pg.Pool({
  host: process.env.AZURE_PG_HOST, port: Number(process.env.AZURE_PG_PORT ?? 5432),
  database: process.env.AZURE_PG_DATABASE,
  user: process.env.AZURE_PG_USER ?? process.env.AZURE_PG_SP_USER,
  password: process.env.AZURE_PG_PASSWORD,
  ssl: process.env.AZURE_PG_SSLMODE?.toLowerCase() === "disable" ? false : { rejectUnauthorized: false },
  max: 1, connectionTimeoutMillis: 15_000,
});
const client = await pool.connect();
const expectedSql = `SELECT DISTINCT p.dataareaid,p.productionordernumber
  FROM d365fo.prodproductionorderheaderstaging p
  JOIN d365fo.ecoresreleasedproductv2staging e
    ON e.dataareaid=p.dataareaid AND e.itemnumber=p.itemnumber
  JOIN d365fo.salesorderheaderv3staging h
    ON h.dataareaid=p.dataareaid AND h.salesordernumber=p.demandsalesordernumber
  JOIN d365fo.salesorderlinev2staging l
    ON l.dataareaid=p.dataareaid AND l.salesordernumber=p.demandsalesordernumber
    AND l.itemnumber=p.itemnumber AND l.inventorylotid=p.demandsalesorderlineinventorylotid
  WHERE p.dataareaid='TOUS' AND p.productionorderstatus IN (3,4)
    AND BTRIM(COALESCE(e.salesclassification2,''))='Machine'
    AND NULLIF(BTRIM(p.demandsalesordernumber),'') IS NOT NULL
    AND NULLIF(BTRIM(p.demandsalesorderlineinventorylotid),'') IS NOT NULL`;
try {
  await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL statement_timeout='120s'");
  console.log("Expected linked orders:", (await client.query(expectedSql)).rows.length);
  if (!apply) {
    await client.query("ROLLBACK");
  } else {
    const oldView = (await client.query(
      "SELECT pg_get_viewdef('d365fo.vw_salesprodmachines365_app'::regclass,true) AS definition",
    )).rows[0].definition;
    const oldProcedure = (await client.query(
      "SELECT pg_get_functiondef('d365fo.sp_refresh_production_priority_cache()'::regprocedure) AS definition",
    )).rows[0].definition;
    const dir = `${root}generated-artifacts/sales-linkage-backup-${Date.now()}`;
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/rollback.sql`,
      `BEGIN;\nCREATE OR REPLACE VIEW d365fo.vw_salesprodmachines365_app AS\n${oldView}\n` +
      `${oldProcedure};\nCALL d365fo.sp_refresh_production_priority_cache();\nCOMMIT;\n`);
    await client.query(await readFile(`${root}lib/db/sql/production-priority-machine-source.sql`, "utf8"));
    const guard = "WHERE la.salesheadermatched AND la.saleslinematched AND la.productiondemandmatched";
    let procedure = oldProcedure.replaceAll("\r\n", "\n");
    if (!procedure.includes(guard)) {
      const anchor = "            m.audit_row_id;\n";
      if (procedure.split(anchor).length !== 2) throw new Error("Unexpected procedure shape.");
      procedure = procedure.replace(anchor, `            m.audit_row_id\n    ${guard};\n`);
      await client.query(procedure);
    }
    await client.query("CALL d365fo.sp_refresh_production_priority_cache()");
    const missing = (await client.query(`${expectedSql} EXCEPT
      SELECT dataareaid,productionordernumber FROM d365fo.production_priority_app_cache`)).rows;
    const extra = (await client.query(`SELECT dataareaid,productionordernumber FROM
      d365fo.production_priority_app_cache EXCEPT ${expectedSql}`)).rows;
    const duplicates = (await client.query(`SELECT dataareaid,productionordernumber,count(*)
      FROM d365fo.production_priority_app_cache GROUP BY 1,2 HAVING count(*)>1`)).rows;
    const invalidLinks = (await client.query(`SELECT productionordernumber
      FROM d365fo.production_priority_app_cache
      WHERE NULLIF(BTRIM(salesordernumber),'') IS NULL
        OR NULLIF(BTRIM(inventorylotdemandid),'') IS NULL
        OR salesheadermatched IS NOT TRUE OR saleslinematched IS NOT TRUE
        OR productiondemandmatched IS NOT TRUE`)).rows;
    if (missing.length || extra.length || duplicates.length || invalidLinks.length) {
      throw new Error(JSON.stringify({ missing, extra, duplicates, invalidLinks }));
    }
    console.log("Verified", JSON.stringify({
      missing: 0, extra: 0, duplicates: 0, invalidLinks: 0,
      total: (await client.query("SELECT count(*) AS n FROM d365fo.production_priority_app_cache")).rows[0].n,
    }));
    console.log("Reported orders", JSON.stringify((await client.query(`SELECT productionordernumber,
      status,sc3 FROM d365fo.production_priority_app_cache
      WHERE productionordernumber IN ('367617','367645','367718')`)).rows));
    await client.query("COMMIT");
    console.log("Committed. Backup:", dir);
  }
} catch (error) {
  await client.query("ROLLBACK");
  console.error(JSON.stringify({ message: error.message, code: error.code, rolledBack: true }));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
