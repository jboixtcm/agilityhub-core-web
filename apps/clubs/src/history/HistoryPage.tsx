import { type ApiClient, type components, isApiError } from "@agilityhub/api-client";
import { type ClubFormats, useClubFormats } from "@agilityhub/i18n";
import { AppBar, Button, Card, IconButton, Skeleton, Toast, type Tone } from "@agilityhub/ui";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { DogChips, type DogChipLabels } from "../booking/DogChips";
import { errorText, navigateInApp, type Translate, useLoader } from "../booking/shared";
import { readErrorText, writeParam } from "../instructor/shared";

import "./history.css";
import { HistoryRow } from "./HistoryRow";

type HistoryItem = components["schemas"]["HistoryItem"];
type HistoryType = HistoryItem["type"];

const TYPES: readonly HistoryType[] = ["CLASS", "TRAINING", "ACTIVITY"];

const TONES: Readonly<Record<HistoryItem["state"], Tone>> = {
  CANCELLED: "neutral",
  CANCELLED_BY_CLUB: "danger",
  CANCELLED_LATE: "warning",
  DONE: "success",
  NO_SHOW: "danger",
};

/** `enums:historyState.*`: a done training is «fet», anything else done is «feta» (R-10-14). */
function badgeKey(item: HistoryItem): string {
  return item.type === "TRAINING" && item.state === "DONE" ? "DONE_TRAINING" : item.state;
}

/** «7:10» from «07:10»: the mockups print club times without a leading zero. */
function shortTime(value: string): string {
  return value.replace(/^0(?=\d:)/u, "");
}

/**
 * R-10-14's detail line, a pure mapping of what the api sent (`detail.kind`, `at`/`atLocal`,
 * `message`): the front never derives a reason. A kind this front does not know yet renders no
 * line (forward compatibility).
 */
export function historyDetail(
  t: Translate,
  formats: ClubFormats,
  item: HistoryItem,
): string | undefined {
  const detail = item.detail;
  if (detail == null) return undefined;
  const at = detail.at ?? undefined;
  const when =
    at === undefined
      ? undefined
      : {
          date: formats.formatDate(at, "dayMonthNumeric"),
          time: shortTime(detail.atLocal ?? formats.formatTime(at)),
        };
  switch (detail.kind) {
    case "NO_SHOW":
      return t("history:detail.noShow");
    case "BY_MEMBER":
      if (item.type === "TRAINING") return t("history:detail.trainingByMember");
      return when === undefined ? undefined : t("history:detail.byMemberLate", when);
    case "INSTRUCTOR_NOTICE":
      return when === undefined ? undefined : t("history:detail.noticeLate", when);
    case "BY_MEMBER_IN_TIME":
      return item.type === "TRAINING"
        ? t("history:detail.trainingByMember")
        : t("history:detail.byMemberInTime");
    case "INSTRUCTOR_NOTICE_IN_TIME":
      return t("history:detail.noticeInTime");
    case "BY_CLUB_ON_BEHALF":
      return t("history:detail.byClubOnBehalf");
    case "SYSTEM":
      return t("history:detail.system");
    case "BY_CLUB":
      return detail.message == null || detail.message === ""
        ? undefined
        : t("history:detail.byClub", { message: detail.message });
    default:
      return undefined;
  }
}

function typeLabel(t: Translate, type: HistoryType): string {
  if (type === "TRAINING") return t("history:types.TRAINING");
  if (type === "ACTIVITY") return t("history:types.ACTIVITY");
  return t("history:types.CLASS");
}

function initialType(): HistoryType | null {
  const value = new URLSearchParams(window.location.search).get("tipus");
  return TYPES.find((type) => type === value) ?? null;
}

function initialDog(): string | null {
  const value = new URLSearchParams(window.location.search).get("dogId");
  return value === null || value === "" ? null : value;
}

/**
 * Screen 25 «Històric» (`/historic?dogId=&tipus=`, S10 §2, R-10-14): the member's classes, free
 * trainings and activities of the last `monthsVisible` months as `GET /me/history` delivers them —
 * the dog chips with «Tots» by default (none with a single dog), the type chips the club's
 * modules allow, and one row per item with its badge and detail line. MEMBER and impersonated.
 */
export function HistoryPage({ client }: { client: ApiClient }) {
  const { t } = useTranslation(["history", "enums", "errors"]);
  const formats = useClubFormats();
  const [dogId, setDogId] = useState<string | null>(initialDog);
  const [type, setType] = useState<HistoryType | null>(initialType);
  const [dismissed, setDismissed] = useState<unknown>();
  const load = useCallback(async () => {
    const read = async (dog: string | null) => {
      const { data } = await client.GET("/me/history", {
        params: {
          query: { ...(dog === null ? {} : { dogId: dog }), ...(type === null ? {} : { type }) },
        },
      });
      if (data === undefined) throw new TypeError("The history response did not contain data");
      return data;
    };
    try {
      return { data: await read(dogId), refused: undefined, type };
    } catch (error) {
      // A dog outside the member's (404 DOG_NOT_ACCESSIBLE): say so and read «Tots» instead.
      if (dogId === null || !isApiError(error, "DOG_NOT_ACCESSIBLE")) throw error;
      return { data: await read(null), refused: error, type };
    }
  }, [client, dogId, type]);
  const history = useLoader(load);
  const refused = history.status === "ready" ? history.data.refused : undefined;
  // After a refusal the chips show «Tots», which is what was read.
  const selectedDog = refused === undefined ? dogId : null;
  useEffect(() => {
    if (refused !== undefined) writeParam("dogId", undefined);
  }, [refused]);
  // A type the club does not offer (`?tipus=` of a saved link, a module switched off since): no
  // chip could clear it, so it clears itself and «Tot» is read again (R-10-14, §9).
  const readType = history.status === "ready" ? history.data.type : null;
  const unsupported =
    history.status === "ready" && readType !== null && !history.data.data.types.includes(readType);
  if (unsupported && type !== null) setType(null);
  useEffect(() => {
    if (unsupported) writeParam("tipus", undefined);
  }, [unsupported]);

  const selectDog = (next: string | null) => {
    setDogId(next);
    writeParam("dogId", next ?? undefined);
  };
  const selectType = (next: HistoryType | null) => {
    setType(next);
    // After a refusal the next read is «Tots» too, not the refused dog again.
    if (refused !== undefined) setDogId(null);
    writeParam("tipus", next ?? undefined);
  };

  const back = () => {
    if (window.history.length > 1) window.history.back();
    else navigateInApp("/inici");
  };
  const bar = (
    <AppBar
      className="history-screen__bar"
      start={
        <IconButton
          className="history-screen__back"
          icon="chev"
          label={t("history:back")}
          onClick={back}
        />
      }
      title={<h1>{t("history:title")}</h1>}
    />
  );
  if (history.status !== "ready" || unsupported) {
    return (
      <section className="history-screen">
        {bar}
        {history.status !== "error" ? (
          <Skeleton height="18rem" label={t("history:loading")} />
        ) : (
          <Toast tone="danger">
            <span className="history-screen__error">
              {readErrorText(t, history.error, t("history:loadError"))}
              <Button
                onClick={() => {
                  history.refetch();
                }}
                variant="secondary"
              >
                {t("history:retry")}
              </Button>
            </span>
          </Toast>
        )}
      </section>
    );
  }

  const { data } = history.data;
  const dogLabels: DogChipLabels = {
    all: t("history:dogs.all"),
    groupDog: (values) => t("history:dogs.groupDog", values),
    groupDogNoLevel: (values) => t("history:dogs.groupDogNoLevel", values),
    label: t("history:dogs.label"),
    ownDog: (values) => t("history:dogs.ownDog", values),
  };

  return (
    <section className="history-screen">
      {bar}
      {refused === undefined || refused === dismissed ? null : (
        <Toast
          dismissLabel={t("history:close")}
          onDismiss={() => {
            setDismissed(refused);
          }}
          tone="danger"
        >
          {errorText(t, refused)}
        </Toast>
      )}
      {data.showDog ? (
        <DogChips
          dogs={data.dogs.map((dog) => ({
            id: dog.id,
            levelName: dog.levelCode ?? null,
            name: dog.name,
            own: dog.own,
            ownerFirstName: dog.ownerFirstName ?? null,
          }))}
          labels={dogLabels}
          onSelect={selectDog}
          selected={selectedDog}
          withAll
        />
      ) : null}
      {data.types.length > 1 ? (
        <div aria-label={t("history:types.label")} className="history-screen__chips" role="group">
          {[null, ...data.types].map((item) => (
            <button
              aria-pressed={item === type}
              className="history-screen__type"
              key={item ?? "all"}
              onClick={() => {
                if (item !== type) selectType(item);
              }}
              type="button"
            >
              {item === null ? t("history:types.all") : typeLabel(t, item)}
            </button>
          ))}
        </div>
      ) : null}
      <p className="history-screen__window">
        {t("history:window", { months: data.monthsVisible })}
      </p>
      {data.items.length === 0 ? (
        <Card>
          <p>{t("history:empty")}</p>
        </Card>
      ) : (
        <ul aria-label={t("history:list")} className="history-screen__list">
          {data.items.map((item) => (
            <li key={`${item.type}-${item.id}`}>
              <HistoryRow
                badge={{
                  label: t(`enums:historyState.${badgeKey(item)}`),
                  tone: TONES[item.state],
                }}
                date={formats.formatActivityDate(
                  item.startsAtLocal ?? item.date,
                  null,
                  null,
                  "history",
                )}
                detail={historyDetail(t, formats, item)}
                title={
                  data.showDog && item.dogName != null
                    ? t("history:withDog", { dog: item.dogName, title: item.title })
                    : item.title
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
