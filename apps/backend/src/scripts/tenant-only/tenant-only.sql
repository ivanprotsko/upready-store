-- tenant-only.sql: keep one tenant in a scratch copy of the platform database,
-- optionally anonymize it, and verify the result. README.md next to this file
-- explains the rules, the marker and how to run it.
--
-- Loading this file defines functions and nothing else. Every function lives in
-- pg_temp, so it exists for this session only, never lands in the catalog of the
-- database for good and never reaches a pg_dump of it. A driver (cli.ts locally,
-- deploy/scripts/tenant-only-dump.sh through psql on the host) loads the file,
-- opens a transaction, calls one of the entry points and decides COMMIT or
-- ROLLBACK itself:
--
--   pg_temp.tenant_only_run(keep_handle, anonymize, protected_dbs)
--   pg_temp.tenant_only_check(keep_handle, anonymize)
--   pg_temp.tenant_only_assert_clean()
--   pg_temp.tenant_only_mark(source_db, protected_dbs)
--   pg_temp.tenant_only_unmark()
--   pg_temp.tenant_only_media_refs(keep_handle)
--
-- SQLSTATE codes raised on purpose:
--   UT001  guard refused the database (protected name or no scratch-copy marker)
--   UT002  verification found rows that must not be there
--   UT003  bad input (no tenant with that handle, nothing to do)

-- The functions drop and recreate their own temp tables; keep the "does not
-- exist, skipping" notices of that out of the operator's output.
SET client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- Constants
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.tenant_only_marker() RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT 'upready-scratch-copy'::text $$;

-- Names refused whatever the caller passes: the live databases of both
-- instances (deploy/compose.mt.yml's DB_NAME default on the INTL host,
-- deploy/mt/ru.env.example's on the RU host) and the server's own databases.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_always_protected() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['medusa_mt', 'medusa_ru', 'postgres', 'template0', 'template1']::text[] $$;

-- An e-mail address, plain (`a@b.ru`) or URL-encoded (`a%40b.ru`, how the
-- Robokassa payment URL in payment_session.data carries it). The negative
-- lookahead keeps `logo@2x.png` out.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_email_re() RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT '[A-Za-z0-9._%+-]+(?:@|%40)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?!(?:png|jpe?g|webp|gif|svg|avif|mp4|pdf|css|js)\M)[A-Za-z]{2,}'::text
$$;

-- One address in the form the checks compare: decoded and lower-case.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_norm_email(e text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(replace(replace(replace(e, '%40', '@'), '%2B', '+'), '%2b', '+'))
$$;

CREATE OR REPLACE FUNCTION pg_temp.tenant_only_is_fake_email(e text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT pg_temp.tenant_only_norm_email(e) LIKE '%@example.invalid' $$;

-- A tenant id: `ten_` plus a ULID.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_tenant_id_re() RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT 'ten_[0-9A-HJKMNP-TV-Z]{26}'::text $$;

CREATE OR REPLACE FUNCTION pg_temp.tenant_only_fake_phone() RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT '+70000000000'::text $$;

CREATE OR REPLACE FUNCTION pg_temp.tenant_only_fake_address() RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT 'ул. Тестовая, д. 1'::text $$;

-- ---------------------------------------------------------------------------
-- Schema helpers
-- ---------------------------------------------------------------------------

-- True when public.<name> exists, or public.<table>.<column> for "table.column".
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_has(name text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN strpos(name, '.') > 0 THEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = split_part(name, '.', 1)
        AND column_name = split_part(name, '.', 2))
    ELSE EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = name AND table_type = 'BASE TABLE')
  END
$$;

-- Every text and JSON column of every table in public.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_text_columns()
RETURNS TABLE(tbl text, col text, typ text, nullable boolean)
LANGUAGE sql STABLE AS $$
  SELECT c.table_name::text, c.column_name::text, c.data_type::text, c.is_nullable = 'YES'
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public'
    AND c.data_type IN ('text', 'character varying', 'json', 'jsonb')
  ORDER BY 1, 2
$$;

-- Tables with a tenant_id column, the tenant table itself excluded.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_tenant_tables() RETURNS SETOF text
LANGUAGE sql STABLE AS $$
  SELECT c.table_name::text
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id' AND c.table_name <> 'tenant'
  ORDER BY 1
$$;

-- Row count of every table in public.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_table_counts()
RETURNS TABLE(tbl text, n bigint)
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname::text AS relname
    FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
    WHERE s.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
    ORDER BY c.relname
  LOOP
    tbl := r.relname;
    EXECUTE format('SELECT count(*) FROM public.%I', r.relname) INTO n;
    RETURN NEXT;
  END LOOP;
END
$fn$;

-- Runs one statement and returns how many rows it touched.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_exec(stmt text) RETURNS bigint
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE n bigint;
BEGIN
  EXECUTE stmt;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$fn$;

-- Runs a list of steps, each `{label, needs, sql}` where needs is a comma list
-- of tables or table.column that must exist. A step whose table is missing on
-- this database is reported with a NULL count and skipped, so an older or newer
-- schema than the one this file was written against still runs.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_steps(steps text[])
RETURNS TABLE(step text, affected bigint)
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE
  s text[];
  need text;
  missing text;
BEGIN
  FOREACH s SLICE 1 IN ARRAY steps LOOP
    missing := NULL;
    IF s[2] <> '' THEN
      FOREACH need IN ARRAY string_to_array(s[2], ',') LOOP
        IF NOT pg_temp.tenant_only_has(trim(need)) THEN
          missing := trim(need);
          EXIT;
        END IF;
      END LOOP;
    END IF;
    IF missing IS NOT NULL THEN
      step := s[1] || ' (skipped: no ' || missing || ')';
      affected := NULL;
    ELSE
      step := s[1];
      affected := pg_temp.tenant_only_exec(s[3]);
    END IF;
    RETURN NEXT;
  END LOOP;
END
$fn$;

-- ---------------------------------------------------------------------------
-- Text scans, shared by the trim, the anonymizer and the checks
-- ---------------------------------------------------------------------------

-- Every e-mail address found in any text or JSON column: one row per distinct
-- address per column, normalized. Never printed, only counted or joined.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_emails()
RETURNS TABLE(tbl text, col text, email text)
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM pg_temp.tenant_only_text_columns() LOOP
    RETURN QUERY EXECUTE format(
      'SELECT DISTINCT %L::text, %L::text, pg_temp.tenant_only_norm_email(m[1])
         FROM (SELECT regexp_matches(%I::text, %L, ''g'') AS m
                 FROM public.%I
                WHERE %I::text LIKE ''%%@%%'' OR %I::text ILIKE ''%%\%%40%%'') s',
      r.tbl, r.col, r.col, '(' || pg_temp.tenant_only_email_re() || ')', r.tbl, r.col, r.col);
  END LOOP;
END
$fn$;

-- Rows per text or JSON column whose value matches pattern (a Postgres ARE),
-- after removing every occurrence of `allowed` (a literal, or NULL). Only
-- columns with at least one such row are returned. `prefilter` is a LIKE
-- pattern that cheaply narrows the rows the regex runs on.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_scan(pattern text, allowed text, prefilter text)
RETURNS TABLE(tbl text, col text, n bigint)
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM pg_temp.tenant_only_text_columns() LOOP
    tbl := r.tbl;
    col := r.col;
    EXECUTE format(
      'SELECT count(*) FROM public.%I
        WHERE %I::text LIKE %L
          AND (CASE WHEN %L::text IS NULL THEN %I::text ELSE replace(%I::text, %L, '''') END) ~ %L',
      r.tbl, r.col, prefilter, allowed, r.col, r.col, allowed, pattern) INTO n;
    IF n > 0 THEN
      RETURN NEXT;
    END IF;
  END LOOP;
END
$fn$;

-- ---------------------------------------------------------------------------
-- Guard and marker
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.tenant_only_current_marker() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT shobj_description(d.oid, 'pg_database') FROM pg_database d WHERE d.datname = current_database()
$$;

-- Refuses unless this database is not on the protected list and carries the
-- scratch-copy marker in its comment.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_guard(protected_dbs text[]) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  db text := current_database();
  note text := pg_temp.tenant_only_current_marker();
BEGIN
  IF db = ANY (pg_temp.tenant_only_always_protected() || coalesce(protected_dbs, '{}'::text[])) THEN
    RAISE EXCEPTION 'tenant-only guard: database "%" is protected (the live database or a server database); work on a scratch copy', db
      USING ERRCODE = 'UT001';
  END IF;
  IF note IS NULL OR left(note, length(pg_temp.tenant_only_marker())) <> pg_temp.tenant_only_marker() THEN
    RAISE EXCEPTION 'tenant-only guard: database "%" has no scratch-copy marker (its comment must start with "%"); mark a copy you made yourself with --mark', db, pg_temp.tenant_only_marker()
      USING ERRCODE = 'UT001';
  END IF;
END
$fn$;

-- Puts the marker on this database. Refuses a protected name, so the live
-- database can never be marked by this function.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_mark(source_db text, protected_dbs text[]) RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  db text := current_database();
  note text;
BEGIN
  IF db = ANY (pg_temp.tenant_only_always_protected() || coalesce(protected_dbs, '{}'::text[])) THEN
    RAISE EXCEPTION 'tenant-only guard: refusing to mark protected database "%"', db USING ERRCODE = 'UT001';
  END IF;
  note := pg_temp.tenant_only_marker() || ' v1 source=' || coalesce(nullif(source_db, ''), 'unknown')
    || ' at=' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  EXECUTE format('COMMENT ON DATABASE %I IS %L', db, note);
  RETURN note;
END
$fn$;

-- Takes the marker off again, before the trimmed copy is dumped, so a database
-- restored from that dump never looks like a scratch copy.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_unmark() RETURNS boolean
LANGUAGE plpgsql AS $fn$
DECLARE
  note text := pg_temp.tenant_only_current_marker();
BEGIN
  IF note IS NULL OR left(note, length(pg_temp.tenant_only_marker())) <> pg_temp.tenant_only_marker() THEN
    RETURN false;
  END IF;
  EXECUTE format('COMMENT ON DATABASE %I IS NULL', current_database());
  RETURN true;
END
$fn$;

-- Module link rows (link_module_migrations) whose either end no longer exists.
-- A link row carries nothing but the two ids, and Medusa leaves such rows
-- behind on its own (an order hard-deleted under a soft-deleted order_cart).
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_drop_dangling_links()
RETURNS TABLE(step text, affected bigint)
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE
  r record;
  n bigint;
BEGIN
  IF NOT pg_temp.tenant_only_has('link_module_migrations') THEN
    RETURN;
  END IF;
  FOR r IN
    SELECT lm.table_name::text AS tbl, c.column_name::text AS col, pg_temp.tenant_only_ref_target(c.column_name::text) AS target
    FROM link_module_migrations lm
    JOIN information_schema.columns c ON c.table_schema = 'public' AND c.table_name = lm.table_name
    WHERE c.column_name LIKE '%\_id' AND pg_temp.tenant_only_has(lm.table_name)
    ORDER BY 1, 2
  LOOP
    IF r.target IS NULL OR NOT pg_temp.tenant_only_has(r.target || '.id') THEN
      CONTINUE;
    END IF;
    EXECUTE format('DELETE FROM public.%I l WHERE l.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.%I x WHERE x.id = l.%I)',
      r.tbl, r.col, r.target, r.col);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      step := format('delete %s rows whose %s is gone', r.tbl, r.col);
      affected := n;
      RETURN NEXT;
    END IF;
  END LOOP;
END
$fn$;

-- ---------------------------------------------------------------------------
-- Trim: keep one tenant
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.tenant_only_trim(keep_handle text)
RETURNS TABLE(step text, affected bigint)
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE
  k text;
  r record;
  n bigint;
  total bigint;
  pass int;
  ref record;
BEGIN
  SELECT t.id INTO k FROM tenant t WHERE t.handle = keep_handle;
  IF k IS NULL THEN
    RAISE EXCEPTION 'tenant-only: no tenant with handle "%"', keep_handle USING ERRCODE = 'UT003';
  END IF;

  DROP TABLE IF EXISTS pg_temp.tok_keep, pg_temp.tok_channel_keep, pg_temp.tok_channel_drop,
    pg_temp.tok_channel_tenant, pg_temp.tok_order_keep, pg_temp.tok_order_drop, pg_temp.tok_cart_keep,
    pg_temp.tok_cart_drop, pg_temp.tok_product_keep, pg_temp.tok_product_drop, pg_temp.tok_variant_drop,
    pg_temp.tok_customer_keep, pg_temp.tok_customer_drop, pg_temp.tok_location_keep,
    pg_temp.tok_location_drop, pg_temp.tok_fset_drop, pg_temp.tok_soption_drop, pg_temp.tok_apikey_drop,
    pg_temp.tok_promo_drop, pg_temp.tok_campaign_drop, pg_temp.tok_price_set_check,
    pg_temp.tok_inventory_check, pg_temp.tok_location_address, pg_temp.tok_cat_keep,
    pg_temp.tok_foreign_email, pg_temp.tok_foreign_host;

  -- Scope. Everything below is decided here, before the first row goes.
  CREATE TEMP TABLE tok_keep ON COMMIT DROP AS SELECT k AS id;

  CREATE TEMP TABLE tok_channel_tenant ON COMMIT DROP AS
    SELECT DISTINCT sales_channel_id AS id FROM tenant_tenant_sales_channel_sales_channel;
  CREATE TEMP TABLE tok_channel_keep ON COMMIT DROP AS
    SELECT DISTINCT sales_channel_id AS id FROM tenant_tenant_sales_channel_sales_channel WHERE tenant_id = k;
  -- A channel owned by another tenant. A channel no tenant owns (the platform's
  -- default and store-profile channels) stays, emptied of everything it sold.
  CREATE TEMP TABLE tok_channel_drop ON COMMIT DROP AS
    SELECT DISTINCT l.sales_channel_id AS id FROM tenant_tenant_sales_channel_sales_channel l
    WHERE l.tenant_id <> k AND NOT EXISTS (SELECT 1 FROM tok_channel_keep x WHERE x.id = l.sales_channel_id);

  CREATE TEMP TABLE tok_order_keep ON COMMIT DROP AS
    SELECT o.id FROM "order" o WHERE o.sales_channel_id IN (SELECT id FROM tok_channel_keep)
    UNION
    SELECT l.order_id FROM tenant_tenant_order_order l JOIN "order" o ON o.id = l.order_id WHERE l.tenant_id = k;
  CREATE TEMP TABLE tok_order_drop ON COMMIT DROP AS
    SELECT o.id FROM "order" o WHERE NOT EXISTS (SELECT 1 FROM tok_order_keep x WHERE x.id = o.id);

  CREATE TEMP TABLE tok_cart_keep ON COMMIT DROP AS
    SELECT c.id FROM cart c WHERE c.sales_channel_id IN (SELECT id FROM tok_channel_keep)
    UNION
    SELECT oc.cart_id FROM order_cart oc JOIN tok_order_keep x ON x.id = oc.order_id;
  CREATE TEMP TABLE tok_cart_drop ON COMMIT DROP AS
    SELECT c.id FROM cart c WHERE NOT EXISTS (SELECT 1 FROM tok_cart_keep x WHERE x.id = c.id);

  -- A product stays when it is sold in a channel of the kept tenant.
  CREATE TEMP TABLE tok_product_keep ON COMMIT DROP AS
    SELECT DISTINCT ps.product_id AS id FROM product_sales_channel ps
    WHERE ps.deleted_at IS NULL AND ps.sales_channel_id IN (SELECT id FROM tok_channel_keep);
  CREATE TEMP TABLE tok_product_drop ON COMMIT DROP AS
    SELECT p.id FROM product p WHERE NOT EXISTS (SELECT 1 FROM tok_product_keep x WHERE x.id = p.id);
  CREATE TEMP TABLE tok_variant_drop ON COMMIT DROP AS
    SELECT v.id FROM product_variant v WHERE v.product_id IN (SELECT id FROM tok_product_drop);

  -- A customer stays when the kept tenant has a reason to know them: an order
  -- or cart in its channels, or an account registered on its storefront. A row
  -- of the kept tenant's own that names a customer (course access, review,
  -- wishlist) is not a reason: on the stand copy ten course grants of the
  -- kept tenant came from orders placed on a sister site, and keeping their
  -- buyers would carry that site's customers along (step 13 drops such rows).
  CREATE TEMP TABLE tok_customer_keep (id text PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO tok_customer_keep
    SELECT o.customer_id FROM "order" o JOIN tok_order_keep x ON x.id = o.id WHERE o.customer_id IS NOT NULL
    UNION SELECT c.customer_id FROM cart c JOIN tok_cart_keep x ON x.id = c.id WHERE c.customer_id IS NOT NULL
    UNION SELECT cu.id FROM customer cu WHERE cu.metadata->>'tenant_id' = k
    ON CONFLICT DO NOTHING;
  DELETE FROM tok_customer_keep x WHERE NOT EXISTS (SELECT 1 FROM customer c WHERE c.id = x.id);
  CREATE TEMP TABLE tok_customer_drop ON COMMIT DROP AS
    SELECT c.id FROM customer c WHERE NOT EXISTS (SELECT 1 FROM tok_customer_keep x WHERE x.id = c.id);

  -- A stock location stays when a kept channel stocks from it, or when only
  -- platform channels do (the seed's per-country warehouses). Another tenant's
  -- warehouse goes even though the platform's default channel also links it.
  CREATE TEMP TABLE tok_location_keep ON COMMIT DROP AS
    SELECT DISTINCT scl.stock_location_id AS id FROM sales_channel_stock_location scl
    WHERE scl.sales_channel_id IN (SELECT id FROM tok_channel_keep)
    UNION
    SELECT sl.id FROM stock_location sl
    WHERE EXISTS (SELECT 1 FROM sales_channel_stock_location x
                  WHERE x.stock_location_id = sl.id AND x.sales_channel_id NOT IN (SELECT id FROM tok_channel_tenant))
      AND NOT EXISTS (SELECT 1 FROM sales_channel_stock_location x
                      WHERE x.stock_location_id = sl.id AND x.sales_channel_id IN (SELECT id FROM tok_channel_drop))
    UNION
    SELECT default_location_id FROM store WHERE default_location_id IS NOT NULL;
  CREATE TEMP TABLE tok_location_drop ON COMMIT DROP AS
    SELECT sl.id FROM stock_location sl WHERE NOT EXISTS (SELECT 1 FROM tok_location_keep x WHERE x.id = sl.id);
  CREATE TEMP TABLE tok_location_address ON COMMIT DROP AS
    SELECT sl.address_id AS id FROM stock_location sl
    WHERE sl.id IN (SELECT id FROM tok_location_drop) AND sl.address_id IS NOT NULL;
  CREATE TEMP TABLE tok_fset_drop ON COMMIT DROP AS
    SELECT fs.id FROM fulfillment_set fs
    WHERE NOT EXISTS (SELECT 1 FROM location_fulfillment_set l
                      WHERE l.fulfillment_set_id = fs.id AND l.stock_location_id IN (SELECT id FROM tok_location_keep));
  CREATE TEMP TABLE tok_soption_drop ON COMMIT DROP AS
    SELECT so.id FROM shipping_option so JOIN service_zone sz ON sz.id = so.service_zone_id
    WHERE sz.fulfillment_set_id IN (SELECT id FROM tok_fset_drop);

  CREATE TEMP TABLE tok_apikey_drop ON COMMIT DROP AS
    SELECT l.api_key_id AS id FROM tenant_tenant_api_key_api_key l WHERE l.tenant_id <> k
    UNION
    SELECT p.publishable_key_id FROM publishable_api_key_sales_channel p
    WHERE p.sales_channel_id IN (SELECT id FROM tok_channel_drop)
      AND NOT EXISTS (SELECT 1 FROM publishable_api_key_sales_channel p2
                      WHERE p2.publishable_key_id = p.publishable_key_id
                        AND p2.sales_channel_id NOT IN (SELECT id FROM tok_channel_drop))
    EXCEPT
    SELECT l.api_key_id FROM tenant_tenant_api_key_api_key l WHERE l.tenant_id = k;

  CREATE TEMP TABLE tok_promo_drop ON COMMIT DROP AS
    SELECT promotion_id AS id FROM tenant_tenant_promotion_promotion WHERE tenant_id <> k
    EXCEPT SELECT promotion_id FROM tenant_tenant_promotion_promotion WHERE tenant_id = k;
  CREATE TEMP TABLE tok_campaign_drop (id text) ON COMMIT DROP;
  IF pg_temp.tenant_only_has('tenant_tenant_promotion_campaign') THEN
    INSERT INTO tok_campaign_drop
      SELECT campaign_id FROM tenant_tenant_promotion_campaign WHERE tenant_id <> k
      EXCEPT SELECT campaign_id FROM tenant_tenant_promotion_campaign WHERE tenant_id = k;
  END IF;

  CREATE TEMP TABLE tok_price_set_check (id text) ON COMMIT DROP;
  INSERT INTO tok_price_set_check
    SELECT price_set_id FROM product_variant_price_set WHERE variant_id IN (SELECT id FROM tok_variant_drop)
    UNION SELECT price_set_id FROM shipping_option_price_set WHERE shipping_option_id IN (SELECT id FROM tok_soption_drop);
  CREATE TEMP TABLE tok_inventory_check ON COMMIT DROP AS
    SELECT inventory_item_id AS id FROM product_variant_inventory_item WHERE variant_id IN (SELECT id FROM tok_variant_drop);

  -- What the check after the trim looks for: the addresses of every person the
  -- removed tenants knew (buyers and staff), unless the kept tenant or the
  -- platform knows them too, and every host name of a removed tenant.
  CREATE TEMP TABLE tok_foreign_email ON COMMIT DROP AS
    SELECT kind, email FROM (
      SELECT DISTINCT 'buyer'::text AS kind, pg_temp.tenant_only_norm_email(e) AS email FROM (
        SELECT cu.email AS e FROM customer cu WHERE cu.id IN (SELECT id FROM tok_customer_drop)
        UNION ALL SELECT c.email FROM cart c WHERE c.id IN (SELECT id FROM tok_cart_drop)
        UNION ALL SELECT o.email FROM "order" o WHERE o.id IN (SELECT id FROM tok_order_drop)
        UNION ALL SELECT ah.email FROM account_holder ah
          JOIN customer_account_holder l ON l.account_holder_id = ah.id
          WHERE l.customer_id IN (SELECT id FROM tok_customer_drop)
      ) b WHERE e LIKE '%@%'
      UNION
      SELECT DISTINCT 'staff', pg_temp.tenant_only_norm_email(ta.email) FROM tenant_admin ta
      WHERE ta.tenant_id <> k AND ta.email LIKE '%@%'
    ) f
    WHERE f.email NOT IN (
      SELECT pg_temp.tenant_only_norm_email(e) FROM (
        SELECT cu.email AS e FROM customer cu WHERE cu.id IN (SELECT id FROM tok_customer_keep)
        UNION ALL SELECT c.email FROM cart c WHERE c.id IN (SELECT id FROM tok_cart_keep)
        UNION ALL SELECT o.email FROM "order" o WHERE o.id IN (SELECT id FROM tok_order_keep)
        UNION ALL SELECT ta.email FROM tenant_admin ta WHERE ta.tenant_id = k
        UNION ALL SELECT u.email FROM "user" u
      ) kept WHERE e IS NOT NULL);
  CREATE TEMP TABLE tok_foreign_host ON COMMIT DROP AS
    SELECT DISTINCT lower(d.host) AS host FROM tenant_domain d
    WHERE d.tenant_id <> k AND d.host NOT LIKE '%.localhost'
      AND lower(d.host) NOT IN (SELECT lower(host) FROM tenant_domain WHERE tenant_id = k);

  ANALYZE tok_channel_keep, tok_channel_drop, tok_order_keep, tok_order_drop, tok_cart_keep, tok_cart_drop,
    tok_product_keep, tok_product_drop, tok_variant_drop, tok_customer_keep, tok_customer_drop,
    tok_location_keep, tok_location_drop, tok_fset_drop, tok_soption_drop;

  RETURN QUERY SELECT 'scope: kept channels'::text, (SELECT count(*) FROM tok_channel_keep)
    UNION ALL SELECT 'scope: kept orders', (SELECT count(*) FROM tok_order_keep)
    UNION ALL SELECT 'scope: kept carts', (SELECT count(*) FROM tok_cart_keep)
    UNION ALL SELECT 'scope: kept products', (SELECT count(*) FROM tok_product_keep)
    UNION ALL SELECT 'scope: kept customers', (SELECT count(*) FROM tok_customer_keep)
    UNION ALL SELECT 'scope: kept stock locations', (SELECT count(*) FROM tok_location_keep);

  -- 1. Ownership the kept tenant inherits: a product it sells, or an order
  --    placed in its channel, that another tenant's link row names.
  RETURN QUERY SELECT * FROM pg_temp.tenant_only_steps(ARRAY[
    ['hand kept products to the kept tenant', 'tenant_tenant_product_product', $q$
      UPDATE tenant_tenant_product_product l SET tenant_id = (SELECT id FROM tok_keep)
      WHERE l.tenant_id <> (SELECT id FROM tok_keep)
        AND l.product_id IN (SELECT id FROM tok_product_keep)
        AND NOT EXISTS (SELECT 1 FROM tenant_tenant_product_product x
                        WHERE x.product_id = l.product_id AND x.tenant_id = (SELECT id FROM tok_keep))
        AND l.id = (SELECT min(x.id) FROM tenant_tenant_product_product x
                    WHERE x.product_id = l.product_id AND x.tenant_id <> (SELECT id FROM tok_keep))$q$],
    ['hand kept orders to the kept tenant', 'tenant_tenant_order_order', $q$
      UPDATE tenant_tenant_order_order l SET tenant_id = (SELECT id FROM tok_keep)
      WHERE l.tenant_id <> (SELECT id FROM tok_keep)
        AND l.order_id IN (SELECT id FROM tok_order_keep)
        AND NOT EXISTS (SELECT 1 FROM tenant_tenant_order_order x
                        WHERE x.order_id = l.order_id AND x.tenant_id = (SELECT id FROM tok_keep))
        AND l.id = (SELECT min(x.id) FROM tenant_tenant_order_order x
                    WHERE x.order_id = l.order_id AND x.tenant_id <> (SELECT id FROM tok_keep))$q$]
  ]);

  -- 2. Orders of other tenants and everything hanging off them.
  RETURN QUERY SELECT * FROM pg_temp.tenant_only_steps(ARRAY[
    ['delete return_fulfillment of removed orders', 'return_fulfillment,return', $q$
      DELETE FROM return_fulfillment WHERE return_id IN (SELECT id FROM "return" WHERE order_id IN (SELECT id FROM tok_order_drop))$q$],
    ['delete return_item of removed orders', 'return_item,return', $q$
      DELETE FROM return_item WHERE return_id IN (SELECT id FROM "return" WHERE order_id IN (SELECT id FROM tok_order_drop))$q$],
    ['delete return of removed orders', 'return', $q$
      DELETE FROM "return" WHERE order_id IN (SELECT id FROM tok_order_drop)$q$],
    ['delete order_claim_item_image of removed orders', 'order_claim_item_image,order_claim_item,order_claim', $q$
      DELETE FROM order_claim_item_image WHERE claim_item_id IN (SELECT ci.id FROM order_claim_item ci JOIN order_claim c ON c.id = ci.claim_id WHERE c.order_id IN (SELECT id FROM tok_order_drop))$q$],
    ['delete order_claim_item of removed orders', 'order_claim_item,order_claim', $q$
      DELETE FROM order_claim_item WHERE claim_id IN (SELECT id FROM order_claim WHERE order_id IN (SELECT id FROM tok_order_drop))$q$],
    ['delete order_claim of removed orders', 'order_claim', $q$
      DELETE FROM order_claim WHERE order_id IN (SELECT id FROM tok_order_drop)$q$],
    ['delete order_exchange_item of removed orders', 'order_exchange_item,order_exchange', $q$
      DELETE FROM order_exchange_item WHERE exchange_id IN (SELECT id FROM order_exchange WHERE order_id IN (SELECT id FROM tok_order_drop))$q$],
    ['delete order_exchange of removed orders', 'order_exchange', $q$
      DELETE FROM order_exchange WHERE order_id IN (SELECT id FROM tok_order_drop)$q$],
    ['delete order_change_action of removed orders', 'order_change_action', $q$
      DELETE FROM order_change_action WHERE order_id IN (SELECT id FROM tok_order_drop)$q$],
    ['delete order_change of removed orders', 'order_change', $q$
      DELETE FROM order_change WHERE order_id IN (SELECT id FROM tok_order_drop)$q$],
    ['delete order_item of removed orders', 'order_item', $q$
      DELETE FROM order_item WHERE order_id IN (SELECT id FROM tok_order_drop)$q$],
    ['delete order_shipping of removed orders', 'order_shipping', $q$
      DELETE FROM order_shipping WHERE order_id IN (SELECT id FROM tok_order_drop)$q$],
    ['delete order_summary of removed orders', 'order_summary', $q$
      DELETE FROM order_summary WHERE order_id IN (SELECT id FROM tok_order_drop)$q$],
    ['delete order_transaction of removed orders', 'order_transaction', $q$
      DELETE FROM order_transaction WHERE order_id IN (SELECT id FROM tok_order_drop)$q$],
    ['delete order_credit_line of removed orders', 'order_credit_line', $q$
      DELETE FROM order_credit_line WHERE order_id IN (SELECT id FROM tok_order_drop)$q$],
    ['delete order_cart links of removed orders', 'order_cart', $q$
      DELETE FROM order_cart WHERE order_id IN (SELECT id FROM tok_order_drop)$q$],
    ['delete order_payment_collection links of removed orders', 'order_payment_collection', $q$
      DELETE FROM order_payment_collection WHERE order_id IN (SELECT id FROM tok_order_drop)$q$],
    ['delete order_promotion links of removed orders', 'order_promotion', $q$
      DELETE FROM order_promotion WHERE order_id IN (SELECT id FROM tok_order_drop)$q$],
    ['delete order_fulfillment links of removed orders', 'order_fulfillment', $q$
      DELETE FROM order_fulfillment WHERE order_id IN (SELECT id FROM tok_order_drop)$q$],
    ['delete tenant order links of removed orders', 'tenant_tenant_order_order', $q$
      DELETE FROM tenant_tenant_order_order WHERE order_id IN (SELECT id FROM tok_order_drop)$q$],
    ['delete order', 'order', $q$
      DELETE FROM "order" WHERE id IN (SELECT id FROM tok_order_drop)$q$],
    ['delete order_line_item left without an order', 'order_line_item,order_item', $q$
      DELETE FROM order_line_item li
      WHERE NOT EXISTS (SELECT 1 FROM order_item oi WHERE oi.item_id = li.id)
        AND NOT EXISTS (SELECT 1 FROM return_item ri WHERE ri.item_id = li.id)
        AND NOT EXISTS (SELECT 1 FROM order_claim_item ci WHERE ci.item_id = li.id)
        AND NOT EXISTS (SELECT 1 FROM order_exchange_item ei WHERE ei.item_id = li.id)$q$],
    ['delete order_shipping_method left without an order', 'order_shipping_method,order_shipping', $q$
      DELETE FROM order_shipping_method sm WHERE NOT EXISTS (SELECT 1 FROM order_shipping os WHERE os.shipping_method_id = sm.id)$q$],
    ['delete order_address left without an order', 'order_address', $q$
      DELETE FROM order_address a
      WHERE NOT EXISTS (SELECT 1 FROM "order" o WHERE o.shipping_address_id = a.id)
        AND NOT EXISTS (SELECT 1 FROM "order" o WHERE o.billing_address_id = a.id)$q$]
  ]);

  -- 3. Carts outside the kept channels.
  RETURN QUERY SELECT * FROM pg_temp.tenant_only_steps(ARRAY[
    ['delete credit_line of removed carts', 'credit_line', $q$
      DELETE FROM credit_line WHERE cart_id IN (SELECT id FROM tok_cart_drop)$q$],
    ['delete cart_promotion links of removed carts', 'cart_promotion', $q$
      DELETE FROM cart_promotion WHERE cart_id IN (SELECT id FROM tok_cart_drop)$q$],
    ['delete cart_payment_collection links of removed carts', 'cart_payment_collection', $q$
      DELETE FROM cart_payment_collection WHERE cart_id IN (SELECT id FROM tok_cart_drop)$q$],
    ['delete order_cart links of removed carts', 'order_cart', $q$
      DELETE FROM order_cart WHERE cart_id IN (SELECT id FROM tok_cart_drop)$q$],
    ['delete cart (line items, shipping methods, adjustments and tax lines cascade)', 'cart', $q$
      DELETE FROM cart WHERE id IN (SELECT id FROM tok_cart_drop)$q$],
    ['delete cart_address left without a cart', 'cart_address', $q$
      DELETE FROM cart_address a
      WHERE NOT EXISTS (SELECT 1 FROM cart c WHERE c.shipping_address_id = a.id)
        AND NOT EXISTS (SELECT 1 FROM cart c WHERE c.billing_address_id = a.id)$q$]
  ]);

  RETURN QUERY SELECT * FROM pg_temp.tenant_only_drop_dangling_links();

  -- 4. Payments, fulfillments and reservations nothing kept points at.
  RETURN QUERY SELECT * FROM pg_temp.tenant_only_steps(ARRAY[
    ['delete payment_collection left without a cart or order (sessions, payments, captures, refunds cascade)', 'payment_collection,cart_payment_collection,order_payment_collection', $q$
      DELETE FROM payment_collection pc
      WHERE NOT EXISTS (SELECT 1 FROM cart_payment_collection l WHERE l.payment_collection_id = pc.id)
        AND NOT EXISTS (SELECT 1 FROM order_payment_collection l WHERE l.payment_collection_id = pc.id)$q$],
    ['delete fulfillment left without an order or return', 'fulfillment,order_fulfillment,return_fulfillment', $q$
      DELETE FROM fulfillment f
      WHERE NOT EXISTS (SELECT 1 FROM order_fulfillment l WHERE l.fulfillment_id = f.id)
        AND NOT EXISTS (SELECT 1 FROM return_fulfillment l WHERE l.fulfillment_id = f.id)$q$],
    ['delete fulfillment_address left without a fulfillment', 'fulfillment_address,fulfillment', $q$
      DELETE FROM fulfillment_address a WHERE NOT EXISTS (SELECT 1 FROM fulfillment f WHERE f.delivery_address_id = a.id)$q$],
    ['delete reservation_item of removed line items', 'reservation_item', $q$
      DELETE FROM reservation_item r
      WHERE r.line_item_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM order_line_item li WHERE li.id = r.line_item_id)
        AND NOT EXISTS (SELECT 1 FROM cart_line_item li WHERE li.id = r.line_item_id)$q$]
  ]);

  -- 5. Customers.
  RETURN QUERY SELECT * FROM pg_temp.tenant_only_steps(ARRAY[
    ['delete customer_account_holder links of removed customers', 'customer_account_holder', $q$
      DELETE FROM customer_account_holder WHERE customer_id IN (SELECT id FROM tok_customer_drop)$q$],
    ['delete customer (addresses and group memberships cascade)', 'customer', $q$
      DELETE FROM customer WHERE id IN (SELECT id FROM tok_customer_drop)$q$],
    ['delete account_holder left without a customer', 'account_holder,customer_account_holder', $q$
      DELETE FROM account_holder ah WHERE NOT EXISTS (SELECT 1 FROM customer_account_holder l WHERE l.account_holder_id = ah.id)$q$],
    ['point metadata.tenant_id of kept customers at the kept tenant', 'customer.metadata', $q$
      UPDATE customer SET metadata = jsonb_set(metadata::jsonb, '{tenant_id}', to_jsonb((SELECT id FROM tok_keep)))
      WHERE metadata::jsonb ? 'tenant_id' AND metadata->>'tenant_id' IS DISTINCT FROM (SELECT id FROM tok_keep)$q$]
  ]);

  -- 6. Logs that carry people: notifications and workflow executions. Kept only
  --    when they belong to a kept order, cart or customer.
  RETURN QUERY SELECT * FROM pg_temp.tenant_only_steps(ARRAY[
    ['delete notification not about a kept order or customer', 'notification', $q$
      DELETE FROM notification n
      WHERE NOT coalesce(
        (n.resource_type = 'order' AND EXISTS (SELECT 1 FROM tok_order_keep x WHERE x.id = n.resource_id))
        OR (n.resource_type = 'customer' AND (
              EXISTS (SELECT 1 FROM tok_customer_keep x WHERE x.id = n.resource_id)
              OR EXISTS (SELECT 1 FROM customer c JOIN tok_customer_keep x ON x.id = c.id
                         WHERE lower(c.email) = lower(n.resource_id)))),
        false)$q$],
    ['delete workflow_execution not about a kept cart or order', 'workflow_execution', $q$
      DELETE FROM workflow_execution w
      WHERE NOT EXISTS (
        SELECT 1 FROM (SELECT id FROM tok_cart_keep UNION ALL SELECT id FROM tok_order_keep) x
        WHERE w.transaction_id = x.id
           OR strpos(coalesce(w.context::text, ''), x.id) > 0
           OR strpos(coalesce(w.execution::text, ''), x.id) > 0)$q$]
  ]);

  -- 7. Logins. An identity keeps only actor ids that still exist: a kept
  --    customer, an admin of the kept tenant, a platform user. An admin of a
  --    removed tenant who also administers the kept one (the platform admin has
  --    a row in every shop) is pointed at their row in the kept tenant.
  RETURN QUERY SELECT * FROM pg_temp.tenant_only_steps(ARRAY[
    ['drop customer_id of removed customers from auth identities', 'auth_identity', $q$
      UPDATE auth_identity SET app_metadata = app_metadata - 'customer_id'
      WHERE app_metadata ? 'customer_id'
        AND NOT EXISTS (SELECT 1 FROM tok_customer_keep x WHERE x.id = app_metadata->>'customer_id')$q$],
    ['point tenant admin identities at the same person in the kept tenant', 'auth_identity,tenant_admin', $q$
      UPDATE auth_identity ai SET app_metadata = jsonb_set(ai.app_metadata, '{tenant_id}', to_jsonb(kr.id))
      FROM tenant_admin old
      JOIN tenant_admin kr ON lower(kr.email) = lower(old.email)
                          AND kr.tenant_id = (SELECT id FROM tok_keep)
                          AND kr.deleted_at IS NULL
      WHERE ai.app_metadata->>'tenant_id' = old.id AND old.tenant_id <> (SELECT id FROM tok_keep)$q$],
    ['drop tenant admin ids outside the kept tenant from auth identities', 'auth_identity,tenant_admin', $q$
      UPDATE auth_identity SET app_metadata = app_metadata - 'tenant_id'
      WHERE app_metadata ? 'tenant_id'
        AND NOT EXISTS (SELECT 1 FROM tenant_admin ta
                        WHERE ta.id = app_metadata->>'tenant_id' AND ta.tenant_id = (SELECT id FROM tok_keep))$q$],
    ['drop user ids of missing users from auth identities', 'auth_identity,user', $q$
      UPDATE auth_identity SET app_metadata = app_metadata - 'user_id'
      WHERE app_metadata ? 'user_id' AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = app_metadata->>'user_id')$q$],
    ['delete auth_identity left without an actor (provider identities, reset tokens, MFA cascade)', 'auth_identity', $q$
      DELETE FROM auth_identity ai
      WHERE NOT (coalesce(ai.app_metadata, '{}'::jsonb) ?| ARRAY['customer_id', 'tenant_id', 'user_id'])$q$]
  ]);

  -- 8. Products not sold in a kept channel, with variants, prices, inventory.
  RETURN QUERY SELECT * FROM pg_temp.tenant_only_steps(ARRAY[
    ['delete product_variant_price_set links of removed variants', 'product_variant_price_set', $q$
      DELETE FROM product_variant_price_set WHERE variant_id IN (SELECT id FROM tok_variant_drop)$q$],
    ['delete product_variant_inventory_item links of removed variants', 'product_variant_inventory_item', $q$
      DELETE FROM product_variant_inventory_item WHERE variant_id IN (SELECT id FROM tok_variant_drop)$q$],
    ['delete product_sales_channel links of removed products', 'product_sales_channel', $q$
      DELETE FROM product_sales_channel WHERE product_id IN (SELECT id FROM tok_product_drop)$q$],
    ['delete product_shipping_profile links of removed products', 'product_shipping_profile', $q$
      DELETE FROM product_shipping_profile WHERE product_id IN (SELECT id FROM tok_product_drop)$q$],
    ['delete tenant product links of removed products', 'tenant_tenant_product_product', $q$
      DELETE FROM tenant_tenant_product_product WHERE product_id IN (SELECT id FROM tok_product_drop)$q$],
    ['delete product (variants, images, option and category links cascade)', 'product', $q$
      DELETE FROM product WHERE id IN (SELECT id FROM tok_product_drop)$q$],
    ['delete inventory_item of removed variants (levels and reservations cascade)', 'inventory_item', $q$
      DELETE FROM inventory_item i
      WHERE i.id IN (SELECT id FROM tok_inventory_check)
        AND NOT EXISTS (SELECT 1 FROM product_variant_inventory_item l WHERE l.inventory_item_id = i.id)$q$]
  ]);

  -- 9. Categories: another tenant's, and the platform's ones no kept product
  --    sits in. A category stays when the kept tenant owns it or a kept product
  --    sits in an unowned one, and so does every ancestor of a kept category,
  --    because deleting a parent cascades to its children.
  CREATE TEMP TABLE tok_cat_keep ON COMMIT DROP AS
    WITH RECURSIVE seed AS (
      SELECT product_category_id AS id FROM tenant_tenant_product_product_category WHERE tenant_id = k
      UNION
      SELECT pcp.product_category_id FROM product_category_product pcp
      WHERE NOT EXISTS (SELECT 1 FROM tenant_tenant_product_product_category l
                        WHERE l.product_category_id = pcp.product_category_id AND l.tenant_id <> k)
    ), up AS (
      SELECT id FROM seed
      UNION
      SELECT c.parent_category_id FROM product_category c JOIN up ON c.id = up.id WHERE c.parent_category_id IS NOT NULL
    )
    SELECT DISTINCT id FROM up;
  RETURN QUERY SELECT * FROM pg_temp.tenant_only_steps(ARRAY[
    ['delete tenant category links of removed categories', 'tenant_tenant_product_product_category', $q$
      DELETE FROM tenant_tenant_product_product_category l
      WHERE NOT EXISTS (SELECT 1 FROM tok_cat_keep x WHERE x.id = l.product_category_id)$q$],
    ['clear category_id of kept product attributes bound to a removed category', 'tenant_product_attribute.category_id', $q$
      UPDATE tenant_product_attribute SET category_id = NULL
      WHERE category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tok_cat_keep x WHERE x.id = category_id)$q$],
    ['delete product_category (product links and child categories cascade)', 'product_category', $q$
      DELETE FROM product_category c WHERE NOT EXISTS (SELECT 1 FROM tok_cat_keep x WHERE x.id = c.id)$q$]
  ]);

  -- 10. Promotions and campaigns of other tenants.
  RETURN QUERY SELECT * FROM pg_temp.tenant_only_steps(ARRAY[
    ['delete cart_promotion links of removed promotions', 'cart_promotion', $q$
      DELETE FROM cart_promotion WHERE promotion_id IN (SELECT id FROM tok_promo_drop)$q$],
    ['delete order_promotion links of removed promotions', 'order_promotion', $q$
      DELETE FROM order_promotion WHERE promotion_id IN (SELECT id FROM tok_promo_drop)$q$],
    ['delete tenant promotion links of removed promotions', 'tenant_tenant_promotion_promotion', $q$
      DELETE FROM tenant_tenant_promotion_promotion WHERE promotion_id IN (SELECT id FROM tok_promo_drop)$q$],
    ['delete promotion (application methods and rule links cascade)', 'promotion', $q$
      DELETE FROM promotion WHERE id IN (SELECT id FROM tok_promo_drop)$q$],
    ['delete promotion_rule left without a promotion', 'promotion_rule,promotion_promotion_rule,application_method_buy_rules,application_method_target_rules', $q$
      DELETE FROM promotion_rule r
      WHERE NOT EXISTS (SELECT 1 FROM promotion_promotion_rule l WHERE l.promotion_rule_id = r.id)
        AND NOT EXISTS (SELECT 1 FROM application_method_buy_rules l WHERE l.promotion_rule_id = r.id)
        AND NOT EXISTS (SELECT 1 FROM application_method_target_rules l WHERE l.promotion_rule_id = r.id)$q$],
    ['delete tenant campaign links of removed campaigns', 'tenant_tenant_promotion_campaign', $q$
      DELETE FROM tenant_tenant_promotion_campaign WHERE campaign_id IN (SELECT id FROM tok_campaign_drop)$q$],
    ['delete promotion_campaign (budgets cascade)', 'promotion_campaign', $q$
      DELETE FROM promotion_campaign WHERE id IN (SELECT id FROM tok_campaign_drop)$q$]
  ]);

  -- 11. Publishable keys, warehouses with their delivery setup, sales channels.
  RETURN QUERY SELECT * FROM pg_temp.tenant_only_steps(ARRAY[
    ['delete publishable key channel links of removed keys and channels', 'publishable_api_key_sales_channel', $q$
      DELETE FROM publishable_api_key_sales_channel
      WHERE publishable_key_id IN (SELECT id FROM tok_apikey_drop) OR sales_channel_id IN (SELECT id FROM tok_channel_drop)$q$],
    ['delete tenant api key links of removed keys', 'tenant_tenant_api_key_api_key', $q$
      DELETE FROM tenant_tenant_api_key_api_key WHERE api_key_id IN (SELECT id FROM tok_apikey_drop)$q$],
    ['delete api_key of removed tenants', 'api_key', $q$
      DELETE FROM api_key WHERE id IN (SELECT id FROM tok_apikey_drop)$q$],
    ['delete shipping_option_price_set links of removed shipping options', 'shipping_option_price_set', $q$
      DELETE FROM shipping_option_price_set WHERE shipping_option_id IN (SELECT id FROM tok_soption_drop)$q$],
    ['delete location_fulfillment_set links of removed locations', 'location_fulfillment_set', $q$
      DELETE FROM location_fulfillment_set
      WHERE stock_location_id IN (SELECT id FROM tok_location_drop) OR fulfillment_set_id IN (SELECT id FROM tok_fset_drop)$q$],
    ['delete fulfillment_set (service zones, geo zones, shipping options and rules cascade)', 'fulfillment_set', $q$
      DELETE FROM fulfillment_set WHERE id IN (SELECT id FROM tok_fset_drop)$q$],
    ['delete shipping_option_type left without a shipping option', 'shipping_option_type', $q$
      DELETE FROM shipping_option_type t WHERE NOT EXISTS (SELECT 1 FROM shipping_option o WHERE o.shipping_option_type_id = t.id)$q$],
    ['delete location_fulfillment_provider links of removed locations', 'location_fulfillment_provider', $q$
      DELETE FROM location_fulfillment_provider WHERE stock_location_id IN (SELECT id FROM tok_location_drop)$q$],
    ['delete sales_channel_stock_location links of removed locations and channels', 'sales_channel_stock_location', $q$
      DELETE FROM sales_channel_stock_location
      WHERE stock_location_id IN (SELECT id FROM tok_location_drop) OR sales_channel_id IN (SELECT id FROM tok_channel_drop)$q$],
    ['delete inventory_level at removed locations', 'inventory_level', $q$
      DELETE FROM inventory_level WHERE location_id IN (SELECT id FROM tok_location_drop)$q$],
    ['delete reservation_item at removed locations', 'reservation_item', $q$
      DELETE FROM reservation_item WHERE location_id IN (SELECT id FROM tok_location_drop)$q$],
    ['delete stock_location', 'stock_location', $q$
      DELETE FROM stock_location WHERE id IN (SELECT id FROM tok_location_drop)$q$],
    ['delete stock_location_address of removed locations', 'stock_location_address', $q$
      DELETE FROM stock_location_address a
      WHERE a.id IN (SELECT id FROM tok_location_address)
        AND NOT EXISTS (SELECT 1 FROM stock_location s WHERE s.address_id = a.id)$q$],
    ['clear store default location that was removed', 'store.default_location_id', $q$
      UPDATE store SET default_location_id = NULL WHERE default_location_id IN (SELECT id FROM tok_location_drop)$q$],
    ['delete product_sales_channel links to removed channels', 'product_sales_channel', $q$
      DELETE FROM product_sales_channel WHERE sales_channel_id IN (SELECT id FROM tok_channel_drop)$q$],
    ['point store default channel at the kept tenant when it was removed', 'store.default_sales_channel_id', $q$
      UPDATE store SET default_sales_channel_id = (SELECT min(id) FROM tok_channel_keep)
      WHERE default_sales_channel_id IN (SELECT id FROM tok_channel_drop)$q$],
    ['delete tenant sales channel links of removed channels', 'tenant_tenant_sales_channel_sales_channel', $q$
      DELETE FROM tenant_tenant_sales_channel_sales_channel WHERE sales_channel_id IN (SELECT id FROM tok_channel_drop)$q$],
    ['delete sales_channel of removed tenants', 'sales_channel', $q$
      DELETE FROM sales_channel WHERE id IN (SELECT id FROM tok_channel_drop)$q$]
  ]);

  -- 12. Price sets nothing points at any more (prices and price rules cascade).
  total := 0;
  IF pg_temp.tenant_only_has('price_set') THEN
    FOR r IN
      SELECT c.table_name::text AS tbl FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.column_name = 'price_set_id' AND c.table_name <> 'price'
    LOOP
      EXECUTE format('DELETE FROM tok_price_set_check x WHERE EXISTS (SELECT 1 FROM public.%I l WHERE l.price_set_id = x.id)', r.tbl);
    END LOOP;
    DELETE FROM price_set WHERE id IN (SELECT id FROM tok_price_set_check);
    GET DIAGNOSTICS total = ROW_COUNT;
  END IF;
  step := 'delete price_set of removed variants and shipping options';
  affected := total;
  RETURN NEXT;

  -- 13. Rows of the kept tenant that point at something removed above. A row
  --     naming a removed order, cart or customer goes whole: it exists because
  --     of another shop's sale (a course grant paid on a sister site, a review
  --     by that site's buyer). A row naming a removed product, variant or
  --     course goes when the reference is NOT NULL and is cleared otherwise.
  --     Only values with the referenced entity's id prefix count, so a
  --     marketplace's own `product_id` or `order_id` is never taken for a
  --     Medusa one.
  FOR pass IN 1..3 LOOP
    total := 0;
    FOR ref IN
      SELECT t AS tbl, m.col, m.target, m.prefix, c.is_nullable = 'YES' AS nullable
      FROM pg_temp.tenant_only_tenant_tables() t
      CROSS JOIN (VALUES
        ('product_id', 'product', 'prod_'),
        ('variant_id', 'product_variant', 'variant_'),
        ('customer_id', 'customer', 'cus_'),
        ('order_id', 'order', 'order_'),
        ('cart_id', 'cart', 'cart_'),
        ('course_id', 'course', 'crs_')) AS m(col, target, prefix)
      JOIN information_schema.columns c
        ON c.table_schema = 'public' AND c.table_name = t AND c.column_name = m.col
       AND c.data_type IN ('text', 'character varying')
      WHERE pg_temp.tenant_only_has(m.target)
    LOOP
      IF ref.nullable AND ref.col NOT IN ('customer_id', 'order_id', 'cart_id') THEN
        EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I LIKE %L AND NOT EXISTS (SELECT 1 FROM public.%I x WHERE x.id = %I.%I)',
          ref.tbl, ref.col, ref.col, ref.prefix || '%', ref.target, ref.tbl, ref.col);
      ELSE
        EXECUTE format('DELETE FROM public.%I WHERE %I LIKE %L AND NOT EXISTS (SELECT 1 FROM public.%I x WHERE x.id = %I.%I)',
          ref.tbl, ref.col, ref.prefix || '%', ref.target, ref.tbl, ref.col);
      END IF;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN
        step := format('%s %s.%s pointing at a removed %s',
          CASE WHEN ref.nullable AND ref.col NOT IN ('customer_id', 'order_id', 'cart_id') THEN 'clear' ELSE 'delete rows of' END,
          ref.tbl, ref.col, ref.target);
        affected := n;
        RETURN NEXT;
      END IF;
      total := total + n;
    END LOOP;
    EXIT WHEN total = 0;
  END LOOP;

  -- 14. Every table with a tenant_id column: rows of any other tenant, and rows
  --     with no tenant at all. Tables other tables reference go last.
  IF pg_temp.tenant_only_has('tenant_product_attribute_option') THEN
    DELETE FROM tenant_product_attribute_option o
    WHERE EXISTS (SELECT 1 FROM tenant_product_attribute a WHERE a.id = o.attribute_id AND a.tenant_id <> k);
    GET DIAGNOSTICS n = ROW_COUNT;
    step := 'delete tenant_product_attribute_option of removed tenants';
    affected := n;
    RETURN NEXT;
  END IF;
  FOR r IN
    SELECT t AS tbl,
           (SELECT count(*) FROM pg_constraint fk
             WHERE fk.contype = 'f' AND fk.confrelid = format('public.%I', t)::regclass
               AND fk.conrelid <> fk.confrelid) AS referenced_by
    FROM pg_temp.tenant_only_tenant_tables() t
    ORDER BY 2, 1
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE tenant_id IS DISTINCT FROM $1', r.tbl) USING k;
    GET DIAGNOSTICS n = ROW_COUNT;
    step := format('delete %s rows of other tenants', r.tbl);
    affected := n;
    RETURN NEXT;
  END LOOP;

  -- 15. The tenants themselves, and the group that tied the kept one to its
  --     sister sites: alone in it, the kept tenant behaves as a one-site shop.
  RETURN QUERY SELECT * FROM pg_temp.tenant_only_steps(ARRAY[
    ['detach the kept tenant from its group', 'tenant.group_id', $q$
      UPDATE tenant SET group_id = NULL WHERE id = (SELECT id FROM tok_keep) AND group_id IS NOT NULL$q$],
    ['delete tenant', 'tenant', $q$
      DELETE FROM tenant WHERE id <> (SELECT id FROM tok_keep)$q$],
    ['delete tenant_group left without a tenant', 'tenant_group,tenant.group_id', $q$
      DELETE FROM tenant_group g WHERE NOT EXISTS (SELECT 1 FROM tenant t WHERE t.group_id = g.id)$q$]
  ]);

  -- 16. Catalogue rows only removed products used.
  RETURN QUERY SELECT * FROM pg_temp.tenant_only_steps(ARRAY[
    ['delete product_option no product uses (values cascade)', 'product_option,product_product_option,product_option_value,product_variant_option', $q$
      DELETE FROM product_option po
      WHERE NOT EXISTS (SELECT 1 FROM product_product_option x WHERE x.product_option_id = po.id)
        AND NOT EXISTS (SELECT 1 FROM product_option_value v JOIN product_variant_option pvo ON pvo.option_value_id = v.id
                        WHERE v.option_id = po.id)$q$],
    ['delete product_collection no product uses', 'product_collection,product.collection_id', $q$
      DELETE FROM product_collection pc WHERE NOT EXISTS (SELECT 1 FROM product p WHERE p.collection_id = pc.id)$q$],
    ['delete product_type no product uses', 'product_type,product.type_id', $q$
      DELETE FROM product_type pt WHERE NOT EXISTS (SELECT 1 FROM product p WHERE p.type_id = pt.id)$q$],
    ['delete product_tag no product uses', 'product_tag,product_tags', $q$
      DELETE FROM product_tag t WHERE NOT EXISTS (SELECT 1 FROM product_tags x WHERE x.product_tag_id = t.id)$q$]
  ]);

  -- 17. Translations of anything removed above.
  total := 0;
  IF pg_temp.tenant_only_has('translation') THEN
    FOR r IN SELECT DISTINCT t.reference FROM translation t LOOP
      IF pg_temp.tenant_only_has(r.reference || '.id') THEN
        EXECUTE format('DELETE FROM translation t WHERE t.reference = %L AND NOT EXISTS (SELECT 1 FROM public.%I x WHERE x.id = t.reference_id)',
          r.reference, r.reference);
        GET DIAGNOSTICS n = ROW_COUNT;
        total := total + n;
      END IF;
    END LOOP;
  END IF;
  step := 'delete translation of removed rows';
  affected := total;
  RETURN NEXT;

  RETURN QUERY SELECT * FROM pg_temp.tenant_only_drop_dangling_links();
END
$fn$;

-- ---------------------------------------------------------------------------
-- Anonymize
-- ---------------------------------------------------------------------------

-- Replaces every address in s with its stand-in from tok_anon_email, keeping
-- the URL-encoded form where it was encoded. An address with no stand-in (or
-- no map in this session at all) becomes redacted@example.invalid.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_replace_emails(s text) RETURNS text
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE
  m record;
  result text := s;
  fake text;
  have_map boolean := to_regclass('pg_temp.tok_anon_email') IS NOT NULL;
BEGIN
  IF s IS NULL OR (strpos(s, '@') = 0 AND strpos(lower(s), '%40') = 0) THEN
    RETURN s;
  END IF;
  FOR m IN
    SELECT DISTINCT x[1] AS e
    FROM regexp_matches(s, '(' || pg_temp.tenant_only_email_re() || ')', 'g') AS x
    ORDER BY 1 DESC
  LOOP
    IF pg_temp.tenant_only_is_fake_email(m.e) THEN
      CONTINUE;
    END IF;
    fake := NULL;
    IF have_map THEN
      EXECUTE 'SELECT fake FROM pg_temp.tok_anon_email WHERE email = $1' INTO fake USING pg_temp.tenant_only_norm_email(m.e);
    END IF;
    fake := coalesce(fake, 'redacted@example.invalid');
    IF strpos(m.e, '@') = 0 THEN
      fake := replace(fake, '@', '%40');
    END IF;
    result := replace(result, m.e, fake);
  END LOOP;
  RETURN result;
END
$fn$;

-- What a JSON key holding personal data becomes. NULL means "not personal,
-- recurse into it".
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_scrub_value(key text, v jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE
  k text := lower(key);
  kind text := jsonb_typeof(v);
BEGIN
  IF v IS NULL OR kind = 'null' THEN
    RETURN v;
  END IF;
  IF k = 'email' OR k LIKE '%\_email' OR k IN ('reply_to', 'email_reply_to') THEN
    IF kind = 'string' THEN RETURN to_jsonb(pg_temp.tenant_only_replace_emails(v #>> '{}')); END IF;
  ELSIF k = 'phone' OR k LIKE '%\_phone' OR k IN ('whatsapp', 'tel', 'mobile') THEN
    IF kind = 'string' THEN RETURN to_jsonb(pg_temp.tenant_only_fake_phone()); END IF;
  ELSIF k IN ('first_name', 'contact_first_name') THEN
    IF kind = 'string' THEN RETURN to_jsonb('Имя'::text); END IF;
  ELSIF k IN ('last_name', 'contact_last_name') THEN
    IF kind = 'string' THEN RETURN to_jsonb('Фамилия'::text); END IF;
  ELSIF k IN ('middle_name', 'patronymic', 'full_name', 'author', 'author_name', 'user_name', 'recipient_name', 'customer_name') THEN
    IF kind = 'string' THEN RETURN to_jsonb('Аноним'::text); END IF;
  ELSIF k IN ('telegram', 'login', 'yandex_login', 'username', 'picture', 'avatar', 'avatar_url', 'telegram_username') THEN
    IF kind = 'string' THEN RETURN to_jsonb('anon'::text); END IF;
  ELSIF k IN ('telegram_id', 'telegram_user_id', 'telegram_chat_id', 'chat_id') THEN
    RETURN 'null'::jsonb;
  ELSIF k IN ('comment', 'comments', 'note', 'notes', 'customer_comment', 'order_comment', 'delivery_comment') THEN
    RETURN 'null'::jsonb;
  ELSIF k IN ('ip', 'ip_address', 'client_ip', 'customer_ip', 'remote_ip', 'remote_addr', 'user_agent', 'x_forwarded_for') THEN
    RETURN 'null'::jsonb;
  ELSIF k IN ('address', 'address_1', 'address_2', 'street', 'address_line', 'address_line1', 'address_line2') THEN
    IF kind = 'string' THEN RETURN to_jsonb(pg_temp.tenant_only_fake_address()); END IF;
  ELSIF k IN ('cards', 'card', 'card_number', 'wallets', 'wallet', 'requisites', 'bank_details', 'account_number', 'inn', 'passport', 'snils') THEN
    RETURN CASE kind WHEN 'array' THEN '[]'::jsonb WHEN 'object' THEN '{}'::jsonb WHEN 'string' THEN to_jsonb('redacted'::text) ELSE 'null'::jsonb END;
  ELSIF k = 'payment_receipt' THEN
    RETURN 'null'::jsonb;
  END IF;
  RETURN pg_temp.tenant_only_scrub(v);
END
$fn$;

-- Walks a JSON document and rewrites every key tenant_only_scrub_value knows.
-- Idempotent: a scrubbed document comes back unchanged, which is how the check
-- tells a scrubbed document from one that still holds personal data.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_scrub(j jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE
  result jsonb;
  kv record;
BEGIN
  IF j IS NULL THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(j) = 'object' THEN
    result := '{}'::jsonb;
    FOR kv IN SELECT key, value FROM jsonb_each(j) LOOP
      result := result || jsonb_build_object(kv.key, pg_temp.tenant_only_scrub_value(kv.key, kv.value));
    END LOOP;
    RETURN result;
  ELSIF jsonb_typeof(j) = 'array' THEN
    SELECT coalesce(jsonb_agg(pg_temp.tenant_only_scrub(e) ORDER BY ord), '[]'::jsonb) INTO result
    FROM jsonb_array_elements(j) WITH ORDINALITY AS a(e, ord);
    RETURN result;
  ELSIF jsonb_typeof(j) = 'string' THEN
    RETURN to_jsonb(pg_temp.tenant_only_replace_emails(j #>> '{}'));
  END IF;
  RETURN j;
END
$fn$;

-- The JSON keys tenant_only_scrub_value rewrites, as a cheap prefilter.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_scrub_key_re() RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT '"([a-z_]*_)?(email|phone)"|"(reply_to|whatsapp|tel|mobile|first_name|last_name|middle_name|patronymic|full_name|author|author_name|user_name|recipient_name|customer_name|telegram|login|yandex_login|username|picture|avatar|avatar_url|telegram_username|telegram_id|telegram_user_id|telegram_chat_id|chat_id|comment|comments|note|notes|customer_comment|order_comment|delivery_comment|ip|ip_address|client_ip|customer_ip|remote_ip|remote_addr|user_agent|x_forwarded_for|address|address_1|address_2|street|address_line|address_line1|address_line2|cards|card|card_number|wallets|wallet|requisites|bank_details|account_number|inn|passport|snils|payment_receipt)"\s*:'::text
$$;

-- Text columns that hold a person's data by their name, and what each becomes.
-- `replacement` NULL means cleared (NULL, or '' where the column is NOT NULL).
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_anon_columns()
RETURNS TABLE(tbl text, col text, nullable boolean, replacement text)
LANGUAGE sql STABLE AS $$
  SELECT c.tbl, c.col, c.nullable,
    CASE
      WHEN c.col ~ 'phone' THEN pg_temp.tenant_only_fake_phone()
      WHEN c.col = 'first_name' THEN 'Имя'
      WHEN c.col = 'last_name' THEN 'Фамилия'
      WHEN c.col IN ('author', 'author_name', 'user_name') THEN 'Аноним'
      WHEN c.col IN ('address', 'address_1', 'legal_address', 'return_address') THEN pg_temp.tenant_only_fake_address()
      ELSE NULL
    END
  FROM pg_temp.tenant_only_text_columns() c
  WHERE c.typ IN ('text', 'character varying')
    AND (c.col ~ 'phone'
      OR c.col ~ '_ip$'
      OR c.col IN ('first_name', 'last_name', 'middle_name', 'author', 'author_name', 'user_name',
                   'company', 'company_name', 'address_name', 'avatar_url',
                   'address', 'address_1', 'address_2', 'legal_address', 'return_address',
                   'note', 'notes', 'internal_note', 'comment', 'comments', 'customer_note',
                   'ip', 'ip_address', 'user_agent',
                   'telegram_chat_id', 'telegram_chat_title', 'link_code',
                   'email_last_error', 'telegram_last_error'))
$$;

-- Personal data and secrets out of the whole database, every tenant left in it.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_anonymize()
RETURNS TABLE(step text, affected bigint)
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE
  r record;
  n bigint;
  total bigint;
  start_n bigint;
  email_re text := pg_temp.tenant_only_email_re();
BEGIN
  DROP TABLE IF EXISTS pg_temp.tok_anon_email, pg_temp.tok_anon_original_email, pg_temp.tok_anon_original_phone,
    pg_temp.tok_anon_seen;

  -- Originals, so the check can prove none of them is left anywhere.
  CREATE TEMP TABLE tok_anon_seen ON COMMIT DROP AS SELECT DISTINCT e.email FROM pg_temp.tenant_only_emails() e;
  CREATE TEMP TABLE tok_anon_original_email ON COMMIT DROP AS
    SELECT e.email FROM tok_anon_seen e WHERE NOT pg_temp.tenant_only_is_fake_email(e.email);
  CREATE TEMP TABLE tok_anon_original_phone (digits text PRIMARY KEY) ON COMMIT DROP;
  FOR r IN SELECT * FROM pg_temp.tenant_only_anon_columns() a WHERE a.col ~ 'phone' LOOP
    EXECUTE format(
      'INSERT INTO tok_anon_original_phone
         SELECT DISTINCT right(regexp_replace(%I, ''\D'', '''', ''g''), 10) FROM public.%I
          WHERE length(regexp_replace(coalesce(%I, ''''), ''\D'', '''', ''g'')) >= 10
       ON CONFLICT DO NOTHING', r.col, r.tbl, r.col);
  END LOOP;
  FOR r IN SELECT * FROM pg_temp.tenant_only_text_columns() c WHERE c.typ IN ('json', 'jsonb') LOOP
    EXECUTE format(
      'INSERT INTO tok_anon_original_phone
         SELECT DISTINCT right(regexp_replace(m[1], ''\D'', '''', ''g''), 10)
           FROM (SELECT regexp_matches(%I::text, ''"(?:[a-z_]*_)?(?:phone|whatsapp)"\s*:\s*"([^"]*)"'', ''gi'') AS m
                   FROM public.%I WHERE %I::text ~* ''phone|whatsapp'') s
          WHERE length(regexp_replace(m[1], ''\D'', '''', ''g'')) >= 10
       ON CONFLICT DO NOTHING', r.col, r.tbl, r.col);
  END LOOP;
  DELETE FROM tok_anon_original_phone WHERE digits = right(regexp_replace(pg_temp.tenant_only_fake_phone(), '\D', '', 'g'), 10);

  -- Stand-ins: staff (shop admins, platform users, invites) first, then
  -- everyone else in the order they became customers. Numbering continues past
  -- any stand-in already in the database, so a second run never collides.
  CREATE TEMP TABLE tok_anon_email (email text PRIMARY KEY, fake text NOT NULL) ON COMMIT DROP;
  SELECT coalesce(max((regexp_match(e.email, '^(?:staff|buyer)-([0-9]+)@example\.invalid$'))[1]::bigint), 0)
    INTO start_n FROM tok_anon_seen e;
  INSERT INTO tok_anon_email
    SELECT s.email, 'staff-' || (start_n + row_number() OVER (ORDER BY s.first_seen, s.email)) || '@example.invalid'
    FROM (
      SELECT pg_temp.tenant_only_norm_email(x.email) AS email, min(x.created_at) AS first_seen
      FROM (
        SELECT ta.email, ta.created_at FROM tenant_admin ta
        UNION ALL SELECT u.email, u.created_at FROM "user" u
        UNION ALL SELECT i.email, i.created_at FROM invite i
      ) x
      WHERE x.email IS NOT NULL AND x.email LIKE '%@%' AND NOT pg_temp.tenant_only_is_fake_email(x.email)
      GROUP BY 1
    ) s;
  SELECT coalesce(max((regexp_match(fake, '-([0-9]+)@'))[1]::bigint), start_n) INTO start_n FROM tok_anon_email;
  INSERT INTO tok_anon_email
    SELECT s.email, 'buyer-' || (start_n + row_number() OVER (ORDER BY s.first_seen NULLS LAST, s.email)) || '@example.invalid'
    FROM (
      SELECT o.email, min(cu.created_at) AS first_seen
      FROM tok_anon_original_email o
      LEFT JOIN customer cu ON pg_temp.tenant_only_norm_email(cu.email) = o.email
      WHERE NOT EXISTS (SELECT 1 FROM tok_anon_email m WHERE m.email = o.email)
      GROUP BY o.email
    ) s;

  -- Logs and secrets go whole: the notification log, workflow payloads,
  -- one-time tokens, MFA, invites, shop integration secrets, secret API keys.
  RETURN QUERY SELECT * FROM pg_temp.tenant_only_steps(ARRAY[
    ['delete notification', 'notification', 'DELETE FROM notification'],
    ['delete workflow_execution', 'workflow_execution', 'DELETE FROM workflow_execution'],
    ['delete auth_password_reset_token', 'auth_password_reset_token', 'DELETE FROM auth_password_reset_token'],
    ['delete auth_mfa_recovery_code', 'auth_mfa_recovery_code', 'DELETE FROM auth_mfa_recovery_code'],
    ['delete auth_mfa_factor', 'auth_mfa_factor', 'DELETE FROM auth_mfa_factor'],
    ['delete auth_verification', 'auth_verification', 'DELETE FROM auth_verification'],
    ['delete invite_rbac_role', 'invite_rbac_role', 'DELETE FROM invite_rbac_role'],
    ['delete invite', 'invite', 'DELETE FROM invite'],
    ['delete tenant_integration_secret', 'tenant_integration_secret', 'DELETE FROM tenant_integration_secret'],
    ['delete integration', 'integration', 'DELETE FROM integration'],
    ['delete publishable key links of secret API keys', 'publishable_api_key_sales_channel,api_key', $q$
      DELETE FROM publishable_api_key_sales_channel WHERE publishable_key_id IN (SELECT id FROM api_key WHERE type <> 'publishable')$q$],
    ['delete secret API keys (publishable keys are public and stay)', 'api_key', $q$
      DELETE FROM api_key WHERE type <> 'publishable'$q$],
    ['delete passwords and provider profiles from provider_identity', 'provider_identity', $q$
      UPDATE provider_identity SET provider_metadata = NULL, user_metadata = NULL
      WHERE provider_metadata IS NOT NULL OR user_metadata IS NOT NULL$q$],
    ['replace external account ids of non-email providers', 'provider_identity', $q$
      UPDATE provider_identity p SET entity_id = p.provider || '-' || x.n
      FROM (SELECT id, row_number() OVER (PARTITION BY provider ORDER BY created_at, id) AS n
              FROM provider_identity WHERE entity_id NOT LIKE '%@%') x
      WHERE x.id = p.id AND p.entity_id NOT LIKE '%@%' AND p.entity_id !~ ('^' || p.provider || '-[0-9]+$')$q$],
    ['clear the telegram link of shop notifications', 'tenant_notification_settings.link_code_expires_at', $q$
      UPDATE tenant_notification_settings SET link_code_expires_at = NULL, telegram_linked_at = NULL
      WHERE link_code_expires_at IS NOT NULL OR telegram_linked_at IS NOT NULL$q$],
    ['replace shop legal requisites with a stub', 'tenant_requisites', $q$
      UPDATE tenant_requisites SET legal_name = 'ИП Тестовый Т. Т.', inn = '000000000000', ogrn = '000000000000000',
        email = 'shop@example.invalid', dpo_email = 'dpo@example.invalid', bank_details = NULL,
        rkn_reg_number = NULL, newsletter_management_url = NULL$q$]
  ]);

  -- E-mail addresses in every text and JSON column, by the map above.
  total := 0;
  FOR r IN SELECT * FROM pg_temp.tenant_only_text_columns() LOOP
    EXECUTE format(
      'UPDATE public.%I SET %I = pg_temp.tenant_only_replace_emails(%I::text)::%s
        WHERE (%I::text LIKE ''%%@%%'' OR %I::text ILIKE ''%%\%%40%%'')
          AND pg_temp.tenant_only_replace_emails(%I::text) IS DISTINCT FROM %I::text',
      r.tbl, r.col, r.col, CASE r.typ WHEN 'character varying' THEN 'text' ELSE r.typ END,
      r.col, r.col, r.col, r.col);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
  END LOOP;
  step := 'replace e-mail addresses with buyer-<n>/staff-<n>@example.invalid';
  affected := total;
  RETURN NEXT;

  -- Columns named for a person's data: phones, names, street addresses, notes,
  -- IP addresses, Telegram chats.
  total := 0;
  FOR r IN SELECT * FROM pg_temp.tenant_only_anon_columns() LOOP
    EXECUTE format('UPDATE public.%I SET %I = %L WHERE %I IS DISTINCT FROM %L AND NOT (%L::text IS NULL AND %I = '''')',
      r.tbl, r.col,
      coalesce(r.replacement, CASE WHEN r.nullable THEN NULL ELSE '' END),
      r.col, coalesce(r.replacement, CASE WHEN r.nullable THEN NULL ELSE '' END),
      r.replacement, r.col);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
  END LOOP;
  step := 'replace phones, names, street addresses, notes, IPs in named columns';
  affected := total;
  RETURN NEXT;

  -- Keys of JSON documents that hold a person's data (cart and order contact,
  -- customer logins, payment session customer, shop payment contacts).
  total := 0;
  FOR r IN SELECT * FROM pg_temp.tenant_only_text_columns() c WHERE c.typ IN ('json', 'jsonb') LOOP
    EXECUTE format(
      'UPDATE public.%I SET %I = pg_temp.tenant_only_scrub(%I::jsonb)::%s
        WHERE %I::text ~* %L AND pg_temp.tenant_only_scrub(%I::jsonb) IS DISTINCT FROM %I::jsonb',
      r.tbl, r.col, r.col, r.typ, r.col, pg_temp.tenant_only_scrub_key_re(), r.col, r.col);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
  END LOOP;
  step := 'scrub personal keys inside JSON documents';
  affected := total;
  RETURN NEXT;

  -- Raw marketplace payloads (Wildberries, Ozon) carry buyer names and
  -- delivery details nobody on a stand needs.
  total := 0;
  FOR r IN SELECT * FROM pg_temp.tenant_only_text_columns() c WHERE c.col = 'raw' AND c.typ IN ('json', 'jsonb') LOOP
    EXECUTE format('UPDATE public.%I SET %I = ''{}''::%s WHERE %I::text <> ''{}''', r.tbl, r.col, r.typ, r.col);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
  END LOOP;
  step := 'empty raw marketplace payloads';
  affected := total;
  RETURN NEXT;
END
$fn$;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- Logical references the database does not enforce (module links and
-- cross-module ids), by the column name convention Medusa uses.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_ref_target(col text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE col
    WHEN 'tenant_id' THEN 'tenant'
    WHEN 'api_key_id' THEN 'api_key'
    WHEN 'publishable_key_id' THEN 'api_key'
    WHEN 'order_id' THEN 'order'
    WHEN 'product_id' THEN 'product'
    WHEN 'product_category_id' THEN 'product_category'
    WHEN 'campaign_id' THEN 'promotion_campaign'
    WHEN 'promotion_id' THEN 'promotion'
    WHEN 'sales_channel_id' THEN 'sales_channel'
    WHEN 'cart_id' THEN 'cart'
    WHEN 'payment_collection_id' THEN 'payment_collection'
    WHEN 'customer_id' THEN 'customer'
    WHEN 'account_holder_id' THEN 'account_holder'
    WHEN 'stock_location_id' THEN 'stock_location'
    WHEN 'fulfillment_provider_id' THEN 'fulfillment_provider'
    WHEN 'fulfillment_set_id' THEN 'fulfillment_set'
    WHEN 'fulfillment_id' THEN 'fulfillment'
    WHEN 'shipping_profile_id' THEN 'shipping_profile'
    WHEN 'variant_id' THEN 'product_variant'
    WHEN 'inventory_item_id' THEN 'inventory_item'
    WHEN 'price_set_id' THEN 'price_set'
    WHEN 'region_id' THEN 'region'
    WHEN 'payment_provider_id' THEN 'payment_provider'
    WHEN 'return_id' THEN 'return'
    WHEN 'shipping_option_id' THEN 'shipping_option'
    WHEN 'user_id' THEN 'user'
    WHEN 'invite_id' THEN 'invite'
    WHEN 'rbac_role_id' THEN 'rbac_role'
  END
$$;

-- Read-only. Every row is (check, severity, findings): severity "fail" fails
-- the run, "warn" is for the operator to read, "info" is context.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_verify_tenant(keep_handle text)
RETURNS TABLE(check_name text, severity text, findings bigint)
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE
  k text;
  r record;
  n bigint;
  tables_checked int := 0;
  hosts text[];
  ids text[];
BEGIN
  SELECT t.id INTO k FROM tenant t WHERE t.handle = keep_handle;
  IF k IS NULL THEN
    check_name := format('tenant "%s" exists', keep_handle); severity := 'fail'; findings := 1; RETURN NEXT;
    RETURN;
  END IF;

  check_name := 'tenant rows other than the kept one'; severity := 'fail';
  SELECT count(*) INTO findings FROM tenant WHERE id <> k; RETURN NEXT;

  -- Every table with tenant_id.
  FOR r IN SELECT t AS tbl FROM pg_temp.tenant_only_tenant_tables() t LOOP
    tables_checked := tables_checked + 1;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id IS DISTINCT FROM $1', r.tbl) INTO n USING k;
    IF n > 0 THEN
      check_name := format('%s rows of another tenant', r.tbl); severity := 'fail'; findings := n; RETURN NEXT;
    END IF;
  END LOOP;
  check_name := format('tables with tenant_id checked: %s', tables_checked); severity := 'info'; findings := 0; RETURN NEXT;

  -- Any other tenant's id written anywhere: JSON metadata, payloads, logs.
  FOR r IN SELECT * FROM pg_temp.tenant_only_scan(pg_temp.tenant_only_tenant_id_re(), k, '%ten\_%') LOOP
    check_name := format('%s.%s mentions another tenant id', r.tbl, r.col); severity := 'fail'; findings := r.n; RETURN NEXT;
  END LOOP;

  -- Module link tables: both ends must exist.
  IF pg_temp.tenant_only_has('link_module_migrations') THEN
    FOR r IN
      SELECT lm.table_name::text AS tbl, c.column_name::text AS col, pg_temp.tenant_only_ref_target(c.column_name::text) AS target
      FROM link_module_migrations lm
      JOIN information_schema.columns c ON c.table_schema = 'public' AND c.table_name = lm.table_name
      WHERE c.column_name LIKE '%\_id' AND pg_temp.tenant_only_has(lm.table_name)
    LOOP
      IF r.target IS NULL OR NOT pg_temp.tenant_only_has(r.target || '.id') THEN
        CONTINUE;
      END IF;
      EXECUTE format('SELECT count(*) FROM public.%I l WHERE l.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.%I x WHERE x.id = l.%I)',
        r.tbl, r.col, r.target, r.col) INTO n;
      IF n > 0 THEN
        check_name := format('link %s.%s points at a missing %s', r.tbl, r.col, r.target); severity := 'fail'; findings := n; RETURN NEXT;
      END IF;
    END LOOP;
  END IF;

  -- References a module keeps by id without a foreign key, plus the rows of the
  -- kept tenant that name a product, customer, order or course.
  FOR r IN
    SELECT * FROM (VALUES
      ('cart', 'customer_id', 'customer', 'fail'),
      ('cart', 'region_id', 'region', 'fail'),
      ('cart', 'sales_channel_id', 'sales_channel', 'fail'),
      ('order', 'customer_id', 'customer', 'fail'),
      ('order', 'region_id', 'region', 'fail'),
      ('order', 'sales_channel_id', 'sales_channel', 'fail'),
      ('order_change_action', 'order_id', 'order', 'fail'),
      ('return', 'order_id', 'order', 'fail'),
      ('order_claim', 'order_id', 'order', 'fail'),
      ('order_exchange', 'order_id', 'order', 'fail'),
      ('inventory_level', 'location_id', 'stock_location', 'fail'),
      ('reservation_item', 'location_id', 'stock_location', 'fail'),
      ('fulfillment', 'location_id', 'stock_location', 'fail'),
      ('store', 'default_sales_channel_id', 'sales_channel', 'fail'),
      ('store', 'default_location_id', 'stock_location', 'fail'),
      ('store', 'default_region_id', 'region', 'fail'),
      ('cart_line_item', 'variant_id', 'product_variant', 'info'),
      ('cart_line_item', 'product_id', 'product', 'info'),
      ('order_line_item', 'variant_id', 'product_variant', 'info'),
      ('order_line_item', 'product_id', 'product', 'info'),
      ('cart_shipping_method', 'shipping_option_id', 'shipping_option', 'info'),
      ('order_shipping_method', 'shipping_option_id', 'shipping_option', 'info')
    ) AS v(tbl, col, target, sev)
    UNION ALL
    SELECT t, m.col, m.target, 'fail'
    FROM pg_temp.tenant_only_tenant_tables() t
    CROSS JOIN (VALUES ('product_id', 'product'), ('variant_id', 'product_variant'), ('customer_id', 'customer'),
                       ('order_id', 'order'), ('cart_id', 'cart'), ('course_id', 'course')) AS m(col, target)
    WHERE pg_temp.tenant_only_has(t || '.' || m.col)
  LOOP
    IF NOT pg_temp.tenant_only_has(r.tbl || '.' || r.col) OR NOT pg_temp.tenant_only_has(r.target || '.id') THEN
      CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I l WHERE l.%I IS NOT NULL AND l.%I::text LIKE (SELECT coalesce(split_part(min(x.id), ''_'', 1), '''') || ''\_%%'' FROM public.%I x) AND NOT EXISTS (SELECT 1 FROM public.%I x WHERE x.id = l.%I::text)',
      r.tbl, r.col, r.col, r.target, r.target, r.col) INTO n;
    IF n > 0 THEN
      check_name := format('%s.%s points at a missing %s%s', r.tbl, r.col, r.target,
        CASE WHEN r.sev = 'info' THEN ' (order history snapshot, Medusa keeps these)' ELSE '' END);
      severity := r.sev; findings := n; RETURN NEXT;
    END IF;
  END LOOP;

  -- Commerce outside the kept tenant.
  check_name := 'carts outside the kept channels'; severity := 'fail';
  SELECT count(*) INTO findings FROM cart c
  WHERE NOT EXISTS (SELECT 1 FROM tenant_tenant_sales_channel_sales_channel l
                    WHERE l.tenant_id = k AND l.sales_channel_id = c.sales_channel_id)
    AND NOT EXISTS (SELECT 1 FROM order_cart oc JOIN "order" o ON o.id = oc.order_id
                    JOIN tenant_tenant_order_order l ON l.order_id = o.id AND l.tenant_id = k WHERE oc.cart_id = c.id);
  RETURN NEXT;

  check_name := 'orders outside the kept channels and not linked to the kept tenant'; severity := 'fail';
  SELECT count(*) INTO findings FROM "order" o
  WHERE NOT EXISTS (SELECT 1 FROM tenant_tenant_sales_channel_sales_channel l
                    WHERE l.tenant_id = k AND l.sales_channel_id = o.sales_channel_id)
    AND NOT EXISTS (SELECT 1 FROM tenant_tenant_order_order l WHERE l.order_id = o.id AND l.tenant_id = k);
  RETURN NEXT;

  check_name := 'products not sold in a kept channel'; severity := 'fail';
  SELECT count(*) INTO findings FROM product p
  WHERE NOT EXISTS (SELECT 1 FROM product_sales_channel ps
                    JOIN tenant_tenant_sales_channel_sales_channel l ON l.sales_channel_id = ps.sales_channel_id AND l.tenant_id = k
                    WHERE ps.product_id = p.id AND ps.deleted_at IS NULL);
  RETURN NEXT;

  check_name := 'customers with no order, cart or account at the kept tenant'; severity := 'fail';
  SELECT count(*) INTO findings FROM customer cu
  WHERE coalesce(cu.metadata->>'tenant_id', '') <> k
    AND NOT EXISTS (SELECT 1 FROM "order" o WHERE o.customer_id = cu.id)
    AND NOT EXISTS (SELECT 1 FROM cart c WHERE c.customer_id = cu.id);
  RETURN NEXT;

  check_name := 'payment collections without a cart or order'; severity := 'fail';
  SELECT count(*) INTO findings FROM payment_collection pc
  WHERE NOT EXISTS (SELECT 1 FROM cart_payment_collection l WHERE l.payment_collection_id = pc.id)
    AND NOT EXISTS (SELECT 1 FROM order_payment_collection l WHERE l.payment_collection_id = pc.id);
  RETURN NEXT;

  check_name := 'fulfillments without an order or return'; severity := 'fail';
  SELECT count(*) INTO findings FROM fulfillment f
  WHERE NOT EXISTS (SELECT 1 FROM order_fulfillment l WHERE l.fulfillment_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM return_fulfillment l WHERE l.fulfillment_id = f.id);
  RETURN NEXT;

  check_name := 'cart and order addresses no cart or order uses'; severity := 'fail';
  SELECT (SELECT count(*) FROM cart_address a
           WHERE NOT EXISTS (SELECT 1 FROM cart c WHERE c.shipping_address_id = a.id)
             AND NOT EXISTS (SELECT 1 FROM cart c WHERE c.billing_address_id = a.id))
       + (SELECT count(*) FROM order_address a
           WHERE NOT EXISTS (SELECT 1 FROM "order" o WHERE o.shipping_address_id = a.id)
             AND NOT EXISTS (SELECT 1 FROM "order" o WHERE o.billing_address_id = a.id))
    INTO findings;
  RETURN NEXT;

  check_name := 'notifications not about a kept order or customer'; severity := 'fail';
  SELECT count(*) INTO findings FROM notification nt
  WHERE NOT coalesce(
    (nt.resource_type = 'order' AND EXISTS (SELECT 1 FROM "order" o WHERE o.id = nt.resource_id))
    OR (nt.resource_type = 'customer' AND EXISTS (SELECT 1 FROM customer c
          WHERE c.id = nt.resource_id OR lower(c.email) = lower(nt.resource_id))),
    false);
  RETURN NEXT;

  check_name := 'auth identities naming a missing customer, shop admin or user'; severity := 'fail';
  SELECT count(*) INTO findings FROM auth_identity ai
  WHERE (ai.app_metadata ? 'customer_id' AND NOT EXISTS (SELECT 1 FROM customer c WHERE c.id = ai.app_metadata->>'customer_id'))
     OR (ai.app_metadata ? 'tenant_id' AND NOT EXISTS (SELECT 1 FROM tenant_admin ta WHERE ta.id = ai.app_metadata->>'tenant_id' AND ta.tenant_id = k))
     OR (ai.app_metadata ? 'user_id' AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = ai.app_metadata->>'user_id'));
  RETURN NEXT;

  check_name := 'auth identities with no actor at all'; severity := 'fail';
  SELECT count(*) INTO findings FROM auth_identity ai
  WHERE NOT (coalesce(ai.app_metadata, '{}'::jsonb) ?| ARRAY['customer_id', 'tenant_id', 'user_id']);
  RETURN NEXT;

  IF pg_temp.tenant_only_has('translation') THEN
    n := 0;
    FOR r IN SELECT DISTINCT t.reference FROM translation t LOOP
      IF pg_temp.tenant_only_has(r.reference || '.id') THEN
        EXECUTE format('SELECT %s + count(*) FROM translation t WHERE t.reference = %L AND NOT EXISTS (SELECT 1 FROM public.%I x WHERE x.id = t.reference_id)',
          n, r.reference, r.reference) INTO n;
      END IF;
    END LOOP;
    check_name := 'translations of missing rows'; severity := 'fail'; findings := n; RETURN NEXT;
  END IF;

  check_name := 'tenant groups'; severity := 'fail';
  SELECT count(*) INTO findings FROM tenant_group;
  RETURN NEXT;

  -- Context for the operator.
  check_name := 'sales channels the kept tenant does not own (platform channels, emptied)'; severity := 'info';
  SELECT count(*) INTO findings FROM sales_channel sc
  WHERE NOT EXISTS (SELECT 1 FROM tenant_tenant_sales_channel_sales_channel l WHERE l.sales_channel_id = sc.id AND l.tenant_id = k);
  RETURN NEXT;

  -- Only inside the transaction that ran the trim: the exact list of the
  -- removed tenants' people and host names.
  IF to_regclass('pg_temp.tok_foreign_email') IS NOT NULL THEN
    DROP TABLE IF EXISTS pg_temp.tok_emails_now;
    CREATE TEMP TABLE tok_emails_now ON COMMIT DROP AS SELECT DISTINCT e.email FROM pg_temp.tenant_only_emails() e;
    check_name := 'buyer e-mails of removed tenants, before the trim'; severity := 'info';
    SELECT count(*) INTO findings FROM tok_foreign_email WHERE kind = 'buyer'; RETURN NEXT;
    check_name := 'buyer e-mails of removed tenants still in the database'; severity := 'fail';
    SELECT count(DISTINCT f.email) INTO findings FROM tok_foreign_email f
    JOIN tok_emails_now e ON e.email = f.email WHERE f.kind = 'buyer';
    RETURN NEXT;
    check_name := 'staff e-mails of removed tenants still in the database'; severity := 'fail';
    SELECT count(DISTINCT f.email) INTO findings FROM tok_foreign_email f
    JOIN tok_emails_now e ON e.email = f.email WHERE f.kind = 'staff';
    RETURN NEXT;

    -- Ids of what the trim removed with the other tenants (their sales
    -- channels, publishable keys and warehouses), written anywhere: a platform
    -- promotion rule, a price rule, a metadata field.
    SELECT array_agg('%' || x.id || '%') INTO ids FROM (
      SELECT id FROM tok_channel_drop UNION SELECT id FROM tok_apikey_drop UNION SELECT id FROM tok_location_drop
    ) x;
    IF ids IS NOT NULL THEN
      FOR r IN SELECT * FROM pg_temp.tenant_only_text_columns() LOOP
        EXECUTE format('SELECT count(*) FROM public.%I WHERE %I::text LIKE ANY ($1)', r.tbl, r.col) INTO n USING ids;
        IF n > 0 THEN
          check_name := format('%s.%s mentions a removed sales channel, key or warehouse', r.tbl, r.col);
          severity := 'fail'; findings := n; RETURN NEXT;
        END IF;
      END LOOP;
    END IF;
  END IF;
  IF to_regclass('pg_temp.tok_foreign_host') IS NOT NULL THEN
    SELECT array_agg('%' || host || '%') INTO hosts FROM tok_foreign_host;
    IF hosts IS NOT NULL THEN
      FOR r IN SELECT * FROM pg_temp.tenant_only_text_columns() LOOP
        EXECUTE format('SELECT count(*) FROM public.%I WHERE lower(%I::text) LIKE ANY ($1)', r.tbl, r.col) INTO n USING hosts;
        IF n > 0 THEN
          check_name := format('%s.%s mentions a host of a removed tenant (content of the kept shop, read it)', r.tbl, r.col);
          severity := 'warn'; findings := n; RETURN NEXT;
        END IF;
      END LOOP;
    END IF;
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.tenant_only_verify_anonymized()
RETURNS TABLE(check_name text, severity text, findings bigint)
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE
  r record;
  n bigint;
BEGIN
  DROP TABLE IF EXISTS pg_temp.tok_anon_check_emails;
  CREATE TEMP TABLE tok_anon_check_emails ON COMMIT DROP AS SELECT * FROM pg_temp.tenant_only_emails();

  -- Real addresses anywhere.
  FOR r IN
    SELECT e.tbl, e.col, count(*) AS n FROM tok_anon_check_emails e
    WHERE NOT pg_temp.tenant_only_is_fake_email(e.email)
    GROUP BY 1, 2
  LOOP
    check_name := format('%s.%s holds a real e-mail address', r.tbl, r.col); severity := 'fail'; findings := r.n; RETURN NEXT;
  END LOOP;
  check_name := 'distinct e-mail addresses left (all @example.invalid)'; severity := 'info';
  SELECT count(DISTINCT e.email) INTO findings FROM tok_anon_check_emails e; RETURN NEXT;

  -- IPv4 addresses anywhere.
  FOR r IN SELECT * FROM pg_temp.tenant_only_scan('(^|[^0-9.])(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])){3}([^0-9.]|$)', NULL, '%.%.%.%') LOOP
    check_name := format('%s.%s holds an IPv4 address', r.tbl, r.col); severity := 'fail'; findings := r.n; RETURN NEXT;
  END LOOP;

  -- Named columns.
  FOR r IN SELECT * FROM pg_temp.tenant_only_anon_columns() LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I IS DISTINCT FROM %L AND NOT (%L::text IS NULL AND %I = '''')',
      r.tbl, r.col, r.replacement, r.replacement, r.col) INTO n;
    IF n > 0 THEN
      check_name := format('%s.%s still holds personal data', r.tbl, r.col); severity := 'fail'; findings := n; RETURN NEXT;
    END IF;
  END LOOP;

  -- JSON documents.
  FOR r IN SELECT * FROM pg_temp.tenant_only_text_columns() c WHERE c.typ IN ('json', 'jsonb') LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I::text ~* %L AND pg_temp.tenant_only_scrub(%I::jsonb) IS DISTINCT FROM %I::jsonb',
      r.tbl, r.col, pg_temp.tenant_only_scrub_key_re(), r.col, r.col) INTO n;
    IF n > 0 THEN
      check_name := format('%s.%s has personal keys inside JSON', r.tbl, r.col); severity := 'fail'; findings := n; RETURN NEXT;
    END IF;
  END LOOP;

  FOR r IN SELECT * FROM pg_temp.tenant_only_text_columns() c WHERE c.col = 'raw' AND c.typ IN ('json', 'jsonb') LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I::text <> ''{}''', r.tbl, r.col) INTO n;
    IF n > 0 THEN
      check_name := format('%s.raw keeps a marketplace payload', r.tbl); severity := 'fail'; findings := n; RETURN NEXT;
    END IF;
  END LOOP;

  -- Passwords, tokens and secrets.
  FOR r IN
    SELECT * FROM (VALUES
      ('passwords and provider profiles in provider_identity', 'provider_identity', 'provider_metadata IS NOT NULL OR user_metadata IS NOT NULL'),
      ('password reset tokens', 'auth_password_reset_token', 'true'),
      ('MFA factors', 'auth_mfa_factor', 'true'),
      ('MFA recovery codes', 'auth_mfa_recovery_code', 'true'),
      ('verification codes', 'auth_verification', 'true'),
      ('invites', 'invite', 'true'),
      ('shop integration secrets', 'tenant_integration_secret', 'true'),
      ('integrations', 'integration', 'true'),
      ('secret API keys', 'api_key', 'type <> ''publishable'''),
      ('notifications', 'notification', 'true'),
      ('workflow executions', 'workflow_execution', 'true'),
      ('telegram link codes', 'tenant_notification_settings', 'link_code IS NOT NULL OR telegram_chat_id IS NOT NULL'),
      ('shop requisites not replaced by the stub', 'tenant_requisites', 'legal_name IS DISTINCT FROM ''ИП Тестовый Т. Т.'' OR inn IS DISTINCT FROM ''000000000000'' OR bank_details IS NOT NULL')
    ) AS v(label, tbl, cond)
  LOOP
    IF NOT pg_temp.tenant_only_has(r.tbl) THEN
      CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %s', r.tbl, r.cond) INTO n;
    check_name := r.label; severity := 'fail'; findings := n; RETURN NEXT;
  END LOOP;

  -- Only inside the transaction that ran the anonymizer: none of the original
  -- addresses and phone numbers is left anywhere.
  IF to_regclass('pg_temp.tok_anon_original_email') IS NOT NULL THEN
    check_name := 'original e-mail addresses, before anonymizing'; severity := 'info';
    SELECT count(*) INTO findings FROM tok_anon_original_email; RETURN NEXT;
    check_name := 'original e-mail addresses still in the database'; severity := 'fail';
    SELECT count(DISTINCT o.email) INTO findings FROM tok_anon_original_email o
    JOIN tok_anon_check_emails e ON e.email = o.email;
    RETURN NEXT;
  END IF;
  IF to_regclass('pg_temp.tok_anon_original_phone') IS NOT NULL THEN
    check_name := 'original phone numbers, before anonymizing'; severity := 'info';
    SELECT count(*) INTO findings FROM tok_anon_original_phone; RETURN NEXT;
    n := 0;
    FOR r IN SELECT * FROM pg_temp.tenant_only_text_columns() LOOP
      EXECUTE format(
        'SELECT %s + count(DISTINCT p.digits)
           FROM (SELECT right(regexp_replace(m[1], ''\D'', '''', ''g''), 10) AS digits
                   FROM (SELECT regexp_matches(%I::text, ''(\+?[0-9][0-9 ()\-]{8,}[0-9])'', ''g'') AS m
                           FROM public.%I WHERE %I::text ~ ''[0-9]{3}'') s) f
           JOIN tok_anon_original_phone p ON p.digits = f.digits',
        n, r.col, r.tbl, r.col) INTO n;
    END LOOP;
    check_name := 'original phone numbers still in the database'; severity := 'fail'; findings := n; RETURN NEXT;
  END IF;
END
$fn$;

-- ---------------------------------------------------------------------------
-- Entry points
-- ---------------------------------------------------------------------------

-- The checks a run or a --verify asks for, kept in tok_checks for the assert.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_check(keep_handle text, anonymize boolean)
RETURNS TABLE(check_name text, severity text, findings bigint)
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
BEGIN
  IF keep_handle IS NULL AND NOT coalesce(anonymize, false) THEN
    RAISE EXCEPTION 'tenant-only: nothing to verify; name a tenant to keep, ask for anonymization, or both' USING ERRCODE = 'UT003';
  END IF;
  DROP TABLE IF EXISTS pg_temp.tok_checks;
  CREATE TEMP TABLE tok_checks (ord serial, check_name text, severity text, findings bigint) ON COMMIT DROP;
  IF keep_handle IS NOT NULL THEN
    INSERT INTO tok_checks (check_name, severity, findings) SELECT * FROM pg_temp.tenant_only_verify_tenant(keep_handle);
  END IF;
  IF coalesce(anonymize, false) THEN
    INSERT INTO tok_checks (check_name, severity, findings) SELECT * FROM pg_temp.tenant_only_verify_anonymized();
  END IF;
  RETURN QUERY SELECT c.check_name, c.severity, c.findings FROM tok_checks c ORDER BY c.ord;
END
$fn$;

-- Raises UT002 when the last check in this transaction found anything that
-- fails. psql drivers call it right after the run, so a dirty result never
-- reaches COMMIT.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_assert_clean() RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE
  failed bigint;
  r record;
BEGIN
  IF to_regclass('pg_temp.tok_checks') IS NULL THEN
    RAISE EXCEPTION 'tenant-only: no check ran in this transaction' USING ERRCODE = 'UT002';
  END IF;
  SELECT count(*) INTO failed FROM tok_checks WHERE severity = 'fail' AND findings > 0;
  IF failed > 0 THEN
    FOR r IN SELECT * FROM tok_checks WHERE severity = 'fail' AND findings > 0 ORDER BY ord LOOP
      RAISE WARNING 'tenant-only FAIL: % = %', r.check_name, r.findings;
    END LOOP;
    RAISE EXCEPTION 'tenant-only verify: % check(s) failed, nothing may be committed or dumped', failed USING ERRCODE = 'UT002';
  END IF;
END
$fn$;

-- One run: guard, counts before, trim and/or anonymize, checks, counts after.
-- Returns every number; the caller decides COMMIT, ROLLBACK (--dry-run), or
-- calls tenant_only_assert_clean() first.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_run(keep_handle text, anonymize boolean, protected_dbs text[])
RETURNS TABLE(section text, name text, detail text, before_n bigint, after_n bigint)
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
BEGIN
  PERFORM pg_temp.tenant_only_guard(protected_dbs);
  IF keep_handle IS NULL AND NOT coalesce(anonymize, false) THEN
    RAISE EXCEPTION 'tenant-only: nothing to do; name a tenant to keep, ask for anonymization, or both' USING ERRCODE = 'UT003';
  END IF;

  DROP TABLE IF EXISTS pg_temp.tok_counts_before, pg_temp.tok_steps;
  CREATE TEMP TABLE tok_counts_before ON COMMIT DROP AS SELECT * FROM pg_temp.tenant_only_table_counts();
  CREATE TEMP TABLE tok_steps (ord serial, step text, affected bigint) ON COMMIT DROP;
  IF keep_handle IS NOT NULL THEN
    INSERT INTO tok_steps (step, affected) SELECT * FROM pg_temp.tenant_only_trim(keep_handle);
  END IF;
  IF coalesce(anonymize, false) THEN
    INSERT INTO tok_steps (step, affected) SELECT * FROM pg_temp.tenant_only_anonymize();
  END IF;
  PERFORM * FROM pg_temp.tenant_only_check(keep_handle, anonymize);

  RETURN QUERY
    SELECT 'table'::text, b.tbl, NULL::text, b.n, a.n
    FROM tok_counts_before b JOIN pg_temp.tenant_only_table_counts() a ON a.tbl = b.tbl
    WHERE b.n > 0 OR a.n > 0
    ORDER BY b.tbl;
  RETURN QUERY SELECT 'step'::text, s.step, NULL::text, NULL::bigint, s.affected FROM tok_steps s ORDER BY s.ord;
  RETURN QUERY SELECT 'check'::text, c.check_name, c.severity, NULL::bigint, c.findings FROM tok_checks c ORDER BY c.ord;
END
$fn$;

-- Distinct /static/ prefixes (first two path segments) referenced anywhere,
-- and whether each sits under the kept tenant's own upload directory. The
-- dump script writes this next to the media list so files outside
-- static/tenants/<id>/ are not forgotten.
CREATE OR REPLACE FUNCTION pg_temp.tenant_only_media_refs(keep_handle text)
RETURNS TABLE(prefix text, own boolean, rows_n bigint)
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE
  k text;
  r record;
BEGIN
  SELECT t.id INTO k FROM tenant t WHERE t.handle = keep_handle;
  DROP TABLE IF EXISTS pg_temp.tok_media;
  CREATE TEMP TABLE tok_media (prefix text) ON COMMIT DROP;
  FOR r IN SELECT * FROM pg_temp.tenant_only_text_columns() LOOP
    EXECUTE format(
      'INSERT INTO tok_media SELECT m[1] FROM (SELECT regexp_matches(%I::text, ''(/static/[A-Za-z0-9._~%%-]+/[A-Za-z0-9._~%%-]+)'', ''g'') AS m FROM public.%I WHERE %I::text LIKE ''%%/static/%%'') s',
      r.col, r.tbl, r.col);
  END LOOP;
  RETURN QUERY
    SELECT m.prefix, (k IS NOT NULL AND m.prefix = '/static/tenants/' || k), count(*)
    FROM tok_media m GROUP BY m.prefix ORDER BY 2, 1;
END
$fn$;
