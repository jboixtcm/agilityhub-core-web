import { type WarningRuleId, warningRuleIdSchema } from "@agilityhub/course-core";
import { createCourseTexts, createI18n, type CourseWarningRule } from "@agilityhub/i18n";
import { describe, expect, expectTypeOf, it } from "vitest";

// E11-W02 (INC-60): `CourseWarningRule` is written by hand in `@agilityhub/i18n` (which does not
// depend on course-core); this package sees both, so a rule added to the engine without its label
// fails here (typecheck and run) instead of compiling.
describe("T-16-22 R-16-17 every rule of course-core's warning engine has its label (INC-60)", () => {
  it("the labelled rule ids are exactly course-core's WarningRuleId", () => {
    expectTypeOf<CourseWarningRule>().toEqualTypeOf<WarningRuleId>();
  });

  it.each(["ca", "es", "en"] as const)(
    "%s reads every rule of the engine in words, never its identifier",
    async (locale) => {
      const i18n = await createI18n({
        branding: { defaultLocale: locale, locales: ["ca", "es", "en"] },
        browserLanguages: [locale],
        initialNamespaces: ["enums", "errors"],
        storage: undefined,
      });
      const t = i18n.getFixedT(locale);
      const texts = createCourseTexts((key, options) => t(key, options ?? {}));
      for (const rule of warningRuleIdSchema.options) {
        const label = texts.warningRule(rule);
        expect(label, rule).not.toBe("");
        expect(label, rule).not.toContain(rule);
        expect(label, rule).not.toContain("courseWarningRule");
      }
    },
  );
});
