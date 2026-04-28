import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://ziot:ziot@localhost:5432/ziot"
  },
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  }
});
