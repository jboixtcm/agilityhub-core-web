import { type ApiClient } from "@agilityhub/api-client";
import { Button, Skeleton, useBranding } from "@agilityhub/ui";
import { useTranslation } from "react-i18next";

import { clubToday, useTrainingEligibility, useTrainingSummary } from "./shared";

function Counter({ client, dogId, name }: { client: ApiClient; dogId: string; name: string }) {
  const { t } = useTranslation("training");
  const branding = useBranding();
  const result = useTrainingSummary(client, dogId, clubToday(branding.timeZone));
  return (
    <div className="home-training__counter">
      <strong>{name}</strong>
      {result.status === "loading" ? (
        <Skeleton label={t("training:loading")} />
      ) : result.status === "error" ? (
        <Button
          variant="ghost"
          onClick={() => {
            result.refetch();
          }}
        >
          {t("training:retry")}
        </Button>
      ) : (
        <>
          <p>
            {t("training:home.used", {
              used: result.data.counter.used,
              limit: result.data.counter.limit,
            })}
          </p>
          <p>{t("training:home.remaining", { count: result.data.counter.remaining })}</p>
          {result.stale ? <p role="status">{t("training:home.stale")}</p> : null}
        </>
      )}
    </div>
  );
}

export function HomeTrainingSummary({
  client,
  dogId,
}: {
  client: ApiClient;
  dogId: string | null;
}) {
  const { t } = useTranslation("training");
  const branding = useBranding();
  const enabled = branding.modules.includes("FREE_TRAINING");
  const eligibility = useTrainingEligibility(client, enabled);
  if (!enabled || eligibility.status !== "ready") return null;
  const data = eligibility.data;
  const dogs = data.eligibleDogs.filter((dog) => dogId === null || dog.id === dogId);
  const displayed = data.limitUnit === "MEMBER" ? dogs.slice(0, 1) : dogs;
  if (displayed.length === 0) return null;
  return (
    <section className="home-training" aria-label={t("training:home.title")}>
      <h2>{t("training:home.title")}</h2>
      {displayed.map((dog) => (
        <Counter
          key={dog.id}
          client={client}
          dogId={dog.id}
          name={data.limitUnit === "MEMBER" ? t("training:home.member") : dog.name}
        />
      ))}
    </section>
  );
}
