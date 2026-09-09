import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import { Button, FormField, Icon, Input, Modal, Switch, useBranding } from "@agilityhub/ui";
import { type SyntheticEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  CatalogFeedback,
  CatalogPageHeader,
  CatalogSectionHeader,
  CatalogTable,
  ColorValue,
  LoadFailure,
  useCatalogData,
  useCatalogError,
  YesNoBadge,
} from "./shared";

type Administrator = components["schemas"]["Administrator"];
type AdministratorCreate = components["schemas"]["AdministratorCreate"];
type AdministratorPatch = components["schemas"]["AdministratorPatch"];
type Instructor = components["schemas"]["Instructor"];
type InstructorCreate = components["schemas"]["InstructorCreate"];
type InstructorPatch = components["schemas"]["InstructorPatch"];
type Member = components["schemas"]["MemberListItem"];
type TeamKind = "administrator" | "instructor";

function memberText(
  member: Member | undefined,
  fallback: string,
  withDog: (name: string, dog: string) => string,
): string {
  if (member === undefined) {
    return fallback;
  }
  const dog = member.dogs.find((candidate) => candidate.id !== "")?.name;
  return dog === undefined ? member.fullName : withDog(member.fullName, dog);
}

function TeamMemberPicker({
  client,
  disabled,
  initialMember,
  onMemberId,
}: {
  client: ApiClient;
  disabled: boolean;
  initialMember?: Member | undefined;
  onMemberId: (memberId: string) => void;
}) {
  const { t } = useTranslation("admin-catalogs");
  const [query, setQuery] = useState(initialMember?.fullName ?? "");
  const [members, setMembers] = useState<Member[]>(
    initialMember === undefined ? [] : [initialMember],
  );

  useEffect(() => {
    if (disabled) {
      return undefined;
    }
    let current = true;
    void client
      .GET("/members", {
        params: {
          query: {
            filter: ["status:eq:ACTIVE"],
            ...(query.trim() === "" ? {} : { q: query.trim() }),
            size: 20,
          },
        },
      })
      .then((result) => {
        if (current && result.data !== undefined) {
          setMembers(result.data.items);
        }
      });
    return () => {
      current = false;
    };
  }, [client, disabled, query]);

  return (
    <FormField
      help={t("admin-catalogs:team.fields.memberHelp")}
      id="team-member"
      label={t("admin-catalogs:team.fields.member")}
    >
      <>
        <Input
          disabled={disabled}
          id="team-member"
          list="team-member-options"
          onChange={(event) => {
            const value = event.currentTarget.value;
            setQuery(value);
            const member = members.find((candidate) => candidate.fullName === value);
            onMemberId(member?.id ?? "");
          }}
          required
          value={query}
        />
        <datalist id="team-member-options">
          {members.map((member) => (
            <option key={member.id} value={member.fullName}>
              {memberText(member, member.fullName, (name, dog) =>
                t("admin-catalogs:team.memberWithDog", { dog, name }),
              )}
            </option>
          ))}
        </datalist>
      </>
    </FormField>
  );
}

function TeamPersonForm({
  client,
  item,
  kind,
  member,
  onClose,
  onSaved,
}: {
  client: ApiClient;
  kind: TeamKind;
  member: Member | undefined;
  onClose: () => void;
  onSaved: () => void;
  item?: Administrator | Instructor | undefined;
}) {
  const branding = useBranding();
  const { t } = useTranslation("admin-catalogs");
  const messageForError = useCatalogError();
  const [memberId, setMemberId] = useState(item?.memberId ?? "");
  const [shortName, setShortName] = useState(item?.shortName ?? "");
  const [color, setColor] = useState(
    kind === "instructor" && item !== undefined && "color" in item
      ? item.color
      : (branding.theme.ringPalette?.[0] ?? ""),
  );
  const [since, setSince] = useState(
    kind === "administrator" && item !== undefined && "since" in item
      ? item.since
      : new Date().toISOString().slice(0, 10),
  );
  const [active, setActive] = useState(item?.active ?? true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      if (kind === "instructor") {
        if (item === undefined) {
          const body: InstructorCreate = { color, memberId, shortName };
          await client.POST("/instructors", { body });
        } else {
          const body: InstructorPatch = { active, color, shortName, version: item.version };
          await client.PATCH("/instructors/{id}", {
            body,
            params: { path: { id: "id" in item ? item.id : "" } },
          });
        }
      } else if (item === undefined) {
        const body: AdministratorCreate = { memberId, shortName, since };
        await client.POST("/administrators", { body });
      } else {
        const body: AdministratorPatch = { active, shortName, since, version: item.version };
        await client.PATCH("/administrators/{membershipId}", {
          body,
          params: {
            path: { membershipId: "membershipId" in item ? item.membershipId : "" },
          },
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
      <TeamMemberPicker
        client={client}
        disabled={item !== undefined}
        initialMember={member}
        onMemberId={setMemberId}
      />
      <FormField id={`${kind}-short-name`} label={t("admin-catalogs:team.fields.shortName")}>
        <Input
          id={`${kind}-short-name`}
          maxLength={12}
          onChange={(event) => {
            setShortName(event.currentTarget.value);
          }}
          required
          value={shortName}
        />
      </FormField>
      {kind === "instructor" ? (
        <FormField id="instructor-color" label={t("admin-catalogs:team.fields.color")}>
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
              id="instructor-color"
              onChange={(event) => {
                setColor(event.currentTarget.value);
              }}
              pattern="#[0-9A-Fa-f]{6}"
              required
              value={color}
            />
          </div>
        </FormField>
      ) : (
        <FormField id="administrator-since" label={t("admin-catalogs:team.fields.since")}>
          <Input
            id="administrator-since"
            max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => {
              setSince(event.currentTarget.value);
            }}
            required
            type="date"
            value={since}
          />
        </FormField>
      )}
      {item === undefined ? null : (
        <label className="catalog-switch-row">
          <span>{t("admin-catalogs:common.active")}</span>
          <Switch
            checked={active}
            label={t("admin-catalogs:common.active")}
            onCheckedChange={setActive}
          />
        </label>
      )}
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

export function TeamPage({ client }: { client: ApiClient }) {
  const { t } = useTranslation("admin-catalogs");
  const messageForError = useCatalogError();
  const loadInstructors = useCallback(async () => {
    const result = await client.GET("/instructors", {
      params: { query: { includeInactive: true } },
    });
    if (result.data === undefined) {
      throw new TypeError("Instructor response did not contain data");
    }
    return result.data.items;
  }, [client]);
  const loadAdministrators = useCallback(async () => {
    const result = await client.GET("/administrators", {
      params: { query: { includeInactive: true } },
    });
    if (result.data === undefined) {
      throw new TypeError("Administrator response did not contain data");
    }
    return result.data.items;
  }, [client]);
  const loadMembers = useCallback(async () => {
    const result = await client.GET("/members", {
      params: { query: { filter: ["status:eq:ACTIVE"], size: 200 } },
    });
    if (result.data === undefined) {
      throw new TypeError("Member response did not contain data");
    }
    return result.data.items;
  }, [client]);
  const instructors = useCatalogData(loadInstructors, client);
  const administrators = useCatalogData(loadAdministrators, client);
  const members = useCatalogData(loadMembers, client);
  const memberById = useMemo(
    () => new Map(members.items.map((member) => [member.id, member])),
    [members.items],
  );
  const [editing, setEditing] = useState<{
    item?: Administrator | Instructor;
    kind: TeamKind;
  }>();
  const [removing, setRemoving] = useState<{
    item: Administrator | Instructor;
    kind: TeamKind;
  }>();
  const [feedback, setFeedback] = useState<string>();
  const memberLabel = (member: Member | undefined, fallback: string) =>
    memberText(member, fallback, (name, dog) =>
      t("admin-catalogs:team.memberWithDog", { dog, name }),
    );

  const reload = () => {
    instructors.reload();
    administrators.reload();
  };

  const remove = async () => {
    if (removing === undefined) {
      return;
    }
    try {
      if (removing.kind === "instructor" && "id" in removing.item) {
        await client.DELETE("/instructors/{id}", {
          params: { path: { id: removing.item.id } },
        });
      } else if ("membershipId" in removing.item) {
        await client.DELETE("/administrators/{membershipId}", {
          params: { path: { membershipId: removing.item.membershipId } },
        });
      }
      setRemoving(undefined);
      reload();
    } catch (reason) {
      if (isApiError(reason, "INSTRUCTOR_IN_USE") && "usage" in removing.item) {
        setFeedback(
          t("admin-catalogs:team.instructorInUse", {
            count: removing.item.usage.futureClassSessions,
          }),
        );
      } else {
        setFeedback(messageForError(reason));
      }
      setRemoving(undefined);
    }
  };

  if (
    instructors.error !== undefined ||
    administrators.error !== undefined ||
    members.error !== undefined
  ) {
    return <LoadFailure onRetry={reload} />;
  }

  return (
    <section className="catalog-page">
      <CatalogPageHeader title={t("admin-catalogs:team.title")} />
      <CatalogFeedback
        message={feedback}
        onDismiss={() => {
          setFeedback(undefined);
        }}
      />
      <section className="catalog-section">
        <CatalogSectionHeader
          action={
            <Button
              onClick={() => {
                setEditing({ kind: "instructor" });
              }}
            >
              <Icon aria-hidden="true" name="plus" />
              {t("admin-catalogs:team.newInstructor")}
            </Button>
          }
          title={t("admin-catalogs:team.instructors")}
        />
        <CatalogTable
          caption={t("admin-catalogs:team.instructorCaption")}
          columns={[
            {
              header: t("admin-catalogs:team.columns.member"),
              key: "member",
              render: (item) => (
                <strong>{memberLabel(memberById.get(item.memberId), item.shortName)}</strong>
              ),
            },
            {
              header: t("admin-catalogs:team.columns.shortName"),
              key: "shortName",
              render: (item) => item.shortName,
            },
            {
              header: t("admin-catalogs:team.columns.color"),
              key: "color",
              render: (item) => <ColorValue color={item.color} text={false} />,
            },
            {
              header: t("admin-catalogs:team.columns.active"),
              key: "active",
              render: (item) => <YesNoBadge value={item.active} />,
            },
          ]}
          empty={t("admin-catalogs:team.emptyInstructors")}
          loading={instructors.loading || members.loading}
          onEdit={(item) => {
            setEditing({ item, kind: "instructor" });
          }}
          onRemove={(item) => {
            setRemoving({ item, kind: "instructor" });
          }}
          rows={instructors.items}
        />
      </section>
      <section className="catalog-section">
        <CatalogSectionHeader
          action={
            <Button
              onClick={() => {
                setEditing({ kind: "administrator" });
              }}
            >
              <Icon aria-hidden="true" name="plus" />
              {t("admin-catalogs:team.newAdministrator")}
            </Button>
          }
          title={t("admin-catalogs:team.administrators")}
        />
        <CatalogTable
          caption={t("admin-catalogs:team.administratorCaption")}
          columns={[
            {
              header: t("admin-catalogs:team.columns.member"),
              key: "member",
              render: (item) => (
                <strong>{memberLabel(memberById.get(item.memberId), item.shortName)}</strong>
              ),
            },
            {
              header: t("admin-catalogs:team.columns.shortName"),
              key: "shortName",
              render: (item) => item.shortName,
            },
            {
              header: t("admin-catalogs:team.columns.since"),
              key: "since",
              render: (item) => item.since.slice(0, 4),
            },
            {
              header: t("admin-catalogs:team.columns.active"),
              key: "active",
              render: (item) => <YesNoBadge value={item.active} />,
            },
          ]}
          empty={t("admin-catalogs:team.emptyAdministrators")}
          loading={administrators.loading || members.loading}
          onEdit={(item) => {
            setEditing({ item, kind: "administrator" });
          }}
          onRemove={(item) => {
            setRemoving({ item, kind: "administrator" });
          }}
          rows={administrators.items.map((item) => ({ ...item, id: item.membershipId }))}
        />
      </section>
      <Modal
        closeLabel={t("admin-catalogs:common.close")}
        onClose={() => {
          setEditing(undefined);
        }}
        open={editing !== undefined}
        title={
          editing?.kind === "instructor"
            ? editing.item === undefined
              ? t("admin-catalogs:team.createInstructorTitle")
              : t("admin-catalogs:team.editInstructorTitle")
            : editing?.item === undefined
              ? t("admin-catalogs:team.createAdministratorTitle")
              : t("admin-catalogs:team.editAdministratorTitle")
        }
      >
        {editing === undefined ? null : (
          <TeamPersonForm
            client={client}
            item={editing.item}
            kind={editing.kind}
            member={editing.item === undefined ? undefined : memberById.get(editing.item.memberId)}
            onClose={() => {
              setEditing(undefined);
            }}
            onSaved={reload}
          />
        )}
      </Modal>
      <Modal
        closeLabel={t("admin-catalogs:common.close")}
        onClose={() => {
          setRemoving(undefined);
        }}
        open={removing !== undefined}
        title={t("admin-catalogs:team.removeTitle")}
      >
        <p>
          {t("admin-catalogs:team.removeQuestion", {
            name:
              removing === undefined
                ? ""
                : memberLabel(memberById.get(removing.item.memberId), removing.item.shortName),
          })}
        </p>
        <div className="catalog-form__actions">
          <Button
            onClick={() => {
              setRemoving(undefined);
            }}
            variant="ghost"
          >
            {t("admin-catalogs:common.cancel")}
          </Button>
          <Button onClick={() => void remove()} variant="danger">
            {t("admin-catalogs:common.remove")}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
