import { useState } from "react";

import { Avatar } from "./components";
import { Icon } from "./icons/Icon";

import "./dog-photo.css";

/** Uses the API's signed photo URL; an absent or failed image retains the dog identity. */
export function DogPhoto({
  name,
  src,
  alt = "",
  size = "small",
}: {
  name: string;
  src?: string | null | undefined;
  alt?: string;
  size?: "small" | "large";
}) {
  const [failed, setFailed] = useState<string>();
  return (
    <span aria-hidden={alt === "" || undefined} className={`ah-dog-photo ah-dog-photo--${size}`}>
      {src == null || src === "" || src === failed ? (
        alt === "" ? (
          <span className="ah-avatar ah-avatar--dog">
            <Icon aria-hidden="true" name="paw" />
          </span>
        ) : (
          <Avatar kind="dog" name={name} />
        )
      ) : (
        <img
          alt={alt}
          onError={() => {
            setFailed(src);
          }}
          src={src}
        />
      )}
    </span>
  );
}
