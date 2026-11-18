import { handleRetentionEntitlement } from "@/lib/commercial-entitlement";
import { corporateServices } from "@/lib/corporate";
import { checkCommercialEntitlement } from "@/lib/postgres/commercial-entitlement";

export const runtime = "nodejs";

export function POST(request: Request) {
  return handleRetentionEntitlement(request, (assertion, slug) =>
    checkCommercialEntitlement(corporateServices().pool, assertion, slug),
  );
}
