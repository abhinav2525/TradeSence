-- Postgres settings for this machine (decision 0021). Homebrew ships the
-- factory defaults (128 MB of memory, 4 MB per sort), sized for a tiny server;
-- the database is ~1 GB and growing, on an 18 GB SSD Mac.
--
-- Apply as a superuser, then restart:
--   psql tradesence -f ops/postgres-tuning.sql
--   brew services restart postgresql@14
-- ALTER SYSTEM writes postgresql.auto.conf; `ALTER SYSTEM RESET ALL` undoes it.

ALTER SYSTEM SET shared_buffers = '2GB';          -- keep the whole working set in memory (needs restart)
ALTER SYSTEM SET effective_cache_size = '8GB';    -- what the OS file cache can hold; a planner hint only
ALTER SYSTEM SET work_mem = '32MB';               -- per sort/hash; the breadth query spilled to disk at 4MB
ALTER SYSTEM SET maintenance_work_mem = '512MB';  -- index builds, CLUSTER, VACUUM
ALTER SYSTEM SET random_page_cost = 1.1;          -- SSD: a random read costs about the same as a sequential one
