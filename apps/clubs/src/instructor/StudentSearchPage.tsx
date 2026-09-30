import type { ApiClient, components } from "@agilityhub/api-client";
import { AppBar, Button, Card, Icon, Input, Skeleton, Toast } from "@agilityhub/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { navigateInApp } from "../booking/shared";

import "./instructor.css";
import { readErrorText, studentName } from "./shared";

type DogListItem = components["schemas"]["DogListItem"];

const SEARCH_DEBOUNCE_MS = 300;
/** CONVENCIONS_API §4: the list's page size; «Mostra'n més» reads the next page. */
const PAGE_SIZE = 50;

interface SearchPages {
  /** A failed first page (the screen's error) or a failed next page (the rows stay). */
  error?: unknown;
  items: DogListItem[];
  /** The query (and retry) these pages answer. */
  key: string;
  /** Pages read so far. */
  loaded: number;
  /** The next page is being read. */
  pending: boolean;
  totalPages: number;
}

/**
 * The pages of `GET /dogs` for one query, read one after another (CONVENCIONS_API §4, as the
 * universal lists do): the first when the query settles, each next one on `more()`, appended. An
 * answer for another query than the one on screen is dropped.
 */
function useSearchPages(client: ApiClient, query: string) {
  const [reload, setReload] = useState(0);
  const requestKey = `${query}|${String(reload)}`;
  const [pages, setPages] = useState<SearchPages>({
    items: [],
    key: "",
    loaded: 0,
    pending: false,
    totalPages: 0,
  });
  // One next page at a time, also for a second tap before the next render.
  const reading = useRef(false);

  const readPage = useCallback(
    async (page: number) => {
      const { data } = await client.GET("/dogs", {
        params: {
          query: {
            fields: "id,name,handlerName,owner,level",
            filter: ["status:eq:ACTIVE"],
            page,
            size: PAGE_SIZE,
            sort: ["name,asc"],
            ...(query === "" ? {} : { q: query }),
          },
        },
      });
      if (data === undefined) throw new TypeError("The dogs response did not contain data");
      return data;
    },
    [client, query],
  );

  useEffect(() => {
    let current = true;
    readPage(0).then(
      (data) => {
        if (!current) return;
        setPages({
          items: data.items,
          key: requestKey,
          loaded: 1,
          pending: false,
          totalPages: data.totalPages,
        });
      },
      (error: unknown) => {
        if (!current) return;
        setPages({ error, items: [], key: requestKey, loaded: 0, pending: false, totalPages: 0 });
      },
    );
    return () => {
      current = false;
    };
  }, [readPage, requestKey]);

  const ready = pages.key === requestKey;
  const more = async () => {
    if (!ready || reading.current || pages.loaded >= pages.totalPages) return;
    reading.current = true;
    const forKey = requestKey;
    const page = pages.loaded;
    setPages((value) => ({ ...value, error: undefined, pending: true }));
    try {
      const data = await readPage(page);
      setPages((value) => {
        if (value.key !== forKey) return value;
        const known = new Set(value.items.map((item) => item.id));
        return {
          ...value,
          items: [...value.items, ...data.items.filter((item) => !known.has(item.id))],
          loaded: page + 1,
          pending: false,
          totalPages: data.totalPages,
        };
      });
    } catch (error) {
      setPages((value) => (value.key === forKey ? { ...value, error, pending: false } : value));
    } finally {
      reading.current = false;
    }
  };

  return {
    error: ready ? pages.error : undefined,
    firstFailed: ready && pages.loaded === 0 && pages.error !== undefined,
    hasMore: ready && pages.loaded > 0 && pages.loaded < pages.totalPages,
    items: ready ? pages.items : [],
    loading: !ready,
    more,
    pending: ready && pages.pending,
    retry: () => {
      setReload((value) => value + 1);
    },
  };
}

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

  const dogs = useSearchPages(client, query);
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
