import { type ApiClient, useSubmissionKeys } from "@agilityhub/api-client";
import { Button, Modal } from "@agilityhub/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  consoleErrorMessage,
  FormMessage,
  type PlatformClub,
  SectionCard,
  useWriteState,
} from "../shared";

/**
 * S17 R-17-11 (E10-T04): the club's website key (`X-Api-Key` of the public routes). The api
 * answers it once and keeps only its digest: it is shown here until the user leaves the tab,
 * never stored, logged or put in an address. A new key replaces the old one, which keeps working
 * for 24 hours.
 */
export function PublicApiKeyCard({ client, club }: { client: ApiClient; club: PlatformClub }) {
  const { t } = useTranslation(["console", "errors", "common"]);
  const keys = useSubmissionKeys();
  const rotation = useWriteState();
  const [confirming, setConfirming] = useState(false);
  const [apiKey, setApiKey] = useState<string>();
  const [copied, setCopied] = useState(false);
  // One rotation per confirmation: a retry of an unanswered one replays the same key (the api
  // answers the same value), a later confirmation is a new rotation.
  const [rotationId, setRotationId] = useState(0);

  const rotate = async () => {
    setConfirming(false);
    setApiKey(undefined);
    setCopied(false);
    const signature = `public-api-key:${club.id}:${String(rotationId)}`;
    const result = await rotation.run(() =>
      keys.send(signature, async (key) => {
        const response = await client.POST("/platform/clubs/{id}/public-api-key", {
          params: { header: { "Idempotency-Key": key }, path: { id: club.id } },
        });
        if (response.data === undefined) throw new TypeError("Public API key without data");
        return response.data;
      }),
    );
    if (result !== undefined) {
      setApiKey(result.apiKey);
      setRotationId((value) => value + 1);
    }
  };

  const copy = async () => {
    if (apiKey === undefined) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <SectionCard
      description={t("console:publicKey.description")}
      title={t("console:publicKey.title")}
    >
      {apiKey === undefined ? null : (
        <div className="console-message console-message--warning" role="status">
          <p>{t("console:publicKey.shownOnce")}</p>
          <code aria-label={t("console:publicKey.keyLabel")} className="console-api-key">
            {apiKey}
          </code>
          <div className="console-actions">
            <Button onClick={() => void copy()} variant="secondary">
              {copied ? t("console:publicKey.copied") : t("console:publicKey.copy")}
            </Button>
          </div>
        </div>
      )}
      <FormMessage
        message={rotation.error === undefined ? undefined : consoleErrorMessage(t, rotation.error)}
        tone="danger"
      />
      <div className="console-actions">
        <Button
          loading={rotation.pending}
          loadingLabel={t("console:publicKey.generating")}
          onClick={() => {
            setConfirming(true);
          }}
          variant="secondary"
        >
          {t("console:publicKey.generate")}
        </Button>
      </div>
      <Modal
        closeLabel={t("console:common.close")}
        onClose={() => {
          setConfirming(false);
        }}
        open={confirming}
        title={t("console:publicKey.confirmTitle")}
      >
        <p>{t("console:publicKey.confirmText")}</p>
        <div className="console-actions">
          <Button
            onClick={() => {
              setConfirming(false);
            }}
            variant="ghost"
          >
            {t("console:common.cancel")}
          </Button>
          <Button onClick={() => void rotate()}>{t("console:publicKey.confirm")}</Button>
        </div>
      </Modal>
    </SectionCard>
  );
}
