import { type ApiClient, isApiError } from "@agilityhub/api-client";
import {
  Button,
  Card,
  Icon,
  resolveBrandingLogo,
  Skeleton,
  Toast,
  useBranding,
} from "@agilityhub/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ActivityReservationRow } from "../activities/ActivityReservationRow";
import { useMeActivities } from "../activities/shared";

import "./booking.css";
import { DogChips } from "./DogChips";
import { ReservationRow } from "./ReservationRow";
import { noticeText, pageNotice, type PageNotice, useMeHome } from "./shared";

/**
 * Screen 03 «Inici» (`/inici`, S08 §2): the greeting and the bell, the dog filter («Tots» last,
 * by default with more than one dog), the week counters without a maximum, «Les meves reserves»
 * as the api delivers them (chronological, future only) and the history link. Nothing here is
 * computed: rows, counters and instructor visibility come from `GET /me/home`.
 */
export function HomePage({ client }: { client: ApiClient }) {
  const { t } = useTranslation(["home", "booking", "enums", "errors"]);
  const branding = useBranding();
  const [dogId, setDogId] = useState<string | null>(null);
  const home = useMeHome(client, dogId);
  const activitiesEnabled = branding.modules.includes("ACTIVITIES");
  // S07 rows keep E4-W04's `ActivityReservationRow`: its registration comes from `mine[]`.
  const activities = useMeActivities(client, activitiesEnabled);
  const [notice, setNotice] = useState<PageNotice | undefined>(pageNotice);
  const logo = resolveBrandingLogo(branding.theme, { placement: "compact" });

  const header = (firstName: string | undefined, unread: number) => (
    <header className="home-header">
      {logo.kind === "initial" ? (
        <span aria-hidden="true" className="home-header__mark">
          {branding.club.name.charAt(0)}
        </span>
      ) : (
        <img alt={branding.club.name} className="home-header__logo" src={logo.src} />
      )}
      <h1>{firstName === undefined ? null : t("home:greeting", { firstName })}</h1>
      <a
        aria-label={t("home:notifications", { count: unread })}
        className="home-header__bell"
        href="/notificacions"
      >
        <Icon
          aria-hidden="true"
          className={
            unread > 0
              ? "home-header__bell-icon home-header__bell-icon--ringing"
              : "home-header__bell-icon"
          }
          name="bell"
        />
        {unread > 0 ? <span aria-hidden="true" className="home-header__dot" /> : null}
      </a>
    </header>
  );

  if (home.status === "loading") {
    return (
      <section className="booking-screen">
        {header(undefined, 0)}
        <Skeleton height="12rem" label={t("home:reservations.loading")} />
      </section>
    );
  }
  if (home.status === "error") {
    const error = home.error;
    return (
      <section className="booking-screen">
        {header(undefined, 0)}
        <Card className="booking-error" role="alert">
          <p>{t("home:reservations.error")}</p>
          <Button
            onClick={() => {
              // A dog that left the group answers 404 DOG_NOT_ACCESSIBLE: back to «Tots».
              if (dogId !== null && isApiError(error, "DOG_NOT_ACCESSIBLE")) setDogId(null);
              else home.refetch();
            }}
            variant="secondary"
          >
            {t("home:reservations.retry")}
          </Button>
        </Card>
      </section>
    );
  }

  const data = home.data;
  // The rows of another dog stay on screen until the new ones land (an older answer is dropped).
  const busy = (data.selectedDogId ?? null) !== dogId;
  const mine = activities.status === "ready" ? activities.data.mine : [];
  return (
    <section className="booking-screen">
      {header(data.member.firstName, data.notifications.unreadCount)}
      {notice === undefined ? null : (
        <Toast
          dismissLabel={t("booking:confirm.close")}
          onDismiss={() => {
            setNotice(undefined);
          }}
          tone={notice.tone}
        >
          {noticeText(t, notice)}
        </Toast>
      )}
      <DogChips dogs={data.dogs} onSelect={setDogId} selected={dogId} withAll />
      <Card aria-label={t("home:limits.label")} className="home-limits" role="group">
        <p className="home-limits__item">
          <strong className="home-limits__count home-limits__count--current">
            {String(data.limits.currentWeek.count)}
          </strong>
          <span className="home-limits__label">
            {t("home:limits.currentWeek", { count: data.limits.currentWeek.count })}
          </span>
        </p>
        <span aria-hidden="true" className="home-limits__divider" />
        <p className="home-limits__item">
          <strong className="home-limits__count">
            {t("home:limits.nextWeekCount", { count: data.limits.nextWeek.count })}
          </strong>
          <span className="home-limits__label">
            {t("home:limits.nextWeek", { count: data.limits.nextWeek.count })}
          </span>
        </p>
      </Card>
      <section
        aria-busy={busy || undefined}
        aria-labelledby="home-reservations-title"
        className="booking-section"
      >
        <h2 className="booking-section__title" id="home-reservations-title">
          {t("home:reservations.title")}
        </h2>
        {data.reservations.length === 0 ? (
          <Card className="home-empty">
            <p>{t("home:reservations.empty")}</p>
            <a className="ah-button ah-button--primary" href="/reservar">
              {t("home:reservations.bookClass")}
            </a>
          </Card>
        ) : (
          data.reservations.map((row) => {
            if (row.type === "ACTIVITY") {
              const registration = mine.find((item) => item.id === row.id);
              if (registration !== undefined) {
                return <ActivityReservationRow key={row.id} registration={registration} />;
              }
            }
            return <ReservationRow key={`${row.type}-${row.id}`} row={row} />;
          })
        )}
      </section>
      <a className="home-history" href="/historic">
        {t("home:history.link", { months: data.history.monthsVisible })}
      </a>
    </section>
  );
}
