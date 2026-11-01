import { Button, Card } from "@agilityhub/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { promptMemberPwa, useMemberPwa } from "./install";

export function InstallAppCard() {
  const { t } = useTranslation("shell");
  const { enabled, installed, prompt } = useMemberPwa();
  const [showHelp, setShowHelp] = useState(false);
  if (!enabled || installed) return null;

  const ios =
    /iPad|iPhone|iPod/u.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);

  return (
    <Card className="profile-install">
      <h2>{t("shell:pwa.title")}</h2>
      <p>{t("shell:pwa.description")}</p>
      <Button
        onClick={() => {
          if (prompt === null) setShowHelp((shown) => !shown);
          else
            void promptMemberPwa().then((shown) => {
              if (!shown) setShowHelp(true);
            });
        }}
        type="button"
        variant="secondary"
      >
        {prompt === null ? t("shell:pwa.instructions") : t("shell:pwa.install")}
      </Button>
      {showHelp ? <p role="status">{ios ? t("shell:pwa.ios") : t("shell:pwa.browser")}</p> : null}
      <small>{t("shell:pwa.connection")}</small>
    </Card>
  );
}
