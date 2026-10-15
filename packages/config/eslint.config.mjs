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
// Tailwind's fixed palette (`bg-red-700`, `hover:text-white`, `bg-red-600/20`…) bypasses the club
// theme exactly like a hex literal (E9-W02 round 2, review #11): semantic utilities only
// (`bg-danger`, `text-primary-fg`…), which resolve to the --ah-* tokens.
const tailwindPaletteSelector =
  "(^|[\\s:])(bg|text|border|ring|fill|stroke|from|via|to|outline|divide|placeholder|accent|caret|decoration|shadow)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(-\\d{2,3})?\\b";
const tailwindPaletteMessage =
  "Use a semantic utility backed by an --ah-* token instead of a Tailwind palette colour.";
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
        {
          selector: `Literal[value=/${tailwindPaletteSelector}/]`,
          message: tailwindPaletteMessage,
        },
        {
          selector: `TemplateElement[value.raw=/${tailwindPaletteSelector}/]`,
          message: tailwindPaletteMessage,
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
    // Course UI recovered from the same web-planner commit as course-core (E9-W02). The port
    // removes Next/Supabase coupling and literal colours, but keeps the upstream numerical and
    // Three.js implementation style so behaviour remains reviewable against commit 65126cf.
    // Correctness, accessibility, React hooks and the design-token colour rule remain enabled.
    basePath: path.resolve(import.meta.dirname, "../.."),
    files: [
      "packages/course-ui/src/components/**/*.tsx",
      "packages/course-ui/src/lib/planner-state.ts",
    ],
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-meaningless-void-operator": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/prefer-promise-reject-errors": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
      "import/order": "off",
    },
  },
  {
    // Course engine recovered verbatim from the web-planner (E0-W08, ADR-013): the files stay
    // byte-identical to course-builder 65126cf so the origin can be diffed. These style/strictness
    // rules were not enforced there; the color, import-resolution and correctness rules still apply.
    // Drop entries from this list as the code is touched.
    basePath: path.resolve(import.meta.dirname, "../.."),
    files: ["packages/course-core/**/*.ts", "packages/shared-types/**/*.ts"],
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/dot-notation": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-deprecated": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unnecessary-type-conversion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/prefer-optional-chain": "off",
      "@typescript-eslint/prefer-regexp-exec": "off",
      "@typescript-eslint/restrict-plus-operands": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "import/order": "off",
    },
  },
  {
    // Printable AprilTag markers (E0-W08): the fiducial must be pure black on white to be detected,
    // and the marker page is a standalone printable SVG file (no CSS variables); not themed UI.
    // Exemption approved by the organizer as print artwork (E0-W08 verification, 2026-09-24).
    // WP-16-E′ (D16 marker printing) decides whether the page chrome takes the club's branding colours.
    basePath: path.resolve(import.meta.dirname, "../.."),
    files: [
      "packages/course-core/src/markers/apriltag-36h11.ts",
      "packages/course-core/src/markers/marker-svg.ts",
      "packages/course-core/tests/apriltag-36h11.test.ts",
      "packages/course-core/tests/marker-svg.test.ts",
    ],
    rules: {
      "no-restricted-syntax": "off",
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
