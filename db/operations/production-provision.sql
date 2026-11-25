-- Metadata verified in the Neon management API. Apply only in the explicitly approved window.
\set ON_ERROR_STOP on
SELECT :'HOST' = 'ep-withered-fog-b6e2x9ca.c-2.sa-east-1.aws.neon.tech'
   AND current_database() = 'neondb'
   AND current_user = 'neondb_owner'
   AND EXISTS (SELECT FROM pg_stat_ssl WHERE pid = pg_backend_pid() AND ssl)
   AS approved_target \gset
\if :approved_target
\else
  SELECT 1/0 AS destino_operacional_divergente;
\endif

BEGIN;
DO $scope$
BEGIN
    IF EXISTS (
        SELECT FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r','p','m','f','v')
          AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_class'::regclass
              AND d.objid = c.oid AND d.deptype = 'e')
    ) THEN
        RAISE EXCEPTION 'Objetos não inventariados em public; suspenda o provisionamento.';
    END IF;
    IF EXISTS (
        SELECT FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner
        WHERE n.nspname = 'central_bi' AND r.rolname <> 'central_bi_migrator'
    ) THEN
        RAISE EXCEPTION 'Schema central_bi existente com proprietário divergente.';
    END IF;
END
$scope$;

DO $roles$
DECLARE
    name text;
BEGIN
    FOREACH name IN ARRAY ARRAY['central_bi_migrator','central_bi_runtime']
    LOOP
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = name) THEN
            EXECUTE format('CREATE ROLE %I LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION PASSWORD NULL', name);
        END IF;
        IF NOT EXISTS (
            SELECT FROM pg_roles r WHERE r.rolname = name AND r.rolcanlogin AND NOT r.rolinherit
                AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication)
                AND NOT EXISTS (SELECT FROM pg_auth_members m WHERE m.member = r.oid)
        ) THEN
            RAISE EXCEPTION 'Papel Central BI incompatível: %', name;
        END IF;
    END LOOP;
END
$roles$;

-- Only after confirming the database is dedicated to the Central during the approved window.
REVOKE CREATE, TEMPORARY ON DATABASE neondb FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE neondb TO central_bi_migrator, central_bi_runtime;

DO $central_schema$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_namespace WHERE nspname = 'central_bi') THEN
        GRANT central_bi_migrator TO neondb_owner WITH SET TRUE;
        CREATE SCHEMA central_bi AUTHORIZATION central_bi_migrator;
        REVOKE SET OPTION FOR central_bi_migrator FROM neondb_owner;
    END IF;
END
$central_schema$;
COMMIT;
