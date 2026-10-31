import {
  type ApiClient,
  isApiError,
  studentSearchGuide,
  useStudentSearch,
} from "@agilityhub/api-client";
import { useFollowupTexts } from "@agilityhub/i18n";
import {
  Badge,
  Button,
  Card,
  DogPhoto,
  EmptyState,
  Icon,
  IconButton,
  Input,
  Skeleton,
  Toast,
} from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import "./student-record.css";
import "./students-page.css";

const SEARCH_DEBOUNCE_MS = 300;
const VIEW_STORAGE_KEY = "agilityhub.students.view";
type StudentView = "grid" | "list";

function readView(): StudentView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

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
  const { t, i18n } = useTranslation(["instructor", "errors"]);
  const texts = useFollowupTexts();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name,asc" | "ownerLastName,asc">("name,asc");
  const [levelId, setLevelId] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | "ALL">("ACTIVE");
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
          setLevelId("");
        } else setLevelsError(true);
      },
    );
    return () => {
      current = false;
    };
  }, [client, i18n.resolvedLanguage, levelsRetry]);
  const [view, setView] = useState<StudentView>(readView);
  function changeView(nextView: StudentView) {
    setView(nextView);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, nextView);
    } catch {
      // The layout still works when the browser disallows persistent storage.
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(text.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [text]);
  const dogs = useStudentSearch(client, query, sort, { levelId, status });
  const loadError = t("instructor:students.loadError");

  return (
    <section className="students-page">
      <h1>{t("instructor:students.title")}</h1>
      <div className="students-page__toolbar">
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
        <div
          aria-label={t("instructor:students.view")}
          className="students-page__view"
          role="group"
        >
          <IconButton
            aria-pressed={view === "grid"}
            icon="grid"
            label={t("instructor:students.gridView")}
            onClick={() => {
              changeView("grid");
            }}
            title={t("instructor:students.gridView")}
          />
          <Button
            aria-label={t("instructor:students.listView")}
            aria-pressed={view === "list"}
            className="ah-icon-button"
            onClick={() => {
              changeView("list");
            }}
            title={t("instructor:students.listView")}
            variant="ghost"
          >
            <svg aria-hidden="true" className="ah-icon" viewBox="0 0 24 24">
              <path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1" />
            </svg>
          </Button>
        </div>
      </div>
      <div className="students-page__tools">
        <p className="students-page__hint">{t("instructor:students.searchHint")}</p>
        <div className="students-page__filters">
          {levelsUnavailable ? null : (
            <label className="students-page__sort">
              <span>{t("instructor:students.level")}</span>
              <select
                value={levelId}
                onChange={(event) => {
                  setLevelId(event.currentTarget.value);
                }}
              >
                <option value="">{t("instructor:students.allLevels")}</option>
                {levels.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="students-page__sort">
            <span>{t("instructor:students.status")}</span>
            <select
              value={status}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setStatus(value === "ALL" || value === "INACTIVE" ? value : "ACTIVE");
              }}
            >
              <option value="ACTIVE">{t("instructor:students.active")}</option>
              <option value="INACTIVE">{t("instructor:students.inactive")}</option>
              <option value="ALL">{t("instructor:students.allStatuses")}</option>
            </select>
          </label>
          <label className="students-page__sort">
            <span>{t("instructor:students.sort")}</span>
            <select
              onChange={(event) => {
                setSort(
                  event.currentTarget.value === "ownerLastName,asc"
                    ? "ownerLastName,asc"
                    : "name,asc",
                );
              }}
              value={sort}
            >
              <option value="name,asc">{t("instructor:students.sortDog")}</option>
              <option value="ownerLastName,asc">{t("instructor:students.sortMember")}</option>
            </select>
          </label>
          <Button
            variant="ghost"
            onClick={() => {
              setText("");
              setQuery("");
              setLevelId("");
              setStatus("ACTIVE");
            }}
          >
            {t("instructor:students.resetFilters")}
          </Button>
        </div>
      </div>
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
          <EmptyState icon="search" title={t("instructor:students.empty")} />
        </Card>
      ) : (
        <div className="students-page__results">
          <ul className={`students-page__items students-page__items--${view}`}>
            {dogs.items.map((dog) => {
              const path = `/alumnes/${encodeURIComponent(dog.id)}`;
              // R-10-00: the guide, else the owner's first name the api sends (E5-T29).
              const { guide, ownerFullName } = studentSearchGuide(dog);
              const name = t("instructor:student.name", { dog: dog.name ?? "", handler: guide });
              const nameWithLevel =
                dog.level === undefined
                  ? name
                  : t("instructor:student.withLevel", { level: dog.level.code, name });
              const owner =
                ownerFullName === undefined
                  ? undefined
                  : t("instructor:student.owner", { name: ownerFullName });
              return (
                <li key={dog.id}>
                  <a
                    aria-label={[nameWithLevel, owner].filter(Boolean).join(" ")}
                    className="students-page__student"
                    href={path}
                    onClick={(event) => {
                      event.preventDefault();
                      onNavigate(path);
                    }}
                  >
                    <DogPhoto
                      name={dog.name ?? ""}
                      size={view === "grid" ? "large" : "small"}
                      src={dog.photoUrl}
                    />
                    <span className="students-page__identity">
                      <span className="students-page__name">{name}</span>
                      {owner === undefined ? null : (
                        <span className="students-page__owner">{owner}</span>
                      )}
                    </span>
                    {dog.level === undefined ? null : (
                      <Badge className="students-page__level">
                        {t("instructor:card.headerLevelCode", { code: dog.level.code })}
                      </Badge>
                    )}
                    {dog.displayStatus?.kind === "INACTIVE" ? (
                      <Badge>{t("instructor:students.inactiveStudent")}</Badge>
                    ) : null}
                    {view === "list" ? <Icon aria-hidden="true" name="chev" /> : null}
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
        </div>
      )}
    </section>
  );
}
