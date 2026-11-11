-- Production-first Machine population with a required exact Sales Order link.
-- SC1/SC3, item, sales pool, and sales statuses are not admission gates.
CREATE OR REPLACE VIEW d365fo.vw_salesprodmachines365_app AS
SELECT DISTINCT ON (ppo.dataareaid, ppo.productionordernumber)
    ppo.demandsalesordernumber::varchar(100) AS salesordernumber,
    so.deliveryaddressname,
    so.confirmedshippingdate,
    so.salesordername,
    so.salesorderstatus,
    so.orderingcustomeraccountnumber,
    so.requestedshippingdate,
    so.mcrorderstopped,
    so.ordercreationdatetime,
    so.leadtimeplatform,
    so.inpacking,
    so.engineeringnotes,
    ppo.dataareaid::varchar(4) AS dataareaid,
    so.salesorderpoolid,
    sol.packaginggroupid,
    COALESCE(NULLIF(sol.itemdesc, ''), ppo.productionordername)::varchar(1000) AS itemdesc,
    sol.itemgroupid,
    sol.akapackaginggroupid,
    ppo.itemnumber::varchar(20) AS itemnumber,
    sol.orderedsalesquantity,
    ppo.productconfigurationid::varchar(50) AS configuration,
    sol.orderqtyremaining,
    sol.salesqtyremaining,
    sol.confirmedshippingdate AS slconfirmshipdate,
    sol.orderlinecreateddate,
    ppo.deliverydate,
    ppo.scheduledstartdate,
    ppo.estimatedquantity,
    ppo.productionpoolid,
    ppo.productionorderstatus,
    ppo.starteddate,
    CASE ppo.productionorderstatus WHEN 3 THEN 'Released' ELSE 'Started' END AS status,
    ppo.productiongroupid,
    ppo.productionordername,
    ppo.productionordernumber,
    ppo.productconfigurationid,
    ppo.scheduledquantity,
    ppo.remainingreportasfinishedquantity,
    ppo.endeddate,
    eco.tosalesclass1 AS sc1,
    eco.salesclassification2 AS sc2,
    eco.salesclassification3 AS sc3,
    erp.translatedconfigurationname,
    hm.name,
    concat(ppo.productionpoolid, '/', ppo.productiongroupid, '/ ',
      CASE ppo.productionorderstatus WHEN 3 THEN 'Released' ELSE 'Started' END) AS "Resource1",
    concat(ppo.productionordernumber, '/', ppo.productionpoolid, '/',
      ppo.productiongroupid, '/ ',
      CASE ppo.productionorderstatus WHEN 3 THEN 'Released' ELSE 'Started' END,
      '/', ppo.remainingreportasfinishedquantity) AS "Resource",
    concat(ppo.productionordernumber, '/', ppo.itemnumber) AS "Task",
    concat(COALESCE(NULLIF(sol.itemdesc, ''), ppo.productionordername),
      ' / QTY ', ppo.remainingreportasfinishedquantity, ' / ', ppo.productionpoolid) AS "Assy_Resource",
    CASE WHEN NULLIF(ppo.demandsalesordernumber, '') IS NOT NULL
      THEN concat(ppo.demandsalesordernumber, ' / ShipDate:  ', so.confirmedshippingdate)
      ELSE '' END AS "MachineResource",
    ppo.demandsalesorderlineinventorylotid::text AS productioninventorylotdemandid
FROM d365fo.prodproductionorderheaderstaging ppo
JOIN d365fo.ecoresreleasedproductv2staging eco
  ON eco.itemnumber = ppo.itemnumber AND eco.dataareaid = ppo.dataareaid
 AND BTRIM(COALESCE(eco.salesclassification2, '')) = 'Machine'
LEFT JOIN d365fo.salesorderheaderv3staging so
  ON so.salesordernumber = ppo.demandsalesordernumber
 AND so.dataareaid = ppo.dataareaid
 AND NULLIF(BTRIM(ppo.demandsalesordernumber), '') IS NOT NULL
LEFT JOIN d365fo.salesorderlinev2staging sol
  ON sol.salesordernumber = ppo.demandsalesordernumber
 AND sol.dataareaid = ppo.dataareaid
 AND sol.itemnumber = ppo.itemnumber
 AND sol.inventorylotid = ppo.demandsalesorderlineinventorylotid
 AND NULLIF(BTRIM(ppo.demandsalesorderlineinventorylotid), '') IS NOT NULL
LEFT JOIN (
  SELECT DISTINCT ON (productmasternumber, productmasterconfigurationid)
    productmasternumber, productmasterconfigurationid, translatedconfigurationname
  FROM d365fo.ecoresproductmasterconfigurationtranslationstaging
  ORDER BY productmasternumber, productmasterconfigurationid,
    (languageid = 'en-us') DESC NULLS LAST, languageid,
    translatedconfigurationname
) erp
  ON erp.productmasternumber = ppo.itemnumber
 AND erp.productmasterconfigurationid = ppo.productconfigurationid
LEFT JOIN d365fo.hcmworkerstaging hm
  ON hm.personnelnumber = so.orderresponsiblepersonnelnumber
WHERE ppo.dataareaid = 'TOUS' AND ppo.productionorderstatus IN (3, 4)
  AND so.salesordernumber IS NOT NULL
  AND sol.salesordernumber IS NOT NULL
ORDER BY ppo.dataareaid, ppo.productionordernumber,
  ppo.tomodifieddatetime DESC NULLS LAST, sol.linenum NULLS LAST,
  so.salesordername, hm.name;
