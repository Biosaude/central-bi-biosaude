ALTER TABLE central_bi.users
    ADD COLUMN entra_tenant_id uuid,
    ADD COLUMN entra_object_id uuid,
    ADD COLUMN enabled boolean NOT NULL DEFAULT false,
    ADD CONSTRAINT users_entra_identity_unique UNIQUE (entra_tenant_id, entra_object_id),
    ADD CONSTRAINT users_entra_identity_pair CHECK (
        (entra_tenant_id IS NULL) = (entra_object_id IS NULL)
        AND (NOT enabled OR entra_tenant_id IS NOT NULL)
    );

ALTER TABLE central_bi.audit_logs
    ADD COLUMN details jsonb NOT NULL DEFAULT '{}';

INSERT INTO central_bi.roles (id, name) VALUES
    ('administrador', 'Administrador'), ('gestor', 'Gestor'), ('visualizador', 'Visualizador')
ON CONFLICT (id) DO NOTHING;

INSERT INTO central_bi.permissions (id, description) VALUES
    ('dashboard:read', 'Leitura de dashboard'),
    ('dashboard:manage', 'Gestão de dashboards'), ('users:manage', 'Gestão de usuários')
ON CONFLICT (id) DO NOTHING;

INSERT INTO central_bi.role_permissions (role_id, permission_id) VALUES
    ('administrador', 'dashboard:read'), ('administrador', 'dashboard:manage'),
    ('administrador', 'users:manage'), ('gestor', 'dashboard:read'), ('visualizador', 'dashboard:read')
ON CONFLICT DO NOTHING;

CREATE TABLE central_bi.login_attempts (
    token_hash text PRIMARY KEY,
    state text NOT NULL,
    nonce text NOT NULL,
    code_verifier text NOT NULL,
    expires_at timestamptz NOT NULL
);
CREATE INDEX login_attempts_expires_idx ON central_bi.login_attempts (expires_at);

CREATE TABLE central_bi.sessions (
    token_hash text PRIMARY KEY,
    user_id text NOT NULL REFERENCES central_bi.users(id),
    expires_at timestamptz NOT NULL,
    idle_expires_at timestamptz NOT NULL,
    revoked_at timestamptz
);
CREATE INDEX sessions_user_idx ON central_bi.sessions (user_id);
CREATE INDEX sessions_expires_idx ON central_bi.sessions (expires_at);
