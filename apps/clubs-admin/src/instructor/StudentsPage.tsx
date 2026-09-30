import { type ApiClient, studentSearchGuide, useStudentSearch } from "@agilityhub/api-client";
import { useFollowupTexts } from "@agilityhub/i18n";
import { Button, Card, Icon, Input, Skeleton, Toast } from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import "./student-record.css";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * «Alumnes» of the back office's sidebar (mockups D12, D13 and D14; no mockup of its own, S10
 * §13-9): the same instructor search as the app's (`GET /dogs?q=&filter=status:eq:ACTIVE`, page by
 * page); each row opens D13.
 */
export function StudentsPage({
  client,
  onNavigate,
}: {
  client: ApiClient;
  onNavigate: (path: string) => void;
}) {
  const { t } = useTranslation(["instructor", "errors"]);
  const texts = useFollowupTexts();
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
    <section className="students-page">
      <h1>{t("instructor:students.title")}</h1>
      <label className="students-page__search">
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
      {dogs.loading ? <Skeleton height="12rem" label={t("instructor:students.loading")} /> : null}
      {dogs.firstFailed ? (
        <Toast tone="danger">
          <span className="student-record__error">
            {texts.errorText(dogs.error, loadError)}
            <Button onClick={dogs.retry} variant="secondary">
              {t("instructor:students.retry")}
            </Button>
          </span>
        </Toast>
      ) : null}
      {dogs.loading || dogs.firstFailed ? null : dogs.items.length === 0 ? (
        <Card>
          <p>{t("instructor:students.empty")}</p>
        </Card>
      ) : (
        <Card>
          <ul className="students-page__list">
            {dogs.items.map((dog) => {
              const path = `/alumnes/${encodeURIComponent(dog.id)}`;
              // R-10-00: the guide, else the owner's first name the api sends (E5-T29).
              const { guide, ownerFullName } = studentSearchGuide(dog);
              const name = t("instructor:student.name", { dog: dog.name ?? "", handler: guide });
              return (
                <li key={dog.id}>
                  <a
                    href={path}
                    onClick={(event) => {
                      event.preventDefault();
                      onNavigate(path);
                    }}
                  >
                    <span>
                      {dog.level === undefined
                        ? name
                        : t("instructor:student.withLevel", { level: dog.level.code, name })}
                      {ownerFullName === undefined ? null : (
                        <>
                          {" "}
                          <span className="students-page__owner">
                            {t("instructor:student.owner", { name: ownerFullName })}
                          </span>
                        </>
                      )}
                    </span>
                    <Icon aria-hidden="true" name="chev" />
                  </a>
                </li>
              );
            })}
          </ul>
          {dogs.error === undefined ? null : (
            <p className="student-record__error" role="alert">
              {texts.errorText(dogs.error, loadError)}
            </p>
          )}
          {dogs.hasMore ? (
            <Button
              className="students-page__more"
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
