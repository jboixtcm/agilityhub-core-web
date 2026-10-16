import { type components, useSubmissionKeys } from "@agilityhub/api-client";
import { Badge, Button, DataTable, Modal, Switch } from "@agilityhub/ui";
import { type SyntheticEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useCatalogData } from "../../catalogs/shared";
import type { ConsoleTabProps } from "../ClubRecordPage";
import {
  consoleErrorMessage,
  fieldErrorMap,
  formatClubDateTime,
  FormMessage,
  LoadError,
  SectionCard,
  TextField,
  useWriteState,
} from "../shared";

type PlatformAdmin = components["schemas"]["PlatformAdmin"];

/**
 * «Admin de plataforma» of one account (`GET`/`PUT /platform/accounts/{id}/platform-roles`,
 * R-17-09): global, apart from the club; the last one cannot go (`409 LAST_PLATFORM_ADMIN`).
 */
function PlatformRoleSwitch({
  admin,
  client,
}: {
  admin: PlatformAdmin;
  client: ConsoleTabProps["client"];
}) {
  const { t } = useTranslation(["console", "errors", "common"]);
  const [roles, setRoles] = useState<string[]>();
  const write = useWriteState();
  useEffect(() => {
    let current = true;
    void client
      .GET("/platform/accounts/{id}/platform-roles", { params: { path: { id: admin.accountId } } })
      .then(
        (result) => {
          if (current) setRoles([...(result.data?.platformRoles ?? [])]);
        },
        () => {
          if (current) setRoles(undefined);
        },
      );
    return () => {
      current = false;
    };
  }, [admin.accountId, client]);
  const on = roles?.includes("AGILITYHUB_ADMIN") ?? false;
  return (
    <span className="console-platform-role">
      <Switch
        checked={on}
        disabled={roles === undefined || write.pending}
        label={t("console:team.platformAdminFor", { name: admin.name })}
        onCheckedChange={(checked) => {
          void write
            .run(async () => {
              const result = await client.PUT("/platform/accounts/{id}/platform-roles", {
                body: { platformRoles: checked ? ["AGILITYHUB_ADMIN"] : [] },
                params: { path: { id: admin.accountId } },
              });
              if (result.data === undefined) throw new TypeError("Platform roles without data");
              return result.data;
            })
            .then((result) => {
              if (result !== undefined) setRoles([...result.platformRoles]);
            });
        }}
      />
      {write.error === undefined ? null : (
        <span className="console-message console-message--danger" role="alert">
          {consoleErrorMessage(t, write.error)}
        </span>
      )}
    </span>
  );
}

/**
 * S17 §2 «Equip» (R-17-09): the club's admins (invite by email → account + ADMIN membership + magic
 * link, N-53; retire, never the last one) and who of them is a platform admin.
 */
export function TeamTab({ client, club, onReload }: ConsoleTabProps) {
  const { i18n, t } = useTranslation(["console", "errors", "common"]);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const load = useCallback(async () => {
    const result = await client.GET("/platform/clubs/{id}/admins", {
      params: { path: { id: club.id } },
    });
    if (result.data === undefined) throw new TypeError("Admins without data");
    return result.data;
  }, [client, club.id]);
  const admins = useCatalogData(load, club.id);
  const keys = useSubmissionKeys();
  const invite = useWriteState();
  const removal = useWriteState();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [invited, setInvited] = useState<string>();
  const [removing, setRemoving] = useState<PlatformAdmin>();
  const fields = fieldErrorMap(t, invite.error);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInvited(undefined);
    const body = { email: email.trim(), name: name.trim() };
    const admin = await invite.run(() =>
      // The signature names the slot, never the address (no personal data in fingerprints): an
      // edit of the fields drops the unanswered key, so another payload never reuses it.
      keys.send(`invite:${club.id}`, async (key) => {
        const result = await client.POST("/platform/clubs/{id}/admins", {
          body,
          params: { header: { "Idempotency-Key": key }, path: { id: club.id } },
        });
        if (result.data === undefined) throw new TypeError("Admin without data");
        return result.data;
      }),
    );
    if (admin !== undefined) {
      setInvited(t("console:team.invited", { email: admin.email }));
      setEmail("");
      setName("");
      admins.reload();
      await onReload();
    }
  };

  const remove = async (admin: PlatformAdmin) => {
    setRemoving(undefined);
    const done = await removal.run(() =>
      keys.send(`remove:${club.id}:${admin.accountId}`, async (key) => {
        await client.DELETE("/platform/clubs/{id}/admins/{accountId}", {
          params: {
            header: { "Idempotency-Key": key },
            path: { accountId: admin.accountId, id: club.id },
          },
        });
        return true;
      }),
    );
    if (done === true) {
      admins.reload();
      await onReload();
    }
  };

  return (
    <div className="console-form">
      <SectionCard description={t("console:team.description")} title={t("console:team.title")}>
        {admins.error !== undefined ? (
          <LoadError error={admins.error} onRetry={admins.reload} />
        ) : (
          <DataTable<PlatformAdmin>
            caption={t("console:team.caption")}
            columns={[
              {
                header: t("console:team.columns.name"),
                key: "name",
                render: (admin) => admin.name,
              },
              {
                header: t("console:team.columns.email"),
                key: "email",
                render: (admin) => admin.email,
              },
              {
                header: t("console:team.columns.status"),
                key: "status",
                render: (admin) => (
                  <Badge tone={admin.membershipStatus === "ACTIVE" ? "success" : "neutral"}>
                    {t(`console:team.membership.${admin.membershipStatus}`, {
                      defaultValue: admin.membershipStatus,
                    })}
                  </Badge>
                ),
              },
              {
                header: t("console:team.columns.lastAccess"),
                key: "lastAccess",
                render: (admin) =>
                  formatClubDateTime(admin.lastAccessAt, club.timeZone, locale) ??
                  t("console:list.never"),
              },
              {
                header: t("console:team.columns.platformAdmin"),
                key: "platform",
                render: (admin) => <PlatformRoleSwitch admin={admin} client={client} />,
              },
              {
                header: t("console:team.columns.actions"),
                key: "actions",
                render: (admin) =>
                  admin.membershipStatus === "ACTIVE" ? (
                    <Button
                      disabled={removal.pending}
                      onClick={() => {
                        setRemoving(admin);
                      }}
                      variant="ghost"
                    >
                      {t("console:team.remove")}
                    </Button>
                  ) : null,
              },
            ]}
            empty={t("console:team.empty")}
            loading={admins.loading}
            loadingLabel={t("console:common.loading")}
            rowKey={(admin) => admin.accountId}
            rows={admins.items}
          />
        )}
        <FormMessage
          message={removal.error === undefined ? undefined : consoleErrorMessage(t, removal.error)}
          tone="danger"
        />
      </SectionCard>
      <SectionCard description={t("console:team.inviteHelp")} title={t("console:team.inviteTitle")}>
        <form className="console-form" onSubmit={(event) => void submit(event)}>
          <fieldset className="console-fieldset" disabled={invite.pending}>
            <div className="console-grid">
              <TextField
                autoComplete="off"
                error={fields.email}
                id="console-team-email"
                label={t("console:team.email")}
                onChange={(value) => {
                  keys.forget(`invite:${club.id}`);
                  setEmail(value);
                }}
                required
                type="email"
                value={email}
              />
              <TextField
                autoComplete="off"
                error={fields.name}
                id="console-team-name"
                label={t("console:team.name")}
                onChange={(value) => {
                  keys.forget(`invite:${club.id}`);
                  setName(value);
                }}
                required
                value={name}
              />
            </div>
          </fieldset>
          <FormMessage
            message={invite.error === undefined ? undefined : consoleErrorMessage(t, invite.error)}
            tone="danger"
          />
          <FormMessage message={invited} tone="success" />
          <div className="console-actions">
            <Button
              disabled={email.trim() === "" || name.trim() === ""}
              loading={invite.pending}
              loadingLabel={t("console:team.inviting")}
              type="submit"
            >
              {t("console:team.invite")}
            </Button>
          </div>
        </form>
      </SectionCard>
      <Modal
        closeLabel={t("console:common.close")}
        onClose={() => {
          setRemoving(undefined);
        }}
        open={removing !== undefined}
        title={t("console:team.removeTitle", { name: removing?.name ?? "" })}
      >
        <p>{t("console:team.removeConfirm")}</p>
        <div className="console-actions">
          <Button
            onClick={() => {
              setRemoving(undefined);
            }}
            variant="ghost"
          >
            {t("console:common.cancel")}
          </Button>
          <Button
            onClick={() => {
              if (removing !== undefined) void remove(removing);
            }}
            variant="danger"
          >
            {t("console:team.remove")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
