import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  {
    ignores: [
      "dist/**",
      "example/dist/**",
      "*.config.{js,mjs,cjs,ts,tsx}",
      "example/**/*.config.{js,mjs,cjs,ts,tsx}",
      "**/_generated/",
      "initTemplate.mjs",
    ],
  },
  {
    files: ["src/**/*.{js,mjs,cjs,ts,tsx}", "example/**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: [
          "./tsconfig.json",
          "./example/tsconfig.json",
          "./example/convex/tsconfig.json",
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  // Convex code - Worker environment
  {
    files: ["src/**/*.{ts,tsx}", "example/convex/**/*.{ts,tsx}"],
    ignores: ["src/react/**"],
    languageOptions: {
      globals: globals.worker,
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-explicit-any": "off",
      "no-unused-vars": "off",
      // No '^_' escape outside tests: a prefix must not silence unused state
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true },
      ],
      "@typescript-eslint/no-unused-expressions": [
        "error",
        {
          allowShortCircuit: true,
          allowTernary: true,
          allowTaggedTemplates: true,
        },
      ],
    },
  },
  // Packaging tests - Node environment
  {
    files: ["test/**/*.{js,mjs}"],
    languageOptions: {
      globals: globals.node,
    },
  },
  // React app code - Browser environment
  {
    files: ["src/react/**/*.{ts,tsx}", "example/src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "no-unused-vars": "off",
      // No '^_' escape outside tests: a prefix must not silence unused state
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true },
      ],
    },
  },
  // React library code: no any-typed flows (L2). An exception needs a local
  // disable with its reason, at an interop seam only. Tests stub freely; the
  // in-memory fixtures of test/lint are linted without type information.
  {
    files: ["src/react/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.test-d.{ts,tsx}", "**/lint-fixture.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-enum-comparison": "error",
      "@typescript-eslint/no-unsafe-unary-minus": "error",
    },
  },
  // Tests - stubs may keep deliberately unused '_'-prefixed bindings
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
];
