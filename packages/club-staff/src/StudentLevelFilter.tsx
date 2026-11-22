import { type ApiClient, isApiError } from "@agilityhub/api-client";
import { Button, Select, Toast } from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function StudentLevelFilter({
  client,
  levelId,
  onChange,
  className,
}: {
  client: ApiClient;
  levelId: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const { t, i18n } = useTranslation("instructor");
  const [levels, setLevels] = useState<{ label: string; value: string }[]>([]);
  const [levelsError, setLevelsError] = useState(false);
  const [levelsUnavailable, setLevelsUnavailable] = useState(false);
  const [levelsRetry, setLevelsRetry] = useState(0);
  useEffect(() => {
    let current = true;
    void client.GET("/dogs/filter-values", { params: { query: { field: "levelId" } } }).then(
      ({ data }) => {
        if (!current) return;
        if (data === undefined) {
          setLevelsError(true);
          return;
        }
        setLevelsError(false);
        setLevelsUnavailable(false);
        setLevels(
          data.values
            .flatMap((item) =>
              typeof item.value === "string" ? [{ label: item.label, value: item.value }] : [],
            )
            .sort((a, b) =>
              a.label.localeCompare(b.label, i18n.resolvedLanguage, { numeric: true }),
            ),
        );
      },
      (error: unknown) => {
        if (!current) return;
        if (isApiError(error) && error.code === "INVALID_FILTER") {
          // The API removes this facet when the club disables levels.
          setLevelsUnavailable(true);
          onChange("");
        } else setLevelsError(true);
      },
    );
    return () => {
      current = false;
    };
  }, [client, i18n.resolvedLanguage, levelsRetry, onChange]);
  return (
    <>
      {levelsUnavailable ? null : (
        <label className={className}>
          <span>{t("instructor:students.level")}</span>
          <Select
            value={levelId}
            onChange={(event) => {
              onChange(event.currentTarget.value);
            }}
          >
            <option value="">{t("instructor:students.allLevels")}</option>
            {levels.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </Select>
        </label>
      )}
      {levelsError ? (
        <Toast tone="danger">
          {t("instructor:students.levelsLoadError")}
          <Button
            variant="secondary"
            onClick={() => {
              setLevelsRetry((value) => value + 1);
            }}
          >
            {t("instructor:students.retry")}
          </Button>
        </Toast>
      ) : null}
    </>
  );
}
