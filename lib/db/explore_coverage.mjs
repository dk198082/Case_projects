import pg from "pg";
const { Pool } = pg;
const azureConfig = {
  host: process.env.AZURE_PG_HOST,
  port: Number(process.env.AZURE_PG_PORT ?? 5432),
  database: process.env.AZURE_PG_DATABASE,
  user: process.env.AZURE_PG_USER ?? process.env.AZURE_PG_SP_USER,
  password: process.env.AZURE_PG_PASSWORD,
};
const sslMode = process.env.AZURE_PG_SSLMODE?.toLowerCase();
const pool = new Pool({
  ...azureConfig,
  ssl: sslMode === "disable" ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
const schema = process.env.AZURE_PG_SCHEMA;
const q = (sql, p) => pool.query(sql, p);

const cov = await q(`
  SELECT
    COUNT(DISTINCT m.productionordernumber) AS total_active,
    COUNT(DISTINCT rv.productionordernumber) AS with_route_rows
  FROM "${schema}".vw_salesprodmachines365 m
  LEFT JOIN "${schema}".vw_salesprodmfimachines365routev2 rv
    ON BTRIM(rv.productionordernumber) = BTRIM(m.productionordernumber)
  WHERE m.productionordernumber IS NOT NULL AND BTRIM(m.productionordernumber) <> ''
    AND (UPPER(m.status) LIKE '%START%' OR UPPER(m.status) LIKE '%RELEASE%')
`);
console.log("=== coverage of active orders in route view ===");
console.log(JSON.stringify(cov.rows));

// check 366208 specifically - does it exist anywhere with different formatting?
const r366208 = await q(`SELECT productionordernumber, status, productionorderstatus FROM "${schema}".vw_salesprodmachines365 WHERE productionordernumber = '366208'`);
console.log("\n366208 in base view:", JSON.stringify(r366208.rows));

const r366208route = await q(`SELECT productionordernumber FROM "${schema}".vw_salesprodmfimachines365routev2 WHERE productionordernumber LIKE '%366208%'`);
console.log("366208 in route view (LIKE):", JSON.stringify(r366208route.rows));

// sample a few active orders without route rows to see if it's rare or common
const missing = await q(`
  SELECT DISTINCT m.productionordernumber, m.status
  FROM "${schema}".vw_salesprodmachines365 m
  LEFT JOIN "${schema}".vw_salesprodmfimachines365routev2 rv
    ON BTRIM(rv.productionordernumber) = BTRIM(m.productionordernumber)
  WHERE m.productionordernumber IS NOT NULL AND BTRIM(m.productionordernumber) <> ''
    AND (UPPER(m.status) LIKE '%START%' OR UPPER(m.status) LIKE '%RELEASE%')
    AND rv.productionordernumber IS NULL
  LIMIT 10
`);
console.log("\n=== sample active orders missing route rows ===");
console.log(JSON.stringify(missing.rows));

await pool.end();
