import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/tmp/**",
      "mobile/android/**",
      "mobile/.expo/**",
      "mobile/releases/**",
      "mobile/test-artifacts/**",
      "learning-site/**",
      "stitch_swiftsoap_ai_clinical_notes/**",
      "reports/**",
      "screenshots/**",
      ".planning/**",
      ".codex/**",
      ".agents/**",
      ".superpowers/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // TypeScript already reports undefined names.
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "prefer-const": "error",
      // `interface Foo extends Bar {}` is a deliberate named alias in the contracts.
      "@typescript-eslint/no-empty-object-type": ["error", { allowInterfaces: "with-single-extends" }],
    },
  },
  {
    files: ["**/*.{js,cjs,mjs}"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Detox e2e specs are CommonJS run by Jest.
    files: ["**/*.cjs", "mobile/e2e/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Maestro runScript files run inside Maestro's Rhino-based JS engine.
    files: ["mobile/.maestro/**/*.js"],
    languageOptions: { globals: { Java: "readonly", output: "writable", maestro: "readonly" } },
  },
  {
    files: ["**/tests/**", "**/*.test.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
