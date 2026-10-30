import pg from "pg";

// Explicit, one-time maintenance only. Never invoke from app startup or requests.
const apply = process.argv.includes("--apply");
const refreshCache = process.argv.includes("--refresh-cache");
if (refreshCache && !apply) throw new Error("--refresh-cache requires --apply");
const schema = process.env.AZURE_PG_SCHEMA;
if (schema !== "d365fo") throw new Error("Expected the authoritative d365fo schema.");
const pool = new pg.Pool({
  host: process.env.AZURE_PG_HOST,
  port: Number(process.env.AZURE_PG_PORT ?? 5432),
  database: process.env.AZURE_PG_DATABASE,
  user: process.env.AZURE_PG_USER ?? process.env.AZURE_PG_SP_USER,
  password: process.env.AZURE_PG_PASSWORD,
  ssl: process.env.AZURE_PG_SSLMODE?.toLowerCase() === "disable"
    ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
  max: 1,
});
const client = await pool.connect();
try {
  await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '120s'");
  const { rows: [{ definition }] } = await client.query(
    "SELECT pg_get_viewdef('d365fo.vw_salesprodmachines365_app'::regclass, true) AS definition",
  );
  const requiredJoin = "     JOIN d365fo.hcmworkerstaging hm ON";
  const optionalJoin = "     LEFT JOIN d365fo.hcmworkerstaging hm ON";
  const occurrences = definition.split(requiredJoin).length - 1;
  if (occurrences !== 1 && !definition.includes(optionalJoin)) {
    throw new Error("Unexpected worker join; refusing to modify the source view.");
  }
  const corrected = occurrences === 1
    ? definition.replace(requiredJoin, optionalJoin) : definition;
  console.log(JSON.stringify({ apply, refreshCache, alreadyCorrected: occurrences === 0 }));
  if (apply) {
    // CREATE OR REPLACE preserves the view's columns, ownership, and permissions.
    await client.query(
      `CREATE OR REPLACE VIEW d365fo.vw_salesprodmachines365_app AS ${corrected}`,
    );
    const { rows: restored } = await client.query(`
      SELECT productionordernumber, dataareaid, status, sc1, sc2, sc3
      FROM d365fo.vw_salesprodmachines365_app
      WHERE productionordernumber = '367420' AND dataareaid = 'TOUS'
    `);
    if (!restored.some((row) => row.status === "Started")) {
      throw new Error("367420 was not restored to the source view; rolling back.");
    }
    console.log("sourceVerification", JSON.stringify(restored));
    if (refreshCache) {
      await client.query(`
        CREATE TEMP TABLE previous_priority_orders ON COMMIT DROP AS
        SELECT DISTINCT productionordernumber, dataareaid
        FROM d365fo.production_priority_app_cache
        WHERE productionordernumber IS NOT NULL
      `);
      await client.query("CALL d365fo.sp_refresh_production_priority_cache()");
      const { rows: missing } = await client.query(`
        SELECT productionordernumber, dataareaid FROM previous_priority_orders
        EXCEPT
        SELECT productionordernumber, dataareaid FROM d365fo.production_priority_app_cache
      `);
      if (missing.length) throw new Error("Refresh lost previously cached orders; rolling back.");
      const { rows: verification } = await client.query(`
        SELECT productionordernumber, dataareaid, status, cache_refreshed_at
        FROM d365fo.production_priority_app_cache
        WHERE productionordernumber = '367420' AND dataareaid = 'TOUS'
      `);
      if (!verification.some((row) => row.status === "Started")) {
        throw new Error("367420 was not restored to the cache; rolling back.");
      }
      console.log("cacheVerification", JSON.stringify(verification));
      console.log("cacheTotals", JSON.stringify((await client.query(`
        SELECT count(*) AS rows, count(*) FILTER (WHERE status IN ('Started', 'Released')) AS active_rows
        FROM d365fo.production_priority_app_cache
      `)).rows));
    }
    await client.query("COMMIT");
    console.log("Committed.");
  } else {
    await client.query("ROLLBACK");
    console.log("Inspection only. Pass --apply --refresh-cache for authorized one-time maintenance.");
  }
} catch (error) {
  await client.query("ROLLBACK");
  console.error(JSON.stringify({ code: error.code, message: error.message, rolledBack: true }));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
