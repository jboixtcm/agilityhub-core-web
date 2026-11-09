import { useState } from "react";

interface Props {
  alt: string;
  className: string;
  name: string;
  src: string;
}

/** Retry a failed public asset once; never leave a broken-image icon in the member app. */
export function ClubLogoImage(props: Props) {
  return <LogoAttempt key={props.src} {...props} />;
}

function LogoAttempt({ alt, className, name, src }: Props) {
  const [failures, setFailures] = useState(0);
  const canRetry = src.startsWith("/api/v1/public/");
  if (failures > (canRetry ? 1 : 0)) {
    return (
      <span
        aria-label={alt || undefined}
        className={`${className} club-logo-fallback`}
        role={alt ? "img" : undefined}
        title={name}
      >
        {name.charAt(0)}
      </span>
    );
  }
  const retrySrc = `${src}${src.includes("?") ? "&" : "?"}imageRetry=1`;
  return (
    <img
      alt={alt}
      className={className}
      onError={() => {
        setFailures((count) => count + 1);
      }}
      src={failures === 0 ? src : retrySrc}
    />
  );
}
