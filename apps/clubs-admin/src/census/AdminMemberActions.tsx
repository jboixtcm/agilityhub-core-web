import {
  apiFieldErrors,
  isApiError,
  itemsWith,
  type ApiClient,
  type components,
  useSubmissionKeys,
} from "@agilityhub/api-client";
import {
  Button,
  Card,
  Checkbox,
  Drawer,
  FormField,
  Input,
  Modal,
  Select,
  useBranding,
} from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type Member = components["schemas"]["Member"];
type NewDog = components["schemas"]["AdminDogCreate"];
type Preview = components["schemas"]["MemberMergePreview"];
interface MergeCandidate {
  id: string;
  fullName: string;
  memberNumber?: number | null;
}
const memberLabel = (member: MergeCandidate) =>
  member.memberNumber == null
    ? member.fullName
    : `${member.fullName} · #${String(member.memberNumber)}`;

/** Explicit admin operations. The original record remains reachable after consolidation. */
export function AdminMemberActions({
  client,
  member,
  onChanged,
}: {
  client: ApiClient;
  member: Member;
  onChanged: () => void;
}) {
  const { t } = useTranslation(["admin-census", "errors", "enums"]);
  const branding = useBranding();
  const keys = useSubmissionKeys();
  const [action, setAction] = useState<"dog" | "merge">();
  const [dog, setDog] = useState<NewDog>({
    name: "",
    breed: "",
    sex: "MALE",
    birthDate: "",
    handlerName: member.firstName,
    handlerIsMember: true,
    freeTrainingAllowed: false,
  });
  const [levels, setLevels] = useState<components["schemas"]["LevelSummary"][]>([]);
  const [members, setMembers] = useState<MergeCandidate[]>([]);
  const [target, setTarget] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const [saved, setSaved] = useState(false);
  const close = () => {
    if (pending) return;
    setAction(undefined);
    setFailure(undefined);
    setPreview(undefined);
    keys.drop(member.id);
  };
  const errorText = isApiError(failure)
    ? t(`errors:${failure.code}`, { defaultValue: t("admin-census:common.genericError") })
    : t("admin-census:common.genericError");
  const fieldError = (field: string) =>
    apiFieldErrors(failure).some((item) => item.field === field)
      ? { error: t("admin-census:common.invalidField") }
      : {};

  useEffect(() => {
    if (action === undefined) return;
    let current = true;
    if (action === "dog") {
      void client.GET("/levels", { params: { query: { includeInactive: false } } }).then(
        (result) => {
          if (current) setLevels(result.data?.items ?? []);
        },
        (cause: unknown) => {
          if (current) setFailure(cause);
        },
      );
    } else {
      void (async () => {
        const all: MergeCandidate[] = [];
        for (let page = 0; ; page++) {
          const result = await client.GET("/members", {
            params: {
              query: {
                fields: "fullName,memberNumber",
                filter: ["status:eq:ACTIVE"],
                page,
                size: 200,
                sort: ["lastName,asc"],
              },
            },
          });
          if (result.data === undefined) throw new Error("Missing members");
          all.push(...itemsWith(result.data.items, ["fullName"] as const));
          if (all.length >= result.data.totalItems || result.data.items.length === 0) break;
        }
        return all.filter((item) => item.id !== member.id);
      })().then(
        (all) => {
          if (current) setMembers(all);
        },
        (cause: unknown) => {
          if (current) setFailure(cause);
        },
      );
    }
    return () => {
      current = false;
    };
  }, [action, client, member.id]);

  const merged = member.mergedIntoMemberId != null;
  return (
    <Card className="census-record__admin-actions">
      {merged ? (
        <p>
          {t("admin-census:merge.merged")}{" "}
          <a href={`/abonats/${encodeURIComponent(member.mergedIntoMemberId ?? "")}`}>
            {t("admin-census:merge.openTarget")}
          </a>
        </p>
      ) : member.erasedAt == null ? (
        <div className="census-record__dialog-actions">
          {member.status === "ACTIVE" ? (
            <Button
              onClick={() => {
                setDog({
                  name: "",
                  breed: "",
                  sex: "MALE",
                  birthDate: "",
                  handlerName: member.firstName,
                  handlerIsMember: true,
                  freeTrainingAllowed: false,
                });
                setAction("dog");
                setFailure(undefined);
                setSaved(false);
              }}
              variant="secondary"
            >
              {t("admin-census:addDog.title")}
            </Button>
          ) : null}
          <Button
            onClick={() => {
              setTarget("");
              setPreview(undefined);
              setAction("merge");
              setFailure(undefined);
              setSaved(false);
            }}
            variant="ghost"
          >
            {t("admin-census:merge.title")}
          </Button>
        </div>
      ) : null}
      {saved ? <p role="status">{t("admin-census:addDog.saved")}</p> : null}
      {(member.mergedMembers?.length ?? 0) > 0 ? (
        <div>
          <h3>{t("admin-census:merge.history")}</h3>
          <ul>
            {member.mergedMembers?.map((source) => (
              <li key={source.id}>
                <a href={`/abonats/${encodeURIComponent(source.id)}`}>{source.name}</a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Drawer
        closeLabel={t("admin-census:common.close")}
        open={action === "dog"}
        onClose={close}
        title={t("admin-census:addDog.title")}
      >
        <p>{t("admin-census:addDog.help", { member: member.fullName })}</p>
        <form
          className="census-record__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (pending) return;
            setPending(true);
            setFailure(undefined);
            void keys
              .send(
                JSON.stringify(dog),
                (key) =>
                  client.POST("/members/{id}/dogs", {
                    params: { path: { id: member.id }, header: { "Idempotency-Key": key } },
                    body: dog,
                  }),
                member.id,
              )
              .then((result) => {
                if (result.data === undefined) throw new Error("Missing dog");
                keys.drop(member.id);
                setAction(undefined);
                setSaved(true);
                onChanged();
              })
              .catch(setFailure)
              .finally(() => {
                setPending(false);
              });
          }}
        >
          {(["name", "breed", "birthDate", "chip", "handlerName"] as const).map((field) => (
            <FormField
              key={field}
              id={`new-dog-${field}`}
              {...fieldError(field)}
              label={t(`admin-census:dog.fields.${field === "handlerName" ? "handler" : field}`)}
            >
              <Input
                id={`new-dog-${field}`}
                type={field === "birthDate" ? "date" : "text"}
                required={["name", "breed", "birthDate"].includes(field)}
                maxLength={
                  field === "name"
                    ? 40
                    : field === "breed"
                      ? 60
                      : field === "handlerName"
                        ? 80
                        : undefined
                }
                value={dog[field] ?? ""}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setDog({ ...dog, [field]: value });
                }}
              />
            </FormField>
          ))}
          <label className="census-record__check-row">
            <Checkbox
              checked={dog.handlerIsMember ?? true}
              onChange={(event) => {
                setDog({ ...dog, handlerIsMember: event.currentTarget.checked });
              }}
            />
            {t("admin-census:dog.fields.handlerIsMember")}
          </label>
          <FormField id="new-dog-sex" label={t("admin-census:dog.fields.sex")}>
            <Select
              id="new-dog-sex"
              value={dog.sex}
              onChange={(event) => {
                setDog({ ...dog, sex: event.currentTarget.value as NewDog["sex"] });
              }}
            >
              {(["MALE", "FEMALE"] as const).map((sex) => (
                <option key={sex} value={sex}>
                  {t(`admin-census:signupReview.sex.${sex}`)}
                </option>
              ))}
            </Select>
          </FormField>
          {levels.length > 0 ? (
            <FormField id="new-dog-level" label={t("admin-census:signupReview.fields.level")}>
              <Select
                id="new-dog-level"
                value={dog.levelId ?? ""}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  const rest = { ...dog };
                  delete rest.levelId;
                  setDog(value === "" ? rest : { ...rest, levelId: value });
                }}
              >
                <option value="">{t("admin-census:values.empty")}</option>
                {levels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.code}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
          {branding.modules.includes("FREE_TRAINING") ? (
            <label className="census-record__check-row">
              <Checkbox
                checked={dog.freeTrainingAllowed ?? false}
                onChange={(event) => {
                  setDog({ ...dog, freeTrainingAllowed: event.currentTarget.checked });
                }}
              />
              {t("admin-census:dog.sections.freeTraining")}
            </label>
          ) : null}
          {failure === undefined ? null : <p role="alert">{errorText}</p>}
          <Button loading={pending} type="submit">
            {t("admin-census:common.save")}
          </Button>
        </form>
      </Drawer>
      <Modal
        closeLabel={t("admin-census:common.close")}
        open={action === "merge"}
        onClose={close}
        title={t("admin-census:merge.title")}
      >
        <p>{t("admin-census:merge.help", { source: memberLabel(member) })}</p>
        <FormField id="merge-target" label={t("admin-census:merge.target")}>
          <Select
            disabled={pending}
            id="merge-target"
            value={target}
            onChange={(event) => {
              setTarget(event.currentTarget.value);
              setPreview(undefined);
              setFailure(undefined);
              keys.drop(member.id);
            }}
          >
            <option value="">{t("admin-census:merge.choose")}</option>
            {members.map((item) => (
              <option key={item.id} value={item.id}>
                {memberLabel(item)}
              </option>
            ))}
          </Select>
        </FormField>
        {preview === undefined ? (
          <Button
            disabled={target === ""}
            loading={pending}
            onClick={() => {
              setPending(true);
              setFailure(undefined);
              void client
                .GET("/members/{id}/merge-preview", {
                  params: { path: { id: member.id }, query: { targetMemberId: target } },
                })
                .then((result) => {
                  if (result.data === undefined) throw new Error("Missing preview");
                  setPreview(result.data);
                })
                .catch(setFailure)
                .finally(() => {
                  setPending(false);
                });
            }}
          >
            {t("admin-census:merge.preview")}
          </Button>
        ) : (
          <>
            <p>
              <strong>
                {t("admin-census:merge.keep", { target: memberLabel(preview.target) })}
              </strong>
            </p>
            <p>{t("admin-census:merge.preserve")}</p>
            <ul>
              {Object.entries(preview.counts).map(([key, count]) => (
                <li key={key}>
                  {t(`admin-census:merge.counts.${key}`)}: {count}
                </li>
              ))}
            </ul>
            {preview.blockers.length === 0 ? null : (
              <ul role="alert">
                {preview.blockers.map((blocker) => (
                  <li key={blocker}>
                    {t(`admin-census:merge.blockers.${blocker}`, {
                      defaultValue: t("admin-census:merge.blocked"),
                    })}
                  </li>
                ))}
              </ul>
            )}
            <Button
              disabled={preview.blockers.length > 0}
              loading={pending}
              onClick={() => {
                setPending(true);
                setFailure(undefined);
                const body = {
                  targetMemberId: preview.target.id,
                  sourceVersion: preview.source.version,
                  targetVersion: preview.target.version,
                };
                void keys
                  .send(
                    JSON.stringify(body),
                    (key) =>
                      client.POST("/members/{id}/merge", {
                        params: { path: { id: member.id }, header: { "Idempotency-Key": key } },
                        body,
                      }),
                    member.id,
                  )
                  .then((result) => {
                    if (result.data === undefined) throw new Error("Missing merge result");
                    keys.drop(member.id);
                    setAction(undefined);
                    onChanged();
                  })
                  .catch((cause: unknown) => {
                    setFailure(cause);
                    if (isApiError(cause, "STALE_VERSION")) {
                      setPreview(undefined);
                      keys.drop(member.id);
                    }
                  })
                  .finally(() => {
                    setPending(false);
                  });
              }}
            >
              {t("admin-census:merge.confirm")}
            </Button>
          </>
        )}
        {failure === undefined ? null : <p role="alert">{errorText}</p>}
      </Modal>
    </Card>
  );
}
