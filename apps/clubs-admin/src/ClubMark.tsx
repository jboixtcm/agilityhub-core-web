import { useBranding, useBrandingLogo } from "@agilityhub/ui";
import { useState } from "react";

/** A transient asset failure must not leave the administration header with a broken image. */
export function ClubMark() {
  const { club } = useBranding();
  const mark = useBrandingLogo("compact");
  const full = useBrandingLogo("full");
  const sources = [
    ...new Set([mark.src, full.src].filter((src): src is string => src !== undefined)),
  ];
  return <MarkAttempt key={sources.join("|")} name={club.name} sources={sources} />;
}

function MarkAttempt({ name, sources }: { name: string; sources: string[] }) {
  const attempts = sources.flatMap((src) =>
    src.startsWith("/api/v1/public/")
      ? [src, `${src}${src.includes("?") ? "&" : "?"}imageRetry=1`]
      : [src],
  );
  const [attempt, setAttempt] = useState(0);
  const src = attempts[attempt];
  return src === undefined ? (
    <span aria-hidden="true" className="admin-shell__mark">
      {name.charAt(0)}
    </span>
  ) : (
    <img
      alt=""
      onError={() => {
        setAttempt((current) => current + 1);
      }}
      src={src}
    />
  );
}
