import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      vscode: resolve(root, "src/test/mocks/vscode.ts")
    }
  },
  test: {
    include: ["src/test/unit/**/*.test.ts"],
    exclude: ["src/test/integration/**"],
    environment: "node",
    globals: false,
    coverage: {
      provider: "v8",
      include: ["src/git/**/*.ts"],
      exclude: ["src/test/**", "src/webview/**", "src/git/diffProvider.ts"],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80
      }
    }
  }
});
