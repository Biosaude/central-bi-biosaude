import { headers } from "next/headers";
import { isLocalDemo } from "./access";
export async function localDemoAllowed() {
  return isLocalDemo(await headers());
}
