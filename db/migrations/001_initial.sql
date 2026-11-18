CREATE TABLE central_bi.dashboards (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    name text NOT NULL,
    description text NOT NULL,
    icon text NOT NULL,
    category text NOT NULL,
    display_order integer NOT NULL,
    active boolean NOT NULL,
    integration_type text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE central_bi.roles (
    id text PRIMARY KEY,
    name text NOT NULL
);

CREATE TABLE central_bi.users (
    id text PRIMARY KEY,
    oidc_subject text UNIQUE,
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    role_id text NOT NULL REFERENCES central_bi.roles(id)
);

CREATE TABLE central_bi.permissions (
    id text PRIMARY KEY,
    description text NOT NULL
);

CREATE TABLE central_bi.role_permissions (
    role_id text NOT NULL REFERENCES central_bi.roles(id),
    permission_id text NOT NULL REFERENCES central_bi.permissions(id),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE central_bi.user_dashboards (
    user_id text NOT NULL REFERENCES central_bi.users(id),
    dashboard_id integer NOT NULL REFERENCES central_bi.dashboards(id),
    permission_id text NOT NULL REFERENCES central_bi.permissions(id),
    PRIMARY KEY (user_id, dashboard_id, permission_id)
);

CREATE TABLE central_bi.audit_logs (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor text NOT NULL,
    action text NOT NULL,
    entity_id integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
