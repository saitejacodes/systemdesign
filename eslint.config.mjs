import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Learner starters/solutions in five languages; checked by lib/labs/labs.test.ts instead.
    "content/labs/**",
    // Capstone project code (its own package.json and tsconfig); parsed by lib/capstone/capstone.test.ts instead.
    "content/capstone/**",
  ]),
]);

export default eslintConfig;
