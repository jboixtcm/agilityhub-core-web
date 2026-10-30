import { type ApiClient, type components } from "@agilityhub/api-client";
import { Button, LimitedMarkdown, Modal, Skeleton, useBranding } from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** Club-owned content, editable through the existing page catalog. */
export function TrainingConditions({ client }: { client: ApiClient }) {
  const { t, i18n } = useTranslation("training");
  const branding = useBranding();
  const [open, setOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState<components["schemas"]["ClubPage"]>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    void client.GET("/club-pages/{key}", { params: { path: { key: "training-conditions" } } }).then(
      ({ data }) => {
        if (active) {
          setPage(data);
          setFailed(data === undefined);
        }
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [client, open, reload]);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const body = page?.body[locale] ?? page?.body[branding.defaultLocale] ?? "";
  return (
    <>
      <Button
        variant="ghost"
        onClick={() => {
          setFailed(false);
          setPage(undefined);
          setOpen(true);
        }}
      >
        {t("training:conditions.link")}
      </Button>
      {open ? (
        <Modal
          open
          onClose={() => {
            setOpen(false);
          }}
          title={t("training:conditions.title")}
          closeLabel={t("training:conditions.close")}
        >
          {failed ? (
            <div role="alert">
              <p>{t("training:conditions.error")}</p>
              <Button
                onClick={() => {
                  setFailed(false);
                  setPage(undefined);
                  setReload((value) => value + 1);
                }}
              >
                {t("training:retry")}
              </Button>
            </div>
          ) : page === undefined ? (
            <Skeleton label={t("training:conditions.loading")} />
          ) : (
            <LimitedMarkdown>{body}</LimitedMarkdown>
          )}
          <Button
            onClick={() => {
              setOpen(false);
            }}
          >
            {t("training:conditions.close")}
          </Button>
        </Modal>
      ) : null}
    </>
  );
}
