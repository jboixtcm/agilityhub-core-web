import { useState, type InputHTMLAttributes } from "react";

import { Input } from "./components";
import { Icon } from "./icons/Icon";

/** Password visibility is local to this field and never changes its value or submits the form. */
export function PasswordInput({
  showLabel,
  hideLabel,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  showLabel: string;
  hideLabel: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="ah-password-input">
      <Input {...props} type={visible ? "text" : "password"} />
      <button
        aria-controls={props.id}
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
        disabled={props.disabled}
        onClick={() => {
          setVisible((value) => !value);
        }}
        type="button"
      >
        <Icon name={visible ? "eye-off" : "eye"} />
      </button>
    </span>
  );
}
