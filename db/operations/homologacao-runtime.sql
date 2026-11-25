-- Apply as central_bi_migrator after the migrations, using psql with ON_ERROR_STOP.
BEGIN;

DO $$
DECLARE
    runtime record;
BEGIN
    SELECT oid, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
    INTO runtime
    FROM pg_roles WHERE rolname = 'central_bi_runtime';

    IF current_user <> 'central_bi_migrator' OR current_database() <> 'neondb' THEN
        RAISE EXCEPTION 'Use central_bi_migrator no banco neondb de homologação.';
    END IF;

    IF NOT FOUND OR NOT runtime.rolcanlogin OR runtime.rolsuper OR runtime.rolcreatedb
        OR runtime.rolcreaterole OR runtime.rolreplication OR runtime.rolbypassrls
        OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member = runtime.oid)
        OR has_database_privilege(runtime.oid, current_database(), 'CREATE')
        OR has_database_privilege(runtime.oid, current_database(), 'TEMPORARY')
        OR has_schema_privilege(runtime.oid, 'public', 'CREATE')
        OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = runtime.oid)
        OR EXISTS (SELECT 1 FROM pg_class WHERE relowner = runtime.oid) THEN
        RAISE EXCEPTION 'O papel central_bi_runtime deve ser um LOGIN sem privilégios elevados, objetos próprios ou memberships.';
    END IF;
END $$;

REVOKE ALL ON SCHEMA central_bi FROM PUBLIC, central_bi_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA central_bi FROM PUBLIC, central_bi_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA central_bi FROM PUBLIC, central_bi_runtime;

GRANT USAGE ON SCHEMA central_bi TO central_bi_runtime;

GRANT SELECT ON central_bi.dashboards, central_bi.users, central_bi.user_dashboards,
    central_bi.sessions, central_bi.login_attempts TO central_bi_runtime;

GRANT INSERT (slug, name, description, icon, category, display_order, active, integration_type),
    UPDATE (slug, name, description, icon, category, display_order, active, integration_type, updated_at)
    ON central_bi.dashboards TO central_bi_runtime;

GRANT INSERT (id, entra_tenant_id, entra_object_id, name, email, role_id, enabled),
    UPDATE (name, email, role_id, enabled) ON central_bi.users TO central_bi_runtime;

GRANT INSERT (user_id, dashboard_id, permission_id), DELETE
    ON central_bi.user_dashboards TO central_bi_runtime;

GRANT INSERT (token_hash, user_id, expires_at, idle_expires_at),
    UPDATE (idle_expires_at, revoked_at), DELETE ON central_bi.sessions TO central_bi_runtime;

GRANT INSERT (token_hash, state, nonce, code_verifier, expires_at), DELETE
    ON central_bi.login_attempts TO central_bi_runtime;

GRANT SELECT (expires_at), INSERT (jti, expires_at), DELETE
    ON central_bi.commercial_entitlement_assertions TO central_bi_runtime;

GRANT INSERT (actor, action, entity_id, details) ON central_bi.audit_logs TO central_bi_runtime;

COMMIT;
