import { useState } from "react";

import { Avatar } from "./components";
import { Icon } from "./icons/Icon";

import "./dog-photo.css";

/**
 * Uses the API's signed photo URL; an absent or failed image retains the dog identity. Lists draw
 * one per row (D1's dogs, the instructor's student search), and the API serves the photo at the
 * size it was uploaded: the image loads only when its row nears the viewport (WEB-05). The box
 * has a fixed size (`dog-photo.css`), so a late image never moves the row.
 */
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
          decoding="async"
          loading="lazy"
          onError={() => {
            setFailed(src);
          }}
          src={src}
        />
      )}
    </span>
  );
}
