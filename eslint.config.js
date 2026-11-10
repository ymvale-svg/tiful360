import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // UX guardrails (see the UX plan): confirmations go through useConfirm, never the
      // browser's unstyled, blocking dialogs.
      "no-restricted-properties": ["error",
        { object: "window", property: "confirm", message: "Use useConfirm() from components/feedback/ConfirmDialog." },
        { object: "window", property: "prompt", message: "Use a Dialog with a labelled field." },
        { object: "window", property: "alert", message: "Use a toast or an inline message." },
      ],
      "no-restricted-globals": ["error",
        { name: "confirm", message: "Use useConfirm() from components/feedback/ConfirmDialog." },
        { name: "prompt", message: "Use a Dialog with a labelled field." },
      ],
      // Accessibility checks the UI/UX Pro Max audit found most often. Warnings for now, so
      // existing screens can be cleaned up gradually without blocking work.
      "jsx-a11y/alt-text": "warn",
      "jsx-a11y/anchor-is-valid": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "jsx-a11y/label-has-associated-control": ["warn", { assert: "either", depth: 3 }],
      "jsx-a11y/no-autofocus": ["warn", { ignoreNonDOM: true }],
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
    },
  },
);
