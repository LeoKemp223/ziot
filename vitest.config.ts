import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web", import.meta.url)),
      "@ziot/domain": fileURLToPath(
        new URL("./packages/domain/src", import.meta.url)
      ),
      "@ziot/db": fileURLToPath(new URL("./packages/db/src/client.ts", import.meta.url))
    }
  },
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      include: ["packages/domain/src/**/*.ts"],
      exclude: ["packages/domain/src/**/*.test.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    }
  }
});
