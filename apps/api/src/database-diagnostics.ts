import { ServiceUnavailableException } from "@nestjs/common";

const codes = new Set([
  "P1000",
  "P1001",
  "P1002",
  "P1011",
  "P2010",
  "P2024",
  "28P01",
  "28000",
  "3D000",
  "42501",
  "53300",
  "57P03",
  "ENOENT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ECONNRESET",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "ERR_INVALID_URL",
]);
const kinds = new Set([
  "AuthenticationFailed",
  "DatabaseNotReachable",
  "TlsConnectionError",
  "DatabaseDoesNotExist",
  "DatabaseAccessDenied",
  "ConnectionClosed",
  "SocketTimeout",
  "TooManyConnections",
]);

// Never include messages, stacks, SQL, URLs, hostnames, users or arbitrary metadata.
export function databaseFailureCodes(error: unknown) {
  const foundCodes = new Set<string>(),
    foundKinds = new Set<string>();
  const seen = new Set<object>();
  function visit(value: unknown, depth: number) {
    if (!value || typeof value !== "object" || depth > 8 || seen.has(value))
      return;
    seen.add(value);
    const e = value as Record<string, unknown>;
    for (const field of ["code", "originalCode"])
      if (typeof e[field] === "string" && codes.has(e[field]))
        foundCodes.add(e[field]);
    if (typeof e.kind === "string" && kinds.has(e.kind)) foundKinds.add(e.kind);
    for (const field of ["cause", "meta", "driverAdapterError", "error"])
      visit(e[field], depth + 1);
    if (Array.isArray(e.errors))
      for (const item of e.errors.slice(0, 8)) visit(item, depth + 1);
  }
  visit(error, 0);
  return {
    codes: [...foundCodes],
    kinds: [...foundKinds],
    classified: foundCodes.size > 0 || foundKinds.size > 0,
  };
}

export async function databaseReadiness(
  query: () => Promise<unknown>,
  log: (summary: ReturnType<typeof databaseFailureCodes>) => void,
) {
  try {
    await query();
    return { status: "ready" };
  } catch (error) {
    log(databaseFailureCodes(error));
    throw new ServiceUnavailableException("Database is unavailable.");
  }
}
