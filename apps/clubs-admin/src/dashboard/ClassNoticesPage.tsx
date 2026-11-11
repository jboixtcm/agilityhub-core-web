import { type ApiClient, type components, isApiError } from "@agilityhub/api-client";
import { useClubFormats } from "@agilityhub/i18n";
import { Badge, Button, Card, Icon, Skeleton } from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type Notice = components["schemas"]["ClassNoticeItem"];
type NoticePage = components["schemas"]["ClassNoticePage"];
export const CLASS_NOTICES_PATH = "/avisos-classes";

function useClassNotices(client: ApiClient, today: boolean, page: number, size: number) {
  const key = `${String(today)}:${String(page)}:${String(size)}`;
  const [result, setResult] = useState<{ key: string; data?: NoticePage; error?: unknown }>();
  const [request, setRequest] = useState(0);
  useEffect(() => {
    let active = true;
    let generation = 0;
    const load = async () => {
      const current = ++generation;
      try {
        const { data } = await client.GET("/class-notices", {
          params: { query: { today, page, size } },
        });
        if (data === undefined) throw new TypeError("Missing class notices");
        if (active && current === generation) setResult({ key, data });
      } catch (error) {
        if (active && current === generation) setResult({ key, error });
      }
    };
    void load();
    const onFocus = () => {
      void load();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [client, key, page, request, size, today]);
  return {
    data: result?.key === key ? result.data : undefined,
    error: result?.key === key ? result.error : undefined,
    retry: () => {
      setRequest((value) => value + 1);
    },
  };
}

function NoticeRows({ items }: { items: Notice[] }) {
  const formats = useClubFormats();
  const { t } = useTranslation("admin-dashboard");
  return (
    <ul className="class-notices__list">
      {items.map((item) => {
        const cancelled = item.code === "N-17" || item.code === "N-08a";
        return (
          <li className="class-notices__row dashboard-risk__row" key={item.id}>
            <time dateTime={item.createdAt}>
              {formats.formatDate(item.createdAt, "short")} · {formats.formatTime(item.createdAt)}
            </time>
            <div className="class-notices__class">
              <strong>{item.classDescription || item.title}</strong>
              <span>
                {[item.classDate, item.classTime, item.ringName].filter(Boolean).join(" · ")}
              </span>
              {item.classDescription === "" ? <p>{item.body}</p> : null}
            </div>
            <Badge tone={cancelled ? "danger" : "warning"}>
              {cancelled
                ? t("admin-dashboard:classNotices.cancelled")
                : item.code === "N-54"
                  ? t("admin-dashboard:classNotices.below")
                  : t("admin-dashboard:classNotices.risk")}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

function NoticeLoadState({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useTranslation(["admin-dashboard", "errors"]);
  return error === undefined ? (
    <Skeleton label={t("admin-dashboard:classNotices.loading")} />
  ) : (
    <p role="alert">
      {isApiError(error)
        ? t(`errors:${error.code}`, { defaultValue: t("admin-dashboard:classNotices.error") })
        : t("admin-dashboard:classNotices.error")}{" "}
      <Button onClick={retry} variant="ghost">
        {t("admin-dashboard:common.retry")}
      </Button>
    </p>
  );
}

export function ClassNoticesCard({
  client,
  onNavigate,
}: {
  client: ApiClient;
  onNavigate: (path: string) => void;
}) {
  const { t } = useTranslation("admin-dashboard");
  const { data, error, retry } = useClassNotices(client, true, 0, 6);
  return (
    <Card className="dashboard-risk">
      <header className="dashboard-risk__header">
        <h2>
          <Icon aria-hidden="true" name="warn" /> {t("admin-dashboard:classNotices.title")}
        </h2>
        {data === undefined ? null : (
          <Badge tone={data.totalItems > 0 ? "warning" : "neutral"}>
            {t("admin-dashboard:classNotices.today", { count: data.totalItems })}
          </Badge>
        )}
      </header>
      {data === undefined ? (
        <NoticeLoadState error={error} retry={retry} />
      ) : data.items.length === 0 ? (
        <p>{t("admin-dashboard:classNotices.emptyToday")}</p>
      ) : (
        <NoticeRows items={data.items} />
      )}
      <a
        className="dashboard-risk__more"
        href={CLASS_NOTICES_PATH}
        onClick={(event) => {
          event.preventDefault();
          onNavigate(CLASS_NOTICES_PATH);
        }}
      >
        {t("admin-dashboard:classNotices.more")}
      </a>
    </Card>
  );
}

export function ClassNoticesPage({
  client,
  onNavigate,
}: {
  client: ApiClient;
  onNavigate: (path: string) => void;
}) {
  const { t } = useTranslation("admin-dashboard");
  const [page, setPage] = useState(0);
  const { data, error, retry } = useClassNotices(client, false, page, 20);
  return (
    <div className="class-notices-page">
      <a
        href="/tauler"
        onClick={(event) => {
          event.preventDefault();
          onNavigate("/tauler");
        }}
      >
        {t("admin-dashboard:classNotices.back")}
      </a>
      <h1>{t("admin-dashboard:classNotices.title")}</h1>
      <p>{t("admin-dashboard:classNotices.description")}</p>
      <Card>
        {data === undefined ? (
          <NoticeLoadState error={error} retry={retry} />
        ) : (
          <>
            {data.items.length === 0 ? (
              <p>{t("admin-dashboard:classNotices.empty")}</p>
            ) : (
              <NoticeRows items={data.items} />
            )}
            <nav
              aria-label={t("admin-dashboard:classNotices.title")}
              className="class-notices__pagination"
            >
              <Button
                disabled={page === 0}
                onClick={() => {
                  setPage((value) => value - 1);
                }}
                variant="secondary"
              >
                {t("admin-dashboard:classNotices.previous")}
              </Button>
              <span>
                {t("admin-dashboard:classNotices.page", {
                  page: page + 1,
                  total: Math.max(1, Math.ceil(data.totalItems / data.size)),
                })}
              </span>
              <Button
                disabled={(page + 1) * data.size >= data.totalItems}
                onClick={() => {
                  setPage((value) => value + 1);
                }}
                variant="secondary"
              >
                {t("admin-dashboard:classNotices.next")}
              </Button>
            </nav>
          </>
        )}
      </Card>
    </div>
  );
}
