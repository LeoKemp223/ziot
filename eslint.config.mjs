import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default [
  {
    ignores: [
      "**/.next/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**"
    ]
  },
  js.configs.recommended,
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      react: {
        version: "19.2"
      },
      next: {
        rootDir: "apps/web"
      }
    },
    rules: {
      "@next/next/no-html-link-for-pages": "off"
    }
  }
];
