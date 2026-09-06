import type { SVGAttributes } from "react";

import type { IconName } from "./names";

export type { IconName } from "./names";

const spriteUrl = new URL("./sprite.svg", import.meta.url).href;

export interface IconProps extends SVGAttributes<SVGSVGElement> {
  name: IconName;
  title?: string;
}

export function Icon({ className, name, title, ...props }: IconProps) {
  return (
    <svg
      {...props}
      aria-hidden={title === undefined ? true : undefined}
      className={["ah-icon", className].filter(Boolean).join(" ")}
      role={title === undefined ? undefined : "img"}
    >
      {title === undefined ? null : <title>{title}</title>}
      <use href={`${spriteUrl}#i-${name}`} />
    </svg>
  );
}
