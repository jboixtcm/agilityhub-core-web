import path from "node:path";

import css from "@eslint/css";
import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const literalColorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g;
const typescriptFiles = ["**/*.{ts,tsx}"];

const typedConfigs = [
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
].map((config) => ({
  ...config,
  files: typescriptFiles,
}));

const noLiteralColorsInCss = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow literal colors outside the design-token stylesheet",
    },
    messages: {
      literalColor: "Use an --ah-* design token instead of a literal color.",
    },
    schema: [],
  },
  create(context) {
    if (context.filename.replaceAll("\\", "/").endsWith("/packages/ui/src/tokens.css")) {
      return {};
    }

    let checked = false;

    return {
      "*"() {
        if (checked) {
          return;
        }

        checked = true;
        const source = context.sourceCode.text;

        for (const match of source.matchAll(literalColorPattern)) {
          const index = match.index;
          const beforeMatch = source.slice(0, index);
          const lines = beforeMatch.split(/\r\n|\r|\n/);
          const line = lines.length;
          const column = lines.at(-1)?.length ?? 0;

          context.report({
            loc: {
              start: { line, column },
              end: { line, column: column + match[0].length },
            },
            messageId: "literalColor",
          });
        }
      },
    };
  },
};

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.turbo/**",
      "**/dist/**",
      "**/coverage/**",
      "docs/**",
      "roadmap/**",
    ],
  },
  {
    ...js.configs.recommended,
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  ...typedConfigs,
  {
    files: typescriptFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: path.resolve(import.meta.dirname, "../.."),
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      "import/order": [
        "error",
        {
          alphabetize: { order: "asc", caseInsensitive: true },
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
          "newlines-between": "always",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
          message: "Use an --ah-* design token instead of a literal color.",
        },
        {
          selector: "Literal[value=/rgba?\\(/]",
          message: "Use an --ah-* design token instead of a literal color.",
        },
        {
          selector: "Literal[value=/hsla?\\(/]",
          message: "Use an --ah-* design token instead of a literal color.",
        },
        {
          selector: "TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]",
          message: "Use an --ah-* design token instead of a literal color.",
        },
        {
          selector: "TemplateElement[value.raw=/rgba?\\(/]",
          message: "Use an --ah-* design token instead of a literal color.",
        },
        {
          selector: "TemplateElement[value.raw=/hsla?\\(/]",
          message: "Use an --ah-* design token instead of a literal color.",
        },
      ],
    },
    settings: {
      "import/resolver": {
        typescript: true,
      },
    },
  },
  {
    files: ["**/*.tsx"],
    plugins: {
      "jsx-a11y": jsxA11y,
      react,
      "react-hooks": reactHooks,
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      ...reactHooks.configs.flat.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    files: ["**/*.css"],
    language: "css/css",
    plugins: {
      agilityhub: {
        rules: {
          "no-literal-colors": noLiteralColorsInCss,
        },
      },
      css,
    },
    rules: {
      "agilityhub/no-literal-colors": "error",
    },
  },
);
