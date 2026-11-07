import { type ApiClient, type components, isApiError, itemsWith } from "@agilityhub/api-client";
import { Button, FormField, Modal, Select, useBranding } from "@agilityhub/ui";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

type Member = components["schemas"]["Member"];
type Group = components["schemas"]["FamilyGroup"];
type Candidate = Pick<Member, "id" | "fullName"> & {
  plan?: components["schemas"]["NamedReference"] | null;
  familyGroup?: components["schemas"]["NamedReference"];
};

/** Administrative membership is explicit; opening a group never changes billing or ownership. */
export function FamilyGroupAction({
  client,
  member,
  onChanged,
}: {
  client: ApiClient;
  member: Member;
  onChanged: () => void;
}) {
  const { t } = useTranslation(["admin-census", "errors"]);
  const billingEnabled = useBranding().modules.includes("BILLING");
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<Group>();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [holder, setHolder] = useState(member.id);
  const [adding, setAdding] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const [confirmDissolve, setConfirmDissolve] = useState(false);
  const begin = async (reset = true) => {
    setOpen(true);
    setPending(true);
    setFailure(undefined);
    setConfirmDissolve(false);
    setAdding("");
    try {
      const found =
        member.familyGroupId == null
          ? undefined
          : (
              await client.GET("/family-groups/{id}", {
                params: { path: { id: member.familyGroupId } },
              })
            ).data;
      if (member.familyGroupId != null && found === undefined)
        throw new Error("Missing family group");
      const current = found?.status === "ACTIVE" ? found : undefined;
      if (reset) {
        setGroup(current);
        setIds(current?.memberIds ?? [member.id]);
        setHolder(current?.holderMemberId ?? member.id);
      }
      const all: Candidate[] = [];
      for (let page = 0; ; page += 1) {
        const result = await client.GET("/members", {
          params: {
            query: {
              page,
              size: 200,
              filter: ["status:eq:ACTIVE"],
              fields: billingEnabled ? "fullName,plan,familyGroup" : "fullName,familyGroup",
              sort: ["lastName,asc"],
            },
          },
        });
        if (result.data === undefined) throw new Error("Missing member list");
        all.push(...itemsWith(result.data.items, ["fullName"] as const));
        if (result.data.items.length === 0 || all.length >= result.data.totalItems) break;
      }
      for (const item of current?.members ?? []) {
        if (!all.some((row) => row.id === item.id)) all.push(item);
      }
      if (!all.some((row) => row.id === member.id))
        all.push({
          id: member.id,
          fullName: member.fullName,
          ...(member.plan == null ? {} : { plan: member.plan }),
        });
      setCandidates(all);
    } catch (cause) {
      setFailure(cause);
    } finally {
      setPending(false);
    }
  };
  const save = async (dissolve = false) => {
    if (pending) return;
    setPending(true);
    setFailure(undefined);
    try {
      if (dissolve && group !== undefined) {
        await client.DELETE("/family-groups/{id}", { params: { path: { id: group.id } } });
      } else {
        const body = { holderMemberId: holder, memberIds: ids };
        if (group === undefined) await client.POST("/family-groups", { body });
        else
          await client.PUT("/family-groups/{id}", {
            params: { path: { id: group.id } },
            body: { ...body, version: group.version },
          });
      }
      setOpen(false);
      onChanged();
    } catch (cause) {
      setFailure(cause);
    } finally {
      setPending(false);
    }
  };
  const selected = ids
    .map((id) => candidates.find((item) => item.id === id))
    .filter((item) => item !== undefined);
  return (
    <>
      <Button variant="ghost" onClick={() => void begin()}>
        {t("admin-census:family.title")}
      </Button>
      {createPortal(
        <Modal
          title={t("admin-census:family.title")}
          closeLabel={t("admin-census:common.close")}
          open={open}
          onClose={() => {
            if (!pending) setOpen(false);
          }}
        >
          <p>
            {billingEnabled
              ? t("admin-census:family.help")
              : t("admin-census:family.helpWithoutBilling")}
          </p>
          {failure === undefined ? null : (
            <p role="alert">
              {isApiError(failure)
                ? t(`errors:${failure.code}`, {
                    defaultValue: t("admin-census:common.genericError"),
                  })
                : t("admin-census:common.genericError")}
            </p>
          )}
          <FormField id={`family-add-${member.id}`} label={t("admin-census:family.add")}>
            <Select
              id={`family-add-${member.id}`}
              disabled={pending}
              value={adding}
              onChange={(event) => {
                setAdding(event.currentTarget.value);
              }}
            >
              <option value="">{t("admin-census:family.choose")}</option>
              {candidates
                .filter(
                  (item) =>
                    !ids.includes(item.id) &&
                    (item.familyGroup == null || item.familyGroup.id === group?.id),
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName}
                  </option>
                ))}
            </Select>
          </FormField>
          <Button
            disabled={pending || adding === ""}
            variant="secondary"
            onClick={() => {
              setIds([...ids, adding]);
              setAdding("");
            }}
          >
            {t("admin-census:family.add")}
          </Button>
          <ul className="census-family-members">
            {selected.map((item) => (
              <li key={item.id}>
                <a
                  href={`/abonats/${encodeURIComponent(item.id)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.fullName}
                </a>
                {billingEnabled ? (
                  <span>{item.plan?.name ?? t("admin-census:values.empty")}</span>
                ) : null}
                <label>
                  <input
                    type="radio"
                    name={`family-holder-${member.id}`}
                    checked={holder === item.id}
                    disabled={pending}
                    onChange={() => {
                      setHolder(item.id);
                    }}
                  />{" "}
                  {t("admin-census:family.holder")}
                </label>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setIds(ids.filter((id) => id !== item.id));
                    if (holder === item.id) setHolder(ids.find((id) => id !== item.id) ?? "");
                  }}
                >
                  {t("admin-census:family.remove")}
                </Button>
              </li>
            ))}
          </ul>
          {billingEnabled ? <p>{t("admin-census:family.editPlanHelp")}</p> : null}
          <div className="census-record__dialog-actions">
            <Button
              disabled={pending || ids.length < 2 || !ids.includes(holder) || failure !== undefined}
              loading={pending}
              onClick={() => void save()}
            >
              {t("admin-census:common.save")}
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => void begin(isApiError(failure) && failure.code === "STALE_VERSION")}
            >
              {t("admin-census:family.reload")}
            </Button>
            {group === undefined ? null : (
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => {
                  setConfirmDissolve(true);
                }}
              >
                {t("admin-census:family.dissolve")}
              </Button>
            )}
          </div>
          {confirmDissolve ? (
            <div role="alert">
              <p>
                {billingEnabled
                  ? t("admin-census:family.dissolveConfirm")
                  : t("admin-census:family.dissolveConfirmWithoutBilling")}
              </p>
              <Button variant="danger" disabled={pending} onClick={() => void save(true)}>
                {t("admin-census:family.dissolve")}
              </Button>
            </div>
          ) : null}
        </Modal>,
        document.body,
      )}
    </>
  );
}
