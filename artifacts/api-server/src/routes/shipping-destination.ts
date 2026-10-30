export type ShippingAddressRow = {
  city: string | null;
  state: string | null;
  countrycode: string | null;
  countryid: string | null;
};

export function shippingDestinationQuery(schema: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new Error("AZURE_PG_SCHEMA must be a valid PostgreSQL schema identifier.");
  }
  return `
    SELECT
      h.deliveryaddresscity AS city,
      h.deliveryaddressstateid AS state,
      h.deliveryaddresscountryregionisocode AS countrycode,
      h.deliveryaddresscountryregionid AS countryid
    FROM "${schema}".production_priority_app_cache c
    LEFT JOIN "${schema}".salesorderheaderv3staging h
      ON h.salesordernumber = c.salesordernumber
     AND h.dataareaid = c.dataareaid
    WHERE c.productionordernumber = $1
      AND c.dataareaid = $2
    ORDER BY h.tomodifieddatetime DESC NULLS LAST
    LIMIT 1
  `;
}

export function formatShippingDestination(row: ShippingAddressRow) {
  const city = row.city?.trim() ?? "";
  const state = row.state?.trim() ?? "";
  const iso = row.countrycode?.trim().toUpperCase() ?? "";
  const country = /^[A-Z]{2}$/.test(iso)
    ? new Intl.DisplayNames(["en"], { type: "region" }).of(iso) ?? iso
    : row.countryid?.trim() || iso;
  return { city, state, country, destination: [city, state, country].filter(Boolean).join(", ") };
}
