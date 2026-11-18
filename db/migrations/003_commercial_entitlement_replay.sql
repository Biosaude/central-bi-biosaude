CREATE TABLE central_bi.commercial_entitlement_assertions (
    jti uuid PRIMARY KEY,
    expires_at timestamptz NOT NULL
);

CREATE INDEX commercial_entitlement_assertions_expires_idx
    ON central_bi.commercial_entitlement_assertions (expires_at);
