import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: [path.resolve(dirname, "tests/setup-vitest.ts")],
    exclude: ["node_modules", "dist", "e2e"],
  },
  resolve: {
    alias: {
      "react-native": path.resolve(dirname, "tests/mocks/react-native.ts"),
    },
  },
});
