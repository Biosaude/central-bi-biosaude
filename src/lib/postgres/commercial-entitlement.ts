import type { Pool } from "pg";

export const commercialDashboardSlug = "painel-comercial-r1";

export type CommercialEntitlementAssertion = {
  tenantId: string;
  objectId: string;
  jti: string;
  expiresAt: number;
};

export async function checkCommercialEntitlement(pool: Pool, assertion: CommercialEntitlementAssertion, dashboardSlug = commercialDashboardSlug) {
  const { rows: [decision] } = await pool.query<{ accepted: boolean; allowed: boolean }>(
    `WITH expired AS (
       DELETE FROM central_bi.commercial_entitlement_assertions
       WHERE expires_at <= statement_timestamp()
     ),
     claimed AS (
       INSERT INTO central_bi.commercial_entitlement_assertions (jti, expires_at)
       SELECT $1::uuid, to_timestamp($2)
       WHERE to_timestamp($2) > statement_timestamp()
       ON CONFLICT DO NOTHING
       RETURNING 1
     )
     SELECT EXISTS (SELECT 1 FROM claimed) AS accepted,
       EXISTS (
         SELECT 1 FROM claimed
         JOIN central_bi.users u ON u.entra_tenant_id=$3 AND u.entra_object_id=$4 AND u.enabled
         JOIN central_bi.user_dashboards g ON g.user_id=u.id AND g.permission_id='dashboard:read'
         JOIN central_bi.dashboards d ON d.id=g.dashboard_id AND d.slug=$5 AND d.active
       ) AS allowed`,
    [assertion.jti, assertion.expiresAt, assertion.tenantId, assertion.objectId, dashboardSlug],
  );
  return decision;
}
