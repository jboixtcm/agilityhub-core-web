import type { ReactNode } from "react";

import { navigateInApp } from "../booking/shared";

import "./instructor.css";

export function StudentLink({ children, dogId }: { children: ReactNode; dogId: string }) {
  const href = `/instructor/alumnes/${encodeURIComponent(dogId)}`;
  return (
    <a
      className="instructor-student-link"
      href={href}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        navigateInApp(href);
      }}
    >
      {children}
    </a>
  );
}
