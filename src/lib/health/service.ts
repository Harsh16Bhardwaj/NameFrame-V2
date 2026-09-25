type Environment = Record<string, string | undefined>;
type ServiceStatus = "healthy" | "unhealthy" | "configured" | "not_configured";

export type HealthReport = {
  status: "healthy" | "degraded";
  services: {
    application: ServiceStatus;
    database: ServiceStatus;
    cloudinary: ServiceStatus;
    smtp: ServiceStatus;
    resend: ServiceStatus;
  };
};

function hasValues(environment: Environment, names: string[]): boolean {
  return names.every((name) => Boolean(environment[name]?.trim()));
}

export function configuredServiceStatuses(environment: Environment = process.env) {
  return {
    cloudinary: hasValues(environment, [
      "CLOUDINARY_CLOUD_NAME",
      "CLOUDINARY_API_KEY",
      "CLOUDINARY_API_SECRET",
    ]) ? "configured" as const : "not_configured" as const,
    smtp: hasValues(environment, [
      "SITE_SMTP_HOST",
      "SITE_SMTP_USERNAME",
      "SITE_SMTP_PASSWORD",
      "SITE_SMTP_FROM_EMAIL",
    ]) ? "configured" as const : "not_configured" as const,
    resend: hasValues(environment, ["RESEND_API_KEY", "RESEND_FROM_EMAIL"])
      ? "configured" as const
      : "not_configured" as const,
  };
}

async function checkDatabase(): Promise<void> {
  const { prisma } = await import("@/lib/db/prisma");
  await prisma.$queryRaw`SELECT 1`;
}

export async function buildHealthReport(
  databaseCheck: () => Promise<void> = checkDatabase,
  environment: Environment = process.env,
): Promise<HealthReport> {
  let database: ServiceStatus = "healthy";

  try {
    await databaseCheck();
  } catch {
    database = "unhealthy";
    console.error("Database health check failed.");
  }

  return {
    status: database === "healthy" ? "healthy" : "degraded",
    services: {
      application: "healthy",
      database,
      ...configuredServiceStatuses(environment),
    },
  };
}
