import js from "@eslint/js";
import astro from "eslint-plugin-astro";
import promise from "eslint-plugin-promise";
import security from "eslint-plugin-security";
import sonarjs from "eslint-plugin-sonarjs";
import globals from "globals";
import tseslint from "typescript-eslint";

const typescriptFiles = [
  "apps/web/src/**/*.ts",
  "packages/wishes-domain/src/**/*.ts",
  "packages/wishes-infrastructure/src/**/*.ts",
];

const testFiles = ["**/*.test.ts", "**/*.spec.ts", "**/*.integration.test.ts"];

export default tseslint.config(
  {
    name: "hope/ignores",
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.astro/**",
      "**/.vercel/**",
      "**/.netlify/**",
      "**/.wrangler/**",
      "**/.output/**",
      "**/.next/**",
      "**/.nuxt/**",
      "**/.svelte-kit/**",
      "**/.vite/**",
      "**/.cache/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/.nyc_output/**",
      "**/.vitest/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/blob-report/**",
      "**/.lighthouseci/**",
      "supabase/.temp/**",
      "supabase/.branches/**",
      "supabase/.supabase/**",
      "apps/web/public/**",
    ],
  },
  {
    ...js.configs.recommended,
    name: "hope/javascript",
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-console": "off",
    },
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    name: config.name ? `hope/${config.name}` : "hope/typescript-recommended",
    files: typescriptFiles,
  })),
  {
    name: "hope/typescript-project",
    files: typescriptFiles,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      promise,
      security,
      sonarjs,
    },
    rules: {
      ...promise.configs["flat/recommended"].rules,
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-floating-promises": [
        "error",
        { ignoreVoid: true },
      ],
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "promise/always-return": "off",
      "promise/no-nesting": "off",
      "promise/no-promise-in-callback": "off",
      "promise/no-callback-in-promise": "off",
      "security/detect-bidi-characters": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-new-buffer": "error",
      "security/detect-pseudoRandomBytes": "error",
      "security/detect-unsafe-regex": "off",
      "sonarjs/no-dead-store": "error",
      "sonarjs/no-identical-expressions": "error",
      "sonarjs/no-unused-collection": "error",
      "sonarjs/no-use-of-empty-return-value": "error",
    },
  },
  {
    name: "hope/external-type-boundaries",
    files: [
      "apps/web/src/lib/main.ts",
      "apps/web/src/server/wish-services.ts",
      "packages/wishes-infrastructure/src/supabase-wish-repository.ts",
    ],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
    },
  },
  ...astro.configs["flat/recommended"],
  {
    name: "hope/astro",
    files: ["apps/web/src/**/*.astro"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    name: "hope/tests",
    files: testFiles,
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },
);
