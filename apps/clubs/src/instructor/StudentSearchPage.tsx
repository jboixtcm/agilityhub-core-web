import { type ApiClient, useStudentSearch } from "@agilityhub/api-client";
import { AppBar, Button, Card, Icon, Input, Skeleton, Toast } from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { navigateInApp } from "../booking/shared";

import "./instructor.css";
import { readErrorText, studentName } from "./shared";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * The instructor's student search (`/instructor/alumnes`, S10 §2 «Alumnes (sense mockup)», §13-9):
 * `GET /dogs?q=&filter=status:eq:ACTIVE` in the instructor's projection, page by page; each row
 * opens 22. The api searches; the list is never filtered here.
 */
export function StudentSearchPage({ client }: { client: ApiClient }) {
  const { t } = useTranslation(["instructor", "errors"]);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(text.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [text]);

  const dogs = useStudentSearch(client, query);
  const loadError = t("instructor:students.loadError");

  return (
    <section className="instructor-screen instructor-students">
      <AppBar
        className="instructor-screen__bar"
        title={<h1>{t("instructor:students.title")}</h1>}
      />
      <label className="instructor-students__search">
        <Icon aria-hidden="true" name="search" />
        <span className="ah-sr-only">{t("instructor:students.search")}</span>
        <Input
          onChange={(event) => {
            setText(event.currentTarget.value);
          }}
          placeholder={t("instructor:students.search")}
          type="search"
          value={text}
        />
      </label>
      {dogs.loading ? (
        <Skeleton
          className="instructor-screen__skeleton"
          height="12rem"
          label={t("instructor:students.loading")}
        />
      ) : null}
      {dogs.firstFailed ? (
        <Toast tone="danger">
          <span className="instructor-screen__error">
            {readErrorText(t, dogs.error, loadError)}
            <Button onClick={dogs.retry} variant="secondary">
              {t("instructor:students.retry")}
            </Button>
          </span>
        </Toast>
      ) : null}
      {dogs.loading || dogs.firstFailed ? null : dogs.items.length === 0 ? (
        <Card className="instructor-day__empty">
          <p>{t("instructor:students.empty")}</p>
        </Card>
      ) : (
        <Card className="instructor-students__list">
          <ul>
            {dogs.items.map((dog) => {
              const path = `/instructor/alumnes/${encodeURIComponent(dog.id)}`;
              // R-10-00: the guide, else the owner's first name (the list carries the full name).
              const name = studentName(t, {
                dogName: dog.name ?? "",
                handlerName: dog.handlerName,
                memberFirstName: dog.owner?.fullName.split(" ")[0] ?? "",
              });
              return (
                <li key={dog.id}>
                  <a
                    href={path}
                    onClick={(event) => {
                      event.preventDefault();
                      navigateInApp(path);
                    }}
                  >
                    <span>
                      {dog.level === undefined
                        ? name
                        : t("instructor:student.withLevel", { level: dog.level.code, name })}
                    </span>
                    <Icon aria-hidden="true" name="chev" />
                  </a>
                </li>
              );
            })}
          </ul>
          {dogs.error === undefined ? null : (
            // The next page failed: the rows read so far stay, «Mostra'n més» asks it again.
            <p className="instructor-students__error" role="alert">
              {readErrorText(t, dogs.error, loadError)}
            </p>
          )}
          {dogs.hasMore ? (
            <Button
              className="instructor-students__more"
              loading={dogs.pending}
              loadingLabel={t("instructor:students.loading")}
              onClick={() => void dogs.more()}
              variant="secondary"
            >
              {t("instructor:students.more")}
            </Button>
          ) : null}
        </Card>
      )}
    </section>
  );
}
