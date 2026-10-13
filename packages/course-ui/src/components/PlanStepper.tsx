import type { AnchorHTMLAttributes, ReactNode } from "react";

export interface PlanStepDefinition {
  readonly id: string;
  readonly index: number;
  readonly label: string;
  readonly href: string;
}

interface LinkRenderProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly children: ReactNode;
}

export interface PlanStepperProps {
  readonly ariaLabel: string;
  readonly currentStep: string;
  readonly steps: readonly PlanStepDefinition[];
  readonly canEnterStep: (step: string) => boolean;
  readonly renderLink: (props: LinkRenderProps) => ReactNode;
}

export function PlanStepper({
  ariaLabel,
  canEnterStep,
  currentStep,
  renderLink,
  steps,
}: PlanStepperProps) {
  const currentIndex = steps.findIndex((step) => step.id === currentStep);

  return (
    <nav className="mb-6" aria-label={ariaLabel}>
      <ol className="flex flex-wrap items-center gap-1 text-xs">
        {steps.map((step, index) => {
          const active = step.id === currentStep;
          const enabled = canEnterStep(step.id);
          const complete = enabled && currentIndex >= 0 && index < currentIndex;
          const className = [
            "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 transition-colors",
            active
              ? "border-warning bg-warning font-medium text-[var(--ah-color-on-warning)]"
              : complete
                ? "border-border bg-surface-2 text-text"
                : enabled
                  ? "border-border bg-transparent text-muted"
                  : "cursor-not-allowed border-border bg-transparent text-muted opacity-50",
          ].join(" ");
          const content = (
            <>
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-border text-[10px] font-semibold text-text">
                {step.index}
              </span>
              <span>{step.label}</span>
            </>
          );

          return (
            <li key={step.id} className="flex items-center">
              {enabled
                ? renderLink({
                    "aria-current": active ? "step" : undefined,
                    children: content,
                    className,
                    href: step.href,
                  })
                : (
                    <span className={className} aria-disabled="true">
                      {content}
                    </span>
                  )}
              {index < steps.length - 1 ? (
                <span className="px-1.5 text-muted" aria-hidden="true">
                  →
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
