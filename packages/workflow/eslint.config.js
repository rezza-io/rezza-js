import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import tsdoc from "eslint-plugin-tsdoc";

export default tseslint.config(
  { ignores: ["lib"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      tsdoc: tsdoc,
    },
    rules: {
      "tsdoc/syntax": "warn",
    },
  },
);
