import type { ApiClient, components } from "@agilityhub/api-client";
import {
  Button,
  FormField,
  Icon,
  Input,
  Modal,
  Switch,
  useBranding,
} from "@agilityhub/ui";
import { type FormEvent, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  CatalogFeedback,
  CatalogPageHeader,
  CatalogTable,
  ColorValue,
  LoadFailure,
  moveBefore,
  useCatalogData,
  useCatalogError,
  YesNoBadge,
} from "./shared";

type Ring = components["schemas"]["Ring"];
type RingCreate = components["schemas"]["RingCreate"];
type RingPatch = components["schemas"]["RingPatch"];

function RingForm({
  client,
  item,
  onClose,
  onSaved,
}: {
  client: ApiClient;
  item?: Ring;
  onClose: () => void;
  onSaved: () => void;
}) {
  const branding = useBranding();
  const { t } = useTranslation("admin-catalogs");
  const messageForError = useCatalogError();
  const [name, setName] = useState(item?.name ?? "");
  const [shortName, setShortName] = useState(item?.shortName ?? "");
  const [color, setColor] = useState(item?.color ?? branding.theme.ringPalette[0] ?? "");
  const [allowsFreeTraining, setAllowsFreeTraining] = useState(
    item?.allowsFreeTraining ?? false,
  );
  const [trainingCapacity, setTrainingCapacity] = useState(
    item?.trainingCapacity === undefined ? "" : String(item.trainingCapacity),
  );
  const [active, setActive] = useState(item?.active ?? true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const capacity = trainingCapacity === "" ? undefined : Number(trainingCapacity);
      if (item === undefined) {
        const body: RingCreate = {
          active,
          allowsFreeTraining,
          color,
          name,
          shortName: shortName.toLocaleUpperCase(),
          ...(capacity === undefined ? {} : { trainingCapacity: capacity }),
        };
        await client.POST("/rings", { body });
      } else {
        const body: RingPatch = {
          active,
          allowsFreeTraining,
          color,
          name,
          shortName: shortName.toLocaleUpperCase(),
          ...(capacity === undefined ? {} : { trainingCapacity: capacity }),
          version: item.version,
        };
        await client.PATCH("/rings/{id}", { body, params: { path: { id: item.id } } });
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
      <div className="catalog-form__grid">
        <FormField id="ring-name" label={t("admin-catalogs:rings.fields.name")}>
          <Input
            id="ring-name"
            onChange={(event) => {
              setName(event.currentTarget.value);
            }}
            required
            value={name}
          />
        </FormField>
        <FormField id="ring-short-name" label={t("admin-catalogs:rings.fields.shortName")}>
          <Input
            id="ring-short-name"
            maxLength={4}
            minLength={2}
            onChange={(event) => {
              setShortName(event.currentTarget.value);
            }}
            required
            value={shortName}
          />
        </FormField>
      </div>
      <FormField id="ring-color" label={t("admin-catalogs:rings.fields.color")}>
        <div className="catalog-color-picker">
          {branding.theme.ringPalette.map((candidate) => (
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
            id="ring-color"
            onChange={(event) => {
              setColor(event.currentTarget.value);
            }}
            pattern="#[0-9A-Fa-f]{6}"
            required
            value={color}
          />
        </div>
      </FormField>
      <FormField
        help={t("admin-catalogs:rings.fields.capacityHelp")}
        id="ring-capacity"
        label={t("admin-catalogs:rings.fields.capacity")}
      >
        <Input
          id="ring-capacity"
          max={20}
          min={1}
          onChange={(event) => {
            setTrainingCapacity(event.currentTarget.value);
          }}
          placeholder={String(item?.effectiveTrainingCapacity ?? 1)}
          type="number"
          value={trainingCapacity}
        />
      </FormField>
      {branding.modules.includes("FREE_TRAINING") ? (
        <label className="catalog-switch-row">
          <span>{t("admin-catalogs:rings.fields.freeTraining")}</span>
          <Switch
            checked={allowsFreeTraining}
            label={t("admin-catalogs:rings.fields.freeTraining")}
            onCheckedChange={setAllowsFreeTraining}
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
      {item !== undefined && branding.modules.includes("COURSES") ? (
        <a className="catalog-form__link" href={`/pistes/${item.id}/geometria`}>
          <Icon aria-hidden="true" name="grid" />
          {t("admin-catalogs:rings.geometry")}
        </a>
      ) : null}
      {error === undefined ? null : <p role="alert">{error}</p>}
      <div className="catalog-form__actions">
        <Button onClick={onClose} variant="ghost">
          {t("admin-catalogs:common.cancel")}
        </Button>
        <Button
          loading={pending}
          loadingLabel={t("admin-catalogs:common.saving")}
          type="submit"
        >
          {t("admin-catalogs:common.save")}
        </Button>
      </div>
    </form>
  );
}

export function RingsPage({ client }: { client: ApiClient }) {
  const branding = useBranding();
  const { t } = useTranslation("admin-catalogs");
  const messageForError = useCatalogError();
  const load = useCallback(async () => {
    const result = await client.GET("/rings", { params: { query: { includeInactive: true } } });
    if (result.data === undefined) {
      throw new TypeError("Ring response did not contain data");
    }
    return result.data.items;
  }, [client]);
  const data = useCatalogData(load, client);
  const [editing, setEditing] = useState<{ item?: Ring }>();
  const [removing, setRemoving] = useState<Ring>();
  const [removeBlocked, setRemoveBlocked] = useState(false);
  const [feedback, setFeedback] = useState<string>();
  const showFreeTraining = branding.modules.includes("FREE_TRAINING");

  const reorder = async (sourceId: string, targetId: string) => {
    const ordered = moveBefore(data.items, sourceId, targetId);
    data.setItems(ordered);
    try {
      await client.PUT("/rings/order", { body: { ringIds: ordered.map((item) => item.id) } });
    } catch (error) {
      setFeedback(messageForError(error));
      data.reload();
    }
  };

  const remove = async () => {
    if (removing === undefined) {
      return;
    }
    try {
      await client.DELETE("/rings/{id}", { params: { path: { id: removing.id } } });
      setRemoving(undefined);
      setRemoveBlocked(false);
      data.reload();
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "RING_IN_USE") {
        setRemoveBlocked(true);
      } else {
        setFeedback(messageForError(error));
        setRemoving(undefined);
      }
    }
  };

  const deactivate = async () => {
    if (removing === undefined) {
      return;
    }
    try {
      await client.PATCH("/rings/{id}", {
        body: { active: false, version: removing.version },
        params: { path: { id: removing.id } },
      });
      setRemoving(undefined);
      setRemoveBlocked(false);
      data.reload();
    } catch (error) {
      setFeedback(messageForError(error));
    }
  };

  if (data.error !== undefined) {
    return <LoadFailure onRetry={data.reload} />;
  }

  return (
    <section className="catalog-page">
      <CatalogPageHeader
        action={
          <Button
            onClick={() => {
              setEditing({});
            }}
          >
            <Icon aria-hidden="true" name="plus" />
            {t("admin-catalogs:rings.new")}
          </Button>
        }
        title={t("admin-catalogs:rings.title")}
      />
      <CatalogFeedback
        message={feedback}
        onDismiss={() => {
          setFeedback(undefined);
        }}
      />
      <CatalogTable
        caption={t("admin-catalogs:rings.caption")}
        columns={[
          {
            header: t("admin-catalogs:rings.columns.name"),
            key: "name",
            render: (ring) => <strong>{ring.name}</strong>,
          },
          {
            header: t("admin-catalogs:rings.columns.shortName"),
            key: "shortName",
            render: (ring) => ring.shortName,
          },
          {
            header: t("admin-catalogs:rings.columns.color"),
            key: "color",
            render: (ring) => <ColorValue color={ring.color} />,
          },
          ...(showFreeTraining
            ? [
                {
                  header: t("admin-catalogs:rings.columns.freeTraining"),
                  key: "freeTraining",
                  render: (ring: Ring) => <YesNoBadge value={ring.allowsFreeTraining} />,
                },
              ]
            : []),
        ]}
        empty={t("admin-catalogs:rings.empty")}
        loading={data.loading}
        onEdit={(ring) => {
          setEditing({ item: ring });
        }}
        onRemove={(ring) => {
          setRemoving(ring);
          setRemoveBlocked(false);
        }}
        onReorder={(source, target) => void reorder(source, target)}
        rows={data.items}
      />
      <Modal
        closeLabel={t("admin-catalogs:common.close")}
        onClose={() => {
          setEditing(undefined);
        }}
        open={editing !== undefined}
        title={
          editing?.item === undefined
            ? t("admin-catalogs:rings.createTitle")
            : t("admin-catalogs:rings.editTitle", { name: editing.item.name })
        }
      >
        {editing === undefined ? null : (
          <RingForm
            client={client}
            item={editing.item}
            onClose={() => {
              setEditing(undefined);
            }}
            onSaved={data.reload}
          />
        )}
      </Modal>
      <Modal
        closeLabel={t("admin-catalogs:common.close")}
        onClose={() => {
          setRemoving(undefined);
          setRemoveBlocked(false);
        }}
        open={removing !== undefined}
        title={t("admin-catalogs:rings.removeTitle")}
      >
        <p>
          {removeBlocked
            ? t("admin-catalogs:rings.inUse")
            : t("admin-catalogs:rings.removeQuestion", { name: removing?.name })}
        </p>
        <div className="catalog-form__actions">
          <Button
            onClick={() => {
              setRemoving(undefined);
              setRemoveBlocked(false);
            }}
            variant="ghost"
          >
            {t("admin-catalogs:common.cancel")}
          </Button>
          <Button onClick={() => void (removeBlocked ? deactivate() : remove())} variant="danger">
            {removeBlocked
              ? t("admin-catalogs:common.deactivate")
              : t("admin-catalogs:common.remove")}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
