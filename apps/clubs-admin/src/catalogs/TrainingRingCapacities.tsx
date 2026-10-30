import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import { Button, FormField, Input } from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type Ring = components["schemas"]["Ring"];
function Capacity({
  client,
  ring,
  onSaved,
}: {
  client: ApiClient;
  ring: Ring;
  onSaved: () => void;
}) {
  const { t } = useTranslation(["admin-settings", "errors"]);
  const [value, setValue] = useState(
    ring.trainingCapacity == null ? "" : String(ring.trainingCapacity),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <form
      className="catalog-form"
      onSubmit={(event) => {
        event.preventDefault();
        setPending(true);
        setError(undefined);
        void client
          .PATCH("/rings/{id}", {
            params: { path: { id: ring.id } },
            body: { version: ring.version, trainingCapacity: value === "" ? null : Number(value) },
          })
          .then(onSaved)
          .catch((cause: unknown) => {
            setError(
              isApiError(cause)
                ? t(`errors:${cause.code}`)
                : t("admin-settings:ringCapacity.saveError"),
            );
          })
          .finally(() => {
            setPending(false);
          });
      }}
    >
      <FormField
        id={`capacity-${ring.id}`}
        label={ring.name}
        help={t("admin-settings:ringCapacity.inherit")}
        {...(error === undefined ? {} : { error })}
      >
        <Input
          id={`capacity-${ring.id}`}
          value={value}
          type="number"
          min={1}
          max={20}
          onChange={(event) => {
            setValue(event.currentTarget.value);
          }}
        />
      </FormField>
      <Button type="submit" loading={pending} variant="secondary">
        {t("admin-settings:ringCapacity.save", { ring: ring.name })}
      </Button>
    </form>
  );
}
export function TrainingRingCapacities({ client }: { client: ApiClient }) {
  const { t } = useTranslation("admin-settings");
  const [rings, setRings] = useState<Ring[]>([]);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let current = true;
    void client.GET("/rings", { params: { query: { includeInactive: false } } }).then(
      (result) => {
        if (current) {
          setRings((result.data?.items ?? []).filter((ring) => ring.allowsFreeTraining));
          setError(false);
        }
      },
      () => {
        if (current) setError(true);
      },
    );
    return () => {
      current = false;
    };
  }, [client, reload]);
  return (
    <details>
      <summary>{t("admin-settings:ringCapacity.title")}</summary>
      {error ? <p role="alert">{t("admin-settings:ringCapacity.loadError")}</p> : null}
      {saved ? <p role="status">{t("admin-settings:ringCapacity.saved")}</p> : null}
      {rings.map((ring) => (
        <Capacity
          client={client}
          key={`${ring.id}-${String(ring.version)}`}
          ring={ring}
          onSaved={() => {
            setSaved(true);
            setReload((value) => value + 1);
          }}
        />
      ))}
    </details>
  );
}
