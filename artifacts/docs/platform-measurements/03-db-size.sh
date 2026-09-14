#!/bin/bash
set -euo pipefail
PSQL=/opt/homebrew/opt/postgresql@17/bin/psql
DBURL="postgres://ivanprotsko@127.0.0.1:5433/upready_store_mt"
echo "== database size =="
$PSQL "$DBURL" -c "select pg_size_pretty(pg_database_size('upready_store_mt')), pg_database_size('upready_store_mt')"
echo "== ten largest tables =="
$PSQL "$DBURL" -c "
select schemaname||'.'||relname as table, pg_size_pretty(pg_total_relation_size(relid)) as total_size, pg_total_relation_size(relid) as bytes
from pg_catalog.pg_statio_user_tables
order by pg_total_relation_size(relid) desc
limit 10;
"
echo "== row counts =="
$PSQL "$DBURL" -c "select 'product' t, count(*) from product union all select 'order', count(*) from \"order\" union all select 'tenant', count(*) from tenant union all select 'sales_channel', count(*) from sales_channel;"
