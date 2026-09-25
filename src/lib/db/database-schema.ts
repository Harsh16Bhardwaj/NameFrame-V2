export const DATABASE_SCHEMA = "sertify";

export function withDatabaseSchema(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.set("schema", DATABASE_SCHEMA);
  normalizeSslMode(url);
  return url.toString();
}

export function withSecureSslMode(connectionString: string): string {
  const url = new URL(connectionString);
  normalizeSslMode(url);
  return url.toString();
}

function normalizeSslMode(url: URL): void {
  const sslMode = url.searchParams.get("sslmode");

  if (sslMode === "prefer" || sslMode === "require" || sslMode === "verify-ca") {
    url.searchParams.set("sslmode", "verify-full");
  }
}
