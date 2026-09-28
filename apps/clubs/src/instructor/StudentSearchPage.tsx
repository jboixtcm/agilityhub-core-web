import type { ApiClient } from "@agilityhub/api-client";
import { AppBar, Button, Card, Icon, Input, Skeleton, Toast } from "@agilityhub/ui";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { navigateInApp, useLoader } from "../booking/shared";

import "./instructor.css";
import { studentName } from "./shared";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * The instructor's student search (`/instructor/alumnes`, S10 §2 «Alumnes (sense mockup)», §13-9):
 * `GET /dogs?q=&filter=status:eq:ACTIVE` in the instructor's projection; each row opens 22. The
 * api searches; the list is never filtered here.
 */
export function StudentSearchPage({ client }: { client: ApiClient }) {
  const { t } = useTranslation(["instructor"]);
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

  const load = useCallback(async () => {
    const { data } = await client.GET("/dogs", {
      params: {
        query: {
          fields: "id,name,handlerName,owner,level",
          filter: ["status:eq:ACTIVE"],
          size: 50,
          sort: ["name,asc"],
          ...(query === "" ? {} : { q: query }),
        },
      },
    });
    if (data === undefined) throw new TypeError("The dogs response did not contain data");
    return data;
  }, [client, query]);
  const dogs = useLoader(load);

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
      {dogs.status === "loading" ? (
        <Skeleton
          className="instructor-screen__skeleton"
          height="12rem"
          label={t("instructor:students.loading")}
        />
      ) : null}
      {dogs.status === "error" ? (
        <Toast tone="danger">
          <span className="instructor-screen__error">
            {t("instructor:students.loadError")}
            <Button
              onClick={() => {
                dogs.refetch();
              }}
              variant="secondary"
            >
              {t("instructor:students.retry")}
            </Button>
          </span>
        </Toast>
      ) : null}
      {dogs.status !== "ready" ? null : dogs.data.items.length === 0 ? (
        <Card className="instructor-day__empty">
          <p>{t("instructor:students.empty")}</p>
        </Card>
      ) : (
        <Card className="instructor-students__list">
          <ul>
            {dogs.data.items.map((dog) => {
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
        </Card>
      )}
    </section>
  );
}
