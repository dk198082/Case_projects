BEGIN;
CREATE OR REPLACE VIEW d365fo.vw_salesprodmachines365_app AS
 SELECT DISTINCT ON (ppo.dataareaid, ppo.productionordernumber) ppo.demandsalesordernumber::character varying(100) AS salesordernumber,
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
    ppo.dataareaid,
    so.salesorderpoolid,
    sol.packaginggroupid,
    COALESCE(NULLIF(sol.itemdesc::text, ''::text), ppo.productionordername::text)::character varying(1000) AS itemdesc,
    sol.itemgroupid,
    sol.akapackaginggroupid,
    ppo.itemnumber,
    sol.orderedsalesquantity,
    ppo.productconfigurationid AS configuration,
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
        CASE ppo.productionorderstatus
            WHEN 3 THEN 'Released'::text
            ELSE 'Started'::text
        END AS status,
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
        CASE ppo.productionorderstatus
            WHEN 3 THEN 'Released'::text
            ELSE 'Started'::text
        END) AS "Resource1",
    concat(ppo.productionordernumber, '/', ppo.productionpoolid, '/', ppo.productiongroupid, '/ ',
        CASE ppo.productionorderstatus
            WHEN 3 THEN 'Released'::text
            ELSE 'Started'::text
        END, '/', ppo.remainingreportasfinishedquantity) AS "Resource",
    concat(ppo.productionordernumber, '/', ppo.itemnumber) AS "Task",
    concat(COALESCE(NULLIF(sol.itemdesc::text, ''::text), ppo.productionordername::text), ' / QTY ', ppo.remainingreportasfinishedquantity, ' / ', ppo.productionpoolid) AS "Assy_Resource",
        CASE
            WHEN NULLIF(ppo.demandsalesordernumber::text, ''::text) IS NOT NULL THEN concat(ppo.demandsalesordernumber, ' / ShipDate:  ', so.confirmedshippingdate)
            ELSE ''::text
        END AS "MachineResource",
    ppo.demandsalesorderlineinventorylotid::text AS productioninventorylotdemandid
   FROM d365fo.prodproductionorderheaderstaging ppo
     JOIN d365fo.ecoresreleasedproductv2staging eco ON eco.itemnumber::text = ppo.itemnumber::text AND eco.dataareaid::text = ppo.dataareaid::text AND btrim(COALESCE(eco.salesclassification2, ''::character varying)::text) = 'Machine'::text
     LEFT JOIN d365fo.salesorderheaderv3staging so ON so.salesordernumber::text = ppo.demandsalesordernumber::text AND so.dataareaid::text = ppo.dataareaid::text AND NULLIF(btrim(ppo.demandsalesordernumber::text), ''::text) IS NOT NULL
     LEFT JOIN d365fo.salesorderlinev2staging sol ON sol.salesordernumber::text = ppo.demandsalesordernumber::text AND sol.dataareaid::text = ppo.dataareaid::text AND sol.itemnumber::text = ppo.itemnumber::text AND sol.inventorylotid::text = ppo.demandsalesorderlineinventorylotid::text AND NULLIF(btrim(ppo.demandsalesorderlineinventorylotid::text), ''::text) IS NOT NULL
     LEFT JOIN ( SELECT DISTINCT ON (ecoresproductmasterconfigurationtranslationstaging.productmasternumber, ecoresproductmasterconfigurationtranslationstaging.productmasterconfigurationid) ecoresproductmasterconfigurationtranslationstaging.productmasternumber,
            ecoresproductmasterconfigurationtranslationstaging.productmasterconfigurationid,
            ecoresproductmasterconfigurationtranslationstaging.translatedconfigurationname
           FROM d365fo.ecoresproductmasterconfigurationtranslationstaging
          ORDER BY ecoresproductmasterconfigurationtranslationstaging.productmasternumber, ecoresproductmasterconfigurationtranslationstaging.productmasterconfigurationid, (ecoresproductmasterconfigurationtranslationstaging.languageid::text = 'en-us'::text) DESC NULLS LAST, ecoresproductmasterconfigurationtranslationstaging.languageid, ecoresproductmasterconfigurationtranslationstaging.translatedconfigurationname) erp ON erp.productmasternumber::text = ppo.itemnumber::text AND erp.productmasterconfigurationid::text = ppo.productconfigurationid::text
     LEFT JOIN d365fo.hcmworkerstaging hm ON hm.personnelnumber::text = so.orderresponsiblepersonnelnumber::text
  WHERE ppo.dataareaid::text = 'TOUS'::text AND (ppo.productionorderstatus = ANY (ARRAY[3, 4]))
  ORDER BY ppo.dataareaid, ppo.productionordernumber, ppo.tomodifieddatetime DESC NULLS LAST, sol.linenum, so.salesordername, hm.name;
CREATE OR REPLACE PROCEDURE d365fo.sp_refresh_production_priority_cache()
 LANGUAGE plpgsql
AS $procedure$
BEGIN

    /*
    ============================================================
    PRODUCTION PRIORITY APP CACHE REFRESH

    Source:
      d365fo.vw_salesprodmachines365_app
      d365fo.vw_production_build_dates_app

    Purpose:
      Pre-calculate the expensive Production Priority dataset
      so the application does not rebuild it after login.
    ============================================================
    */

    TRUNCATE TABLE d365fo.production_priority_app_cache;


    INSERT INTO d365fo.production_priority_app_cache
    (
        salesordernumber,
        dataareaid,
        deliveryaddressname,
        confirmedshippingdate,
        salesordername,
        salesorderpoolid,
        requestedshippingdate,
        ordercreationdatetime,
        engineeringnotes,

        itemdesc,
        itemnumber,
        orderedsalesquantity,
        estimatedquantity,
        scheduledquantity,
        remainingreportasfinishedquantity,

        deliverydate,
        scheduledstartdate,
        productionorderstatus,
        starteddate,
        status,
        productionordername,
        productionordernumber,
        endeddate,

        sc1,
        sc2,
        sc3,
        name,

        resource1,
        resource,
        task,
        assy_resource,
        machineresource,

        salesheadercustomername,
        salesheadermatched,
        saleslinematched,
        productiondemandmatched,
        inventorylotdemandid,

        buildstartdate,
        buildenddate,

        productiongroupname,
        salesorderlines,

        configuration,
        translatedconfigurationname,
        cache_refreshed_at
    )

    WITH machine AS MATERIALIZED
    (
        SELECT
            ROW_NUMBER() OVER () AS audit_row_id,
            m.*

        FROM d365fo.vw_salesprodmachines365_app m

        WHERE m.dataareaid = 'TOUS'
          AND BTRIM(COALESCE(m.sc2, '')) = 'Machine'
          AND m.productionorderstatus IN (3, 4)
    ),


    /*
    ============================================================
    LINKAGE VALIDATION
    ============================================================
    */

    linkage_audit AS MATERIALIZED
    (
        SELECT
            m.audit_row_id,

            MIN(
                NULLIF(
                    BTRIM(COALESCE(h.salesordername, '')),
                    ''
                )
            ) AS salesheadercustomername,

            COALESCE(
                BOOL_OR(h.salesordernumber IS NOT NULL),
                FALSE
            ) AS salesheadermatched,

            COALESCE(
                BOOL_OR(l.salesordernumber IS NOT NULL),
                FALSE
            ) AS saleslinematched,

            COALESCE(
                BOOL_OR(p.productionordernumber IS NOT NULL),
                FALSE
            ) AS productiondemandmatched,

            COALESCE
            (
                MIN(
                    NULLIF(
                        BTRIM(COALESCE(l.inventorylotid, '')),
                        ''
                    )
                )
                FILTER
                (
                    WHERE p.productionordernumber IS NOT NULL
                ),

                MIN(
                    NULLIF(
                        BTRIM(COALESCE(l.inventorylotid, '')),
                        ''
                    )
                ),

                ''
            ) AS inventorylotdemandid

        FROM machine m

        LEFT JOIN d365fo.salesorderheaderv3staging h
          ON h.salesordernumber = m.salesordernumber
         AND h.dataareaid = m.dataareaid

        LEFT JOIN d365fo.salesorderlinev2staging l
          ON l.salesordernumber = m.salesordernumber
         AND l.dataareaid = m.dataareaid
         AND l.itemnumber = m.itemnumber
         AND l.inventorylotid = m.productioninventorylotdemandid
         AND NULLIF(BTRIM(m.productioninventorylotdemandid), '') IS NOT NULL

        LEFT JOIN d365fo.prodproductionorderheaderstaging p
          ON p.demandsalesorderlineinventorylotid =
                l.inventorylotid

         AND p.demandsalesordernumber =
                l.salesordernumber

         AND p.dataareaid =
                l.dataareaid

         AND p.itemnumber =
                l.itemnumber

         AND p.productionordernumber =
                m.productionordernumber

         AND l.inventorylotid IS NOT NULL
         AND l.inventorylotid <> ''

        GROUP BY
            m.audit_row_id
    ),


    /*
    ============================================================
    CONFIGURATION DESCRIPTION
    ============================================================
    */

    config_names AS MATERIALIZED
    (
        SELECT DISTINCT ON
        (
            cfg.productmasterconfigurationid,
            cfg.productmasternumber
        )

            cfg.productmasterconfigurationid
                AS cfg_configid,

            cfg.productmasternumber
                AS cfg_itemnumber,

            cfg.translatedconfigurationname

        FROM
            d365fo.ecoresproductmasterconfigurationtranslationstaging cfg

        WHERE
            cfg.productmasterconfigurationid IS NOT NULL
            AND cfg.productmasterconfigurationid <> ''

        ORDER BY
            cfg.productmasterconfigurationid,
            cfg.productmasternumber,
            (cfg.languageid = 'en-us') DESC
    ),


    /*
    ============================================================
    PRODUCTION ORDER REFERENCES FOR SALES LINES
    ============================================================
    */

    production_refs AS MATERIALIZED
    (
        SELECT DISTINCT ON
        (
            p.dataareaid,
            p.demandsalesordernumber,
            p.itemnumber,
            p.demandsalesorderlineinventorylotid
        )

            p.dataareaid
                AS ref_dataareaid,

            p.demandsalesordernumber
                AS ref_salesordernumber,

            p.itemnumber
                AS ref_itemnumber,

            p.demandsalesorderlineinventorylotid
                AS ref_lotid,

            p.productionordernumber

        FROM
            d365fo.prodproductionorderheaderstaging p

        WHERE
            p.demandsalesorderlineinventorylotid IS NOT NULL
            AND p.demandsalesorderlineinventorylotid <> ''

        ORDER BY
            p.dataareaid,
            p.demandsalesordernumber,
            p.itemnumber,
            p.demandsalesorderlineinventorylotid,
            p.productionordernumber DESC
    ),


    /*
    ============================================================
    PRODUCTION GROUP NAME
    ============================================================
    */

    production_group_names AS MATERIALIZED
    (
        SELECT DISTINCT ON
        (
            groupid,
            dataareaid
        )

            groupid
                AS productiongroupid,

            dataareaid
                AS productiongroupdataareaid,

            groupname
                AS productiongroupname

        FROM
            d365fo.costproductiongroupstaging

        WHERE
            groupid IS NOT NULL
            AND groupid <> ''

        ORDER BY
            groupid,
            dataareaid,
            tomodifieddatetime DESC NULLS LAST
    ),


    /*
    ============================================================
    SALES ORDER LINE JSON
    ============================================================
    */

    sales_order_lines AS MATERIALIZED
    (
        SELECT
            m.audit_row_id,

            JSONB_AGG
            (
                JSONB_BUILD_OBJECT
                (
                    'line',
                    l.linenum,

                    'item',
                    l.itemnumber,

                    'description',
                    COALESCE
                    (
                        NULLIF(BTRIM(l.itemdesc), ''),
                        l.linedescription
                    ),

                    'configuration',
                    l.productconfigurationid,

                    'configname',
                    cfg.translatedconfigurationname,

                    'qty',
                    l.orderedsalesquantity,

                    'unit',
                    l.salesunitsymbol,

                    'reference',
                    pref.productionordernumber,

                    'status',
                    l.salesorderlinestatus
                )

                ORDER BY
                    l.linenum ASC
            ) AS lines

        FROM machine m

        JOIN d365fo.salesorderlinev2staging l
          ON l.salesordernumber =
                m.salesordernumber

         AND l.dataareaid =
                m.dataareaid


        LEFT JOIN config_names cfg
          ON cfg.cfg_configid =
                l.productconfigurationid

         AND cfg.cfg_itemnumber =
                l.itemnumber

         AND l.productconfigurationid IS NOT NULL
         AND l.productconfigurationid <> ''


        LEFT JOIN production_refs pref
          ON pref.ref_dataareaid =
                l.dataareaid

         AND pref.ref_salesordernumber =
                l.salesordernumber

         AND pref.ref_itemnumber =
                l.itemnumber

         AND pref.ref_lotid =
                l.inventorylotid

         AND l.inventorylotid IS NOT NULL
         AND l.inventorylotid <> ''

        GROUP BY
            m.audit_row_id
    )


    /*
    ============================================================
    FINAL CACHE DATASET
    ============================================================
    */

    SELECT
        m.salesordernumber,
        m.dataareaid,
        m.deliveryaddressname,
        m.confirmedshippingdate,
        m.salesordername,
        m.salesorderpoolid,
        m.requestedshippingdate,
        m.ordercreationdatetime,
        m.engineeringnotes,

        m.itemdesc,
        m.itemnumber,
        m.orderedsalesquantity,
        m.estimatedquantity,
        m.scheduledquantity,
        m.remainingreportasfinishedquantity,

        m.deliverydate,
        m.scheduledstartdate,
        m.productionorderstatus,
        m.starteddate,
        m.status,
        m.productionordername,
        m.productionordernumber,
        m.endeddate,

        m.sc1,
        m.sc2,
        m.sc3,
        m.name,

        m."Resource1",
        m."Resource",
        m."Task",
        m."Assy_Resource",
        m."MachineResource",

        la.salesheadercustomername,
        la.salesheadermatched,
        la.saleslinematched,
        la.productiondemandmatched,
        COALESCE(m.productioninventorylotdemandid, ''),

        bd.buildstartdate,
        bd.buildenddate,

        pgn.productiongroupname,

        sol.lines,

        m.configuration,
        m.translatedconfigurationname,
        CURRENT_TIMESTAMP

    FROM machine m

    JOIN linkage_audit la
      ON la.audit_row_id =
            m.audit_row_id

    LEFT JOIN d365fo.vw_production_build_dates_app bd
      ON bd.dataareaid =
            m.dataareaid

     AND bd.productionordernumber =
            m.productionordernumber

    LEFT JOIN production_group_names pgn
      ON pgn.productiongroupid =
            m.productiongroupid

     AND pgn.productiongroupdataareaid =
            m.dataareaid

    LEFT JOIN sales_order_lines sol
      ON sol.audit_row_id =
            m.audit_row_id;


    ANALYZE d365fo.production_priority_app_cache;

END;
$procedure$
;
CALL d365fo.sp_refresh_production_priority_cache();
COMMIT;
