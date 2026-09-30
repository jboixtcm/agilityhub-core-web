import { type ApiClient, type FollowupTask, useDogFollowup } from "@agilityhub/api-client";
import { useFollowupTexts } from "@agilityhub/i18n";
import {
  AppBar,
  Button,
  DogFollowupEditor,
  FollowupHistoryDrawer,
  IconButton,
  Skeleton,
  Toast,
} from "@agilityhub/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { navigateInApp } from "../booking/shared";

import "./instructor.css";
import { readErrorText, studentName } from "./shared";

/**
 * Screen 26 «Tasques i notes» (`/instructor/alumnes/:dogId/tasques`, S10 §2, R-10-10…R-10-12):
 * the shared follow-up editor — the private observations with their clips and [DESA] (a 409 keeps
 * the typed text to recover), the tasks with «＋ Afegir», the pencil, the ✕, completion and
 * reopening and their signed-url attachments, the full history in a drawer, and the member's note
 * read-only. INSTRUCTOR and ADMIN, never an impersonation (the route refuses it); TASKS off
 * redirects to 22 (the route too).
 */
export function TasksPage({ client, dogId }: { client: ApiClient; dogId: string }) {
  const { t } = useTranslation(["instructor", "errors"]);
  const followup = useDogFollowup(client, dogId, { tasks: true });
  const texts = useFollowupTexts<FollowupTask>();
  const [history, setHistory] = useState(false);
  const back = () => {
    if (window.history.length > 1) window.history.back();
    else navigateInApp(`/instructor/alumnes/${encodeURIComponent(dogId)}`);
  };
  const { card } = followup;
  const title =
    card.status === "ready"
      ? t("instructor:tasks.title", {
          name: studentName(t, {
            dogName: card.data.dog.name,
            handlerName: card.data.dog.handlerName,
            memberFirstName: card.data.member.firstName,
          }),
        })
      : t("instructor:tasks.heading");
  return (
    <section className="instructor-screen instructor-tasks">
      <AppBar
        className="instructor-screen__bar"
        start={
          <IconButton
            className="instructor-screen__back"
            icon="chev"
            label={t("instructor:tasks.back")}
            onClick={back}
          />
        }
        title={<h1>{title}</h1>}
      />
      {card.status === "loading" ? (
        <Skeleton
          className="instructor-screen__skeleton"
          height="20rem"
          label={t("instructor:tasks.loading")}
        />
      ) : card.status === "error" ? (
        <Toast tone="danger">
          <span className="instructor-screen__error">
            {readErrorText(t, card.error, t("instructor:card.loadError"))}
            <Button onClick={followup.reloadCard} variant="secondary">
              {t("instructor:tasks.retry")}
            </Button>
          </span>
        </Toast>
      ) : (
        <DogFollowupEditor<FollowupTask>
          dogId={dogId}
          model={followup}
          onHistory={() => {
            setHistory(true);
          }}
          texts={texts}
        />
      )}
      {history ? (
        <FollowupHistoryDrawer<FollowupTask>
          model={followup}
          onClose={() => {
            setHistory(false);
          }}
          texts={texts}
        />
      ) : null}
    </section>
  );
}
