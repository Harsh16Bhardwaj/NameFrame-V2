import "dotenv/config";
import { defineConfig } from "prisma/config";

import { withDatabaseSchema } from "./src/lib/db/database-schema";

const directUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!directUrl) {
  throw new Error("DIRECT_URL or DATABASE_URL is required for Prisma commands");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: withDatabaseSchema(directUrl),
  },
});

