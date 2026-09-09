import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import {
  Button,
  FormField,
  Icon,
  Input,
  Modal,
  Switch,
  Textarea,
  useBranding,
} from "@agilityhub/ui";
import { type SyntheticEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { LastChange } from "../audit/LastChange";

import { ParameterSettings } from "./ParameterSettings";
import {
  CatalogFeedback,
  CatalogSectionHeader,
  CatalogTable,
  ColorValue,
  LoadFailure,
  LocaleTabs,
  moveBefore,
  useCatalogData,
  useCatalogError,
  YesNoBadge,
} from "./shared";

type FaqEntry = components["schemas"]["FaqEntry"];
type FaqCreate = components["schemas"]["FaqCreate"];
type FaqPatch = components["schemas"]["FaqPatch"];
type ClubSettings = components["schemas"]["ClubSettings"];
type Level = components["schemas"]["Level"];
type LevelCreate = components["schemas"]["LevelCreate"];
type LevelPatch = components["schemas"]["LevelPatch"];
type Plan = components["schemas"]["Plan"];
type LocalizedText = Record<string, string>;

function localized(
  source: LocalizedText | undefined,
  fallback: string,
  locale: string,
): LocalizedText {
  return source === undefined ? { [locale]: fallback } : { ...source };
}

function LevelForm({
  client,
  item,
  onClose,
  onSaved,
}: {
  client: ApiClient;
  item?: Level | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const branding = useBranding();
  const { t } = useTranslation("admin-catalogs");
  const messageForError = useCatalogError();
  const [locale, setLocale] = useState(branding.defaultLocale);
  const [name, setName] = useState(
    localized(item?.nameI18n, item?.name ?? "", branding.defaultLocale),
  );
  const [code, setCode] = useState(item?.code ?? "");
  const [color, setColor] = useState(item?.color ?? branding.theme.ringPalette?.[0] ?? "");
  const [capacity, setCapacity] = useState(item?.capacity ?? 5);
  const [grantsFreeTraining, setGrantsFreeTraining] = useState(item?.grantsFreeTraining ?? false);
  const [active, setActive] = useState(item?.active ?? true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      if (item === undefined) {
        const body: LevelCreate = {
          active,
          capacity,
          code: code.toLocaleUpperCase(),
          color,
          grantsFreeTraining,
          name,
        };
        await client.POST("/levels", { body });
      } else {
        const body: LevelPatch = {
          active,
          capacity,
          code: code.toLocaleUpperCase(),
          color,
          grantsFreeTraining,
          name,
          version: item.version,
        };
        await client.PATCH("/levels/{id}", {
          body,
          params: { path: { id: item.id } },
        });
      }
      onSaved();
      onClose();
    } catch (reason) {
      setError(messageForError(reason));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="catalog-form" onSubmit={(event) => void submit(event)}>
      <LocaleTabs locale={locale} locales={branding.locales} onChange={setLocale} />
      <FormField id="level-name" label={t("admin-catalogs:levels.fields.name")}>
        <Input
          id="level-name"
          onChange={(event) => {
            const value = event.currentTarget.value;
            setName((current) => ({ ...current, [locale]: value }));
          }}
          required={locale === branding.defaultLocale}
          value={name[locale] ?? ""}
        />
      </FormField>
      <div className="catalog-form__grid">
        <FormField id="level-code" label={t("admin-catalogs:levels.fields.code")}>
          <Input
            id="level-code"
            maxLength={8}
            onChange={(event) => {
              setCode(event.currentTarget.value);
            }}
            pattern="[A-Za-z0-9_]+"
            required
            value={code}
          />
        </FormField>
        <FormField id="level-capacity" label={t("admin-catalogs:levels.fields.capacity")}>
          <Input
            id="level-capacity"
            max={99}
            min={1}
            onChange={(event) => {
              setCapacity(event.currentTarget.valueAsNumber);
            }}
            required
            type="number"
            value={capacity}
          />
        </FormField>
      </div>
      <FormField id="level-color" label={t("admin-catalogs:levels.fields.color")}>
        <div className="catalog-color-picker">
          {(branding.theme.ringPalette ?? []).map((candidate) => (
            <button
              aria-label={candidate}
              aria-pressed={candidate.toLocaleLowerCase() === color.toLocaleLowerCase()}
              key={candidate}
              onClick={() => {
                setColor(candidate);
              }}
              style={{ "--catalog-color": candidate } as React.CSSProperties}
              type="button"
            />
          ))}
          <Input
            id="level-color"
            onChange={(event) => {
              setColor(event.currentTarget.value);
            }}
            pattern="#[0-9A-Fa-f]{6}"
            required
            value={color}
          />
        </div>
      </FormField>
      {branding.modules.includes("FREE_TRAINING") ? (
        <label className="catalog-switch-row">
          <span>{t("admin-catalogs:levels.fields.freeTraining")}</span>
          <Switch
            checked={grantsFreeTraining}
            label={t("admin-catalogs:levels.fields.freeTraining")}
            onCheckedChange={setGrantsFreeTraining}
          />
        </label>
      ) : null}
      <label className="catalog-switch-row">
        <span>{t("admin-catalogs:common.active")}</span>
        <Switch
          checked={active}
          label={t("admin-catalogs:common.active")}
          onCheckedChange={setActive}
        />
      </label>
      {error === undefined ? null : <p role="alert">{error}</p>}
      <div className="catalog-form__actions">
        <Button onClick={onClose} variant="ghost">
          {t("admin-catalogs:common.cancel")}
        </Button>
        <Button loading={pending} loadingLabel={t("admin-catalogs:common.saving")} type="submit">
          {t("admin-catalogs:common.save")}
        </Button>
      </div>
    </form>
  );
}

function FaqForm({
  client,
  item,
  onClose,
  onSaved,
}: {
  client: ApiClient;
  item?: FaqEntry | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const branding = useBranding();
  const { t } = useTranslation("admin-catalogs");
  const messageForError = useCatalogError();
  const [locale, setLocale] = useState(branding.defaultLocale);
  const [category, setCategory] = useState(
    localized(item?.categoryI18n, item?.category ?? "", branding.defaultLocale),
  );
  const [question, setQuestion] = useState(
    localized(item?.questionI18n, item?.question ?? "", branding.defaultLocale),
  );
  const [answer, setAnswer] = useState(
    localized(item?.answerI18n, item?.answer ?? "", branding.defaultLocale),
  );
  const [order, setOrder] = useState(item?.order ?? 0);
  const [active, setActive] = useState(item?.active ?? true);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let current = true;
    void client
      .GET("/faq-entries/filter-values", { params: { query: { field: "category" } } })
      .then((result) => {
        if (current && result.data !== undefined) {
          setSuggestions(
            result.data.values.flatMap((item) =>
              typeof item.value === "string" ? [item.value] : [],
            ),
          );
        }
      });
    return () => {
      current = false;
    };
  }, [client]);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      if (item === undefined) {
        const body: FaqCreate = { active, answer, category, order, question };
        await client.POST("/faq-entries", { body });
      } else {
        const body: FaqPatch = {
          active,
          answer,
          category,
          order,
          question,
          version: item.version,
        };
        await client.PATCH("/faq-entries/{id}", {
          body,
          params: { path: { id: item.id } },
        });
      }
      onSaved();
      onClose();
    } catch (reason) {
      setError(messageForError(reason));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="catalog-form" onSubmit={(event) => void submit(event)}>
      <LocaleTabs locale={locale} locales={branding.locales} onChange={setLocale} />
      <FormField id="faq-category" label={t("admin-catalogs:faq.fields.category")}>
        <>
          <Input
            id="faq-category"
            list="faq-category-suggestions"
            onChange={(event) => {
              const value = event.currentTarget.value;
              setCategory((current) => ({ ...current, [locale]: value }));
            }}
            required={locale === branding.defaultLocale}
            value={category[locale] ?? ""}
          />
          <datalist id="faq-category-suggestions">
            {suggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </>
      </FormField>
      <FormField id="faq-question" label={t("admin-catalogs:faq.fields.question")}>
        <Input
          id="faq-question"
          maxLength={200}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setQuestion((current) => ({ ...current, [locale]: value }));
          }}
          required={locale === branding.defaultLocale}
          value={question[locale] ?? ""}
        />
      </FormField>
      <FormField id="faq-answer" label={t("admin-catalogs:faq.fields.answer")}>
        <Textarea
          id="faq-answer"
          maxLength={2000}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setAnswer((current) => ({ ...current, [locale]: value }));
          }}
          required={locale === branding.defaultLocale}
          value={answer[locale] ?? ""}
        />
      </FormField>
      <FormField id="faq-order" label={t("admin-catalogs:faq.fields.order")}>
        <Input
          id="faq-order"
          min={0}
          onChange={(event) => {
            setOrder(event.currentTarget.valueAsNumber);
          }}
          required
          type="number"
          value={order}
        />
      </FormField>
      <label className="catalog-switch-row">
        <span>{t("admin-catalogs:common.active")}</span>
        <Switch
          checked={active}
          label={t("admin-catalogs:common.active")}
          onCheckedChange={setActive}
        />
      </label>
      {error === undefined ? null : <p role="alert">{error}</p>}
      <div className="catalog-form__actions">
        <Button onClick={onClose} variant="ghost">
          {t("admin-catalogs:common.cancel")}
        </Button>
        <Button loading={pending} loadingLabel={t("admin-catalogs:common.saving")} type="submit">
          {t("admin-catalogs:common.save")}
        </Button>
      </div>
    </form>
  );
}

export function SettingsPage({ client }: { client: ApiClient }) {
  const branding = useBranding();
  const { t } = useTranslation("admin-catalogs");
  const messageForError = useCatalogError();
  const [activeModules, setActiveModules] = useState<string[]>([...branding.modules]);
  const faqEnabled = activeModules.includes("FAQ");
  const packsEnabled = activeModules.includes("PACKS");
  const loadLevels = useCallback(async () => {
    const result = await client.GET("/levels", {
      params: { query: { includeInactive: true } },
    });
    if (result.data === undefined) {
      throw new TypeError("Level response did not contain data");
    }
    return result.data.items;
  }, [client]);
  const loadFaq = useCallback(async () => {
    if (!faqEnabled) {
      return [];
    }
    const result = await client.GET("/faq-entries", {
      params: { query: { includeInactive: true } },
    });
    if (result.data === undefined) {
      throw new TypeError("FAQ response did not contain data");
    }
    return result.data.items;
  }, [client, faqEnabled]);
  const loadPlans = useCallback(async (): Promise<Plan[]> => {
    if (!packsEnabled) {
      return [];
    }
    const result = await client.GET("/plans", {
      params: { query: { includeInactive: true } },
    });
    if (result.data === undefined) {
      throw new TypeError("Plan response did not contain data");
    }
    return result.data.items as Plan[];
  }, [client, packsEnabled]);
  const loadClubSettings = useCallback(async (): Promise<ClubSettings[]> => {
    const result = await client.GET("/club", {});
    if (result.data === undefined) {
      throw new TypeError("Club response did not contain data");
    }
    return [result.data];
  }, [client]);
  const levels = useCatalogData(loadLevels, client);
  const faq = useCatalogData(loadFaq, client);
  const plans = useCatalogData(loadPlans, packsEnabled);
  const clubSettings = useCatalogData(loadClubSettings, client);
  const [levelsEnabled, setLevelsEnabled] = useState(true);
  const [editingLevel, setEditingLevel] = useState<{ item?: Level }>();
  const [editingFaq, setEditingFaq] = useState<{ item?: FaqEntry }>();
  const [removingLevel, setRemovingLevel] = useState<Level>();
  const [removingFaq, setRemovingFaq] = useState<FaqEntry>();
  const [levelRemoveBlocked, setLevelRemoveBlocked] = useState(false);
  const [feedback, setFeedback] = useState<string>();
  const showFreeTraining = branding.modules.includes("FREE_TRAINING");

  useEffect(() => {
    let current = true;
    void client.GET("/parameters/{key}", { params: { path: { key: "levels.enabled" } } }).then(
      (result) => {
        if (current && result.data !== undefined) {
          setLevelsEnabled(result.data.value !== false);
        }
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [client]);

  const reorderLevels = async (sourceId: string, targetId: string) => {
    const ordered = moveBefore(levels.items, sourceId, targetId);
    levels.setItems(ordered);
    try {
      await client.PUT("/levels/order", {
        body: { levelIds: ordered.map((item) => item.id) },
      });
    } catch (reason) {
      setFeedback(messageForError(reason));
      levels.reload();
    }
  };

  const reorderFaq = async (sourceId: string, targetId: string) => {
    const ordered = moveBefore(faq.items, sourceId, targetId);
    faq.setItems(ordered);
    try {
      await client.PUT("/faq-entries/order", {
        body: { faqEntryIds: ordered.map((item) => item.id) },
      });
    } catch (reason) {
      setFeedback(messageForError(reason));
      faq.reload();
    }
  };

  const removeLevel = async () => {
    if (removingLevel === undefined) {
      return;
    }
    try {
      if (levelRemoveBlocked) {
        await client.PATCH("/levels/{id}", {
          body: { active: false, version: removingLevel.version },
          params: { path: { id: removingLevel.id } },
        });
      } else {
        await client.DELETE("/levels/{id}", { params: { path: { id: removingLevel.id } } });
      }
      setRemovingLevel(undefined);
      setLevelRemoveBlocked(false);
      levels.reload();
    } catch (reason) {
      if (isApiError(reason, "LEVEL_IN_USE")) {
        setLevelRemoveBlocked(true);
      } else {
        setFeedback(messageForError(reason));
        setRemovingLevel(undefined);
      }
    }
  };

  const removeFaq = async () => {
    if (removingFaq === undefined) {
      return;
    }
    try {
      await client.DELETE("/faq-entries/{id}", {
        params: { path: { id: removingFaq.id } },
      });
      setRemovingFaq(undefined);
      faq.reload();
    } catch (reason) {
      setFeedback(messageForError(reason));
      setRemovingFaq(undefined);
    }
  };

  if (
    levels.error !== undefined ||
    faq.error !== undefined ||
    plans.error !== undefined ||
    clubSettings.error !== undefined
  ) {
    return (
      <LoadFailure
        onRetry={() => {
          levels.reload();
          faq.reload();
          plans.reload();
          clubSettings.reload();
        }}
      />
    );
  }

  return (
    <section className="catalog-page">
      <ParameterSettings
        client={client}
        clubSettings={clubSettings.items[0]}
        levels={levels.items}
        modules={activeModules}
        onModulesChange={setActiveModules}
        plans={plans.items}
      />
      <CatalogFeedback
        message={feedback}
        onDismiss={() => {
          setFeedback(undefined);
        }}
      />
      {levelsEnabled ? (
        <section className="catalog-section" id="nivells">
          <CatalogSectionHeader
            action={
              <Button
                onClick={() => {
                  setEditingLevel({});
                }}
                variant="secondary"
              >
                <Icon aria-hidden="true" name="plus" />
                {t("admin-catalogs:levels.new")}
              </Button>
            }
            title={t("admin-catalogs:levels.title")}
          />
          <CatalogTable
            caption={t("admin-catalogs:levels.caption")}
            columns={[
              {
                header: t("admin-catalogs:levels.columns.name"),
                key: "name",
                render: (item) => (
                  <span className="catalog-level-name">
                    <strong>{item.name}</strong>
                    <LastChange
                      compact
                      entityId={item.id}
                      entityType="Level"
                      value={"lastChange" in item ? item.lastChange : undefined}
                    />
                  </span>
                ),
              },
              {
                header: t("admin-catalogs:levels.columns.code"),
                key: "code",
                render: (item) => item.code,
              },
              {
                header: t("admin-catalogs:levels.columns.color"),
                key: "color",
                render: (item) => <ColorValue color={item.color} />,
              },
              {
                header: t("admin-catalogs:levels.columns.capacity"),
                key: "capacity",
                render: (item) => item.capacity,
              },
              ...(showFreeTraining
                ? [
                    {
                      header: t("admin-catalogs:levels.columns.freeTraining"),
                      key: "freeTraining",
                      render: (item: Level) => <YesNoBadge value={item.grantsFreeTraining} />,
                    },
                  ]
                : []),
              {
                header: t("admin-catalogs:levels.columns.active"),
                key: "active",
                render: (item) => <YesNoBadge value={item.active} />,
              },
            ]}
            empty={t("admin-catalogs:levels.empty")}
            loading={levels.loading}
            onEdit={(item) => {
              setEditingLevel({ item });
            }}
            onRemove={(item) => {
              setRemovingLevel(item);
              setLevelRemoveBlocked(false);
            }}
            onReorder={(source, target) => void reorderLevels(source, target)}
            rows={levels.items}
          />
        </section>
      ) : null}
      {faqEnabled ? (
        <section className="catalog-section" id="faq">
          <CatalogSectionHeader
            action={
              <Button
                onClick={() => {
                  setEditingFaq({});
                }}
                variant="secondary"
              >
                <Icon aria-hidden="true" name="plus" />
                {t("admin-catalogs:faq.new")}
              </Button>
            }
            title={t("admin-catalogs:faq.title")}
          />
          <CatalogTable
            caption={t("admin-catalogs:faq.caption")}
            columns={[
              {
                header: t("admin-catalogs:faq.columns.category"),
                key: "category",
                render: (item) => item.category,
              },
              {
                header: t("admin-catalogs:faq.columns.question"),
                key: "question",
                render: (item) => item.question,
              },
            ]}
            empty={t("admin-catalogs:faq.empty")}
            loading={faq.loading}
            onActivate={(item) => {
              setEditingFaq({ item });
            }}
            onEdit={(item) => {
              setEditingFaq({ item });
            }}
            onRemove={setRemovingFaq}
            onReorder={(source, target) => void reorderFaq(source, target)}
            rows={faq.items}
          />
          <p className="catalog-section__help">{t("admin-catalogs:faq.rowHelp")}</p>
        </section>
      ) : null}
      <Modal
        closeLabel={t("admin-catalogs:common.close")}
        onClose={() => {
          setEditingLevel(undefined);
        }}
        open={editingLevel !== undefined}
        title={
          editingLevel?.item === undefined
            ? t("admin-catalogs:levels.createTitle")
            : t("admin-catalogs:levels.editTitle")
        }
      >
        {editingLevel === undefined ? null : (
          <LevelForm
            client={client}
            item={editingLevel.item}
            onClose={() => {
              setEditingLevel(undefined);
            }}
            onSaved={levels.reload}
          />
        )}
      </Modal>
      <Modal
        closeLabel={t("admin-catalogs:common.close")}
        onClose={() => {
          setEditingFaq(undefined);
        }}
        open={editingFaq !== undefined}
        title={
          editingFaq?.item === undefined
            ? t("admin-catalogs:faq.createTitle")
            : t("admin-catalogs:faq.editTitle")
        }
      >
        {editingFaq === undefined ? null : (
          <FaqForm
            client={client}
            item={editingFaq.item}
            onClose={() => {
              setEditingFaq(undefined);
            }}
            onSaved={faq.reload}
          />
        )}
      </Modal>
      <Modal
        closeLabel={t("admin-catalogs:common.close")}
        onClose={() => {
          setRemovingLevel(undefined);
          setLevelRemoveBlocked(false);
        }}
        open={removingLevel !== undefined}
        title={t("admin-catalogs:levels.removeTitle")}
      >
        <p>
          {levelRemoveBlocked
            ? t("admin-catalogs:levels.inUse")
            : t("admin-catalogs:levels.removeQuestion", { name: removingLevel?.name })}
        </p>
        <div className="catalog-form__actions">
          <Button
            onClick={() => {
              setRemovingLevel(undefined);
              setLevelRemoveBlocked(false);
            }}
            variant="ghost"
          >
            {t("admin-catalogs:common.cancel")}
          </Button>
          <Button onClick={() => void removeLevel()} variant="danger">
            {levelRemoveBlocked
              ? t("admin-catalogs:common.deactivate")
              : t("admin-catalogs:common.remove")}
          </Button>
        </div>
      </Modal>
      <Modal
        closeLabel={t("admin-catalogs:common.close")}
        onClose={() => {
          setRemovingFaq(undefined);
        }}
        open={removingFaq !== undefined}
        title={t("admin-catalogs:faq.removeTitle")}
      >
        <p>{t("admin-catalogs:faq.removeQuestion", { question: removingFaq?.question })}</p>
        <div className="catalog-form__actions">
          <Button
            onClick={() => {
              setRemovingFaq(undefined);
            }}
            variant="ghost"
          >
            {t("admin-catalogs:common.cancel")}
          </Button>
          <Button onClick={() => void removeFaq()} variant="danger">
            {t("admin-catalogs:common.remove")}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
