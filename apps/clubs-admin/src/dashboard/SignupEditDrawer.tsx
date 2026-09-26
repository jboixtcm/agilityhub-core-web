import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import {
  Button,
  Drawer,
  FormField,
  Icon,
  Input,
  Select,
  Textarea,
  useBranding,
} from "@agilityhub/ui";
import { type SyntheticEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { loadDogDocumentTypes, signupPerson } from "./readmission";

type SignupView = components["schemas"]["MemberSignupView"];
type Member = SignupView["member"];
type Dog = SignupView["dogs"][number];
type MemberPatch = components["schemas"]["MemberPatch"];
type DogPatch = components["schemas"]["DogPatch"];
type DogDocument = components["schemas"]["DogDocument"];
type SignupFile = components["schemas"]["SignupFile"];
type Gender = Member["gender"];
type PaymentType = components["schemas"]["PaymentMethodPatch"]["type"];

/**
 * A reused dog's submitted documents as the drawer last sent them (E38): a new upload has no
 * download link until the view is read again.
 */
interface SubmittedDocument {
  files: (SignupFile & { downloadUrl?: string })[];
  type: string;
}

/** What a reused dog's `PATCH /dogs/{id}` sent, and the version it answered. */
interface SentDocuments {
  documents: readonly SubmittedDocument[];
  version: number;
}

interface PersonForm {
  accountHolder: string;
  birthDate: string;
  city: string;
  email1: string;
  email2: string;
  firstName: string;
  gender: Gender;
  holderTaxId: string;
  iban: string;
  idDocument: string;
  lastName1: string;
  lastName2: string;
  paymentType: PaymentType | "";
  phone1Label: string;
  phone1Number: string;
  phone1Prefix: string;
  phone2Label: string;
  phone2Number: string;
  phone2Prefix: string;
  postalCode: string;
  street: string;
}

interface DogForm {
  birthMonth: string;
  breed: string;
  chip: string;
  name: string;
  notesToInstructors: string;
  sex: Dog["sex"];
}

type PersonTextKey = Exclude<keyof PersonForm, "gender" | "paymentType">;
type DogTextKey = Exclude<keyof DogForm, "notesToInstructors" | "sex">;

/** The identity document's label names its type (R-04-01): DNI and NIE share «DNI/NIE». */
export function idDocumentLabel(
  type: string | null | undefined,
  t: (key: string) => string,
): string {
  if (type === "PASSPORT") return t("admin-census:signupReview.fields.passport");
  if (type === "OTHER") return t("admin-census:signupReview.fields.otherDocument");
  return t("admin-census:signupReview.fields.idDocument");
}

/** `paymentType` is the view's current method (R-04-19), `""` without one. */
function personForm(member: Member, paymentType: PaymentType | ""): PersonForm {
  const [email1, email2] = member.contactEmails;
  const [phone1, phone2] = member.phones;
  return {
    accountHolder: member.paymentMethod?.holderName ?? member.fullName,
    birthDate: member.birthDate,
    city: member.address.city,
    email1: email1?.email ?? "",
    email2: email2?.email ?? "",
    firstName: member.firstName,
    gender: member.gender,
    // The view never carries the stored tax id or IBAN (masked): an empty field means «unchanged».
    holderTaxId: "",
    iban: "",
    idDocument: member.idDocument?.number ?? "",
    lastName1: member.lastName1,
    lastName2: member.lastName2 ?? "",
    paymentType,
    phone1Label: phone1?.label ?? "",
    phone1Number: phone1?.number ?? "",
    phone1Prefix: phone1?.prefix ?? "",
    phone2Label: phone2?.label ?? "",
    phone2Number: phone2?.number ?? "",
    phone2Prefix: phone2?.prefix ?? phone1?.prefix ?? "",
    postalCode: member.address.postalCode,
    street: member.address.street,
  };
}

function dogForm(dog: Dog): DogForm {
  return {
    birthMonth: dog.birthMonth,
    breed: dog.breed,
    chip: dog.chip,
    name: dog.name,
    notesToInstructors: dog.notesToInstructors ?? "",
    sex: dog.sex,
  };
}

function changedKeys<T extends object>(current: T, edits: Partial<T>): (keyof T)[] {
  return (Object.keys(edits) as (keyof T)[]).filter((key) => edits[key] !== current[key]);
}

/**
 * R-04-19 PATCH body with only the fields the admin changed: the whole contact arrays are sent
 * (the api replaces them), built from both entries, so fixing the first email keeps the second.
 */
function memberPatch(
  member: Member,
  paymentType: PaymentType | "",
  edits: Partial<PersonForm>,
  billing: boolean,
): MemberPatch | undefined {
  const current = personForm(member, paymentType);
  const value = { ...current, ...edits };
  const changed = new Set(changedKeys(current, edits));
  const body: MemberPatch = { version: member.version };
  if (changed.has("firstName")) body.firstName = value.firstName.trim();
  if (changed.has("lastName1")) body.lastName1 = value.lastName1.trim();
  if (changed.has("lastName2")) body.lastName2 = value.lastName2.trim();
  if (changed.has("birthDate")) body.birthDate = value.birthDate;
  if (changed.has("gender")) body.gender = value.gender;
  if (changed.has("idDocument")) {
    body.idDocument = { number: value.idDocument.trim(), type: member.idDocument?.type ?? "OTHER" };
  }
  if (changed.has("email1") || changed.has("email2")) {
    body.contactEmails = [value.email1, value.email2]
      .map((email) => email.trim())
      .filter((email) => email !== "")
      .map((email) => ({ email }));
  }
  if (
    (["phone1Prefix", "phone1Number", "phone1Label", "phone2Prefix", "phone2Number", "phone2Label"] as const).some(
      (key) => changed.has(key),
    )
  ) {
    body.phones = [
      { label: value.phone1Label, number: value.phone1Number, prefix: value.phone1Prefix },
      { label: value.phone2Label, number: value.phone2Number, prefix: value.phone2Prefix },
    ]
      .filter((phone) => phone.number.trim() !== "")
      .map((phone) => ({
        ...(phone.label.trim() === "" ? {} : { label: phone.label.trim() }),
        number: phone.number.trim(),
        prefix: phone.prefix.trim(),
      }));
  }
  if (changed.has("street") || changed.has("postalCode") || changed.has("city")) {
    body.address = {
      ...member.address,
      city: value.city.trim(),
      postalCode: value.postalCode.trim(),
      street: value.street.trim(),
    };
  }
  const methodChanged = changed.has("paymentType");
  if (
    billing &&
    value.paymentType === "SEPA_DD" &&
    (methodChanged || changed.has("iban") || changed.has("accountHolder") || changed.has("holderTaxId"))
  ) {
    // R-04-10: the IBAN is optional (without it the member shows «Compte no informat»).
    body.paymentMethod = {
      sepa: {
        holderName: value.accountHolder.trim(),
        ...(value.holderTaxId.trim() === "" ? {} : { holderTaxId: value.holderTaxId.trim() }),
        ...(value.iban.trim() === "" ? {} : { iban: value.iban.replaceAll(/\s/gu, "") }),
      },
      type: "SEPA_DD",
    };
  } else if (billing && methodChanged && value.paymentType !== "") {
    // R-04-10: nothing is captured here for a card (R-04-26) or cash (the channel is set on D10).
    body.paymentMethod = { type: value.paymentType };
  }
  return Object.keys(body).length > 1 ? body : undefined;
}

function dogPatch(dog: Dog, edits: Partial<DogForm>): DogPatch | undefined {
  const current = dogForm(dog);
  const value = { ...current, ...edits };
  const body: DogPatch = { version: dog.version };
  for (const key of changedKeys(current, edits)) {
    if (key === "sex") body.sex = value.sex;
    else if (key === "birthMonth") body.birthMonth = value.birthMonth.trim();
    else body[key] = value[key].trim();
  }
  return Object.keys(body).length > 1 ? body : undefined;
}

function SignupDogDocuments({
  client,
  dog,
  idPrefix,
  onChanged,
}: {
  client: ApiClient;
  dog: Dog;
  idPrefix: string;
  onChanged: () => void;
}) {
  const { t } = useTranslation(["admin-census", "errors"]);
  const [documents, setDocuments] = useState<DogDocument[]>();
  const [type, setType] = useState<string>();
  const [file, setFile] = useState<File>();
  const [fileInput, setFileInput] = useState(0);
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    client.GET("/dogs/{id}/documents", { params: { path: { id: dog.id } } }).then(
      (result) => {
        if (active) setDocuments(result.data ?? []);
      },
      (cause: unknown) => {
        if (!active) return;
        setDocuments([]);
        setError(
          isApiError(cause)
            ? t(`errors:${cause.code}`, { defaultValue: t("admin-census:signupReview.genericError") })
            : t("admin-census:signupReview.genericError"),
        );
      },
    );
    return () => {
      active = false;
    };
  }, [client, dog.id, t]);

  const failure = (cause: unknown) => {
    setError(
      isApiError(cause)
        ? t(`errors:${cause.code}`, { defaultValue: t("admin-census:signupReview.genericError") })
        : t("admin-census:signupReview.genericError"),
    );
  };

  const selectedType = type ?? documents?.[0]?.type ?? "";

  const upload = async () => {
    if (file === undefined || selectedType === "") return;
    setPending("upload");
    setError(undefined);
    try {
      const signed = await client.POST("/attachments/upload-url", {
        body: {
          fileName: file.name,
          mimeType: file.type === "" ? "application/octet-stream" : file.type,
          purpose: "DOG_DOCUMENT",
          sizeBytes: file.size,
        },
      });
      if (signed.data === undefined) throw new TypeError("Upload response did not contain data");
      // R-04-08: the storage signed these headers (Content-Type, If-None-Match); S3 answers 403 without them.
      const stored = await fetch(signed.data.uploadUrl, {
        body: file,
        headers: signed.data.headers,
        method: "PUT",
      });
      if (!stored.ok) throw new TypeError("File upload failed");
      const created = await client.POST("/dogs/{id}/documents", {
        body: { fileKey: signed.data.fileKey, name: file.name, type: selectedType },
        params: { path: { id: dog.id } },
      });
      const document = created.data;
      if (document === undefined) throw new TypeError("Document response did not contain data");
      setDocuments((current = []) =>
        current.some((item) => item.id === document.id)
          ? current.map((item) => (item.id === document.id ? document : item))
          : [...current, document],
      );
      setFile(undefined);
      setFileInput((value) => value + 1);
      onChanged();
    } catch (cause) {
      failure(cause);
    } finally {
      setPending(undefined);
    }
  };

  const remove = async (document: DogDocument, fileId: string) => {
    setPending(fileId);
    setError(undefined);
    try {
      await client.DELETE("/dogs/{id}/documents/{docId}/files/{fileId}", {
        params: { path: { docId: document.id, fileId, id: dog.id } },
      });
      setDocuments((current = []) =>
        current.map((item) => {
          if (item.id !== document.id) return item;
          const files = item.files.filter((candidate) => candidate.id !== fileId);
          return { ...item, files, state: files.length === 0 ? "PENDING" : "RECEIVED" };
        }),
      );
      onChanged();
    } catch (cause) {
      failure(cause);
    } finally {
      setPending(undefined);
    }
  };

  return (
    <div aria-busy={documents === undefined || undefined} className="signup-edit-documents">
      <span className="ah-form-field__label">{t("admin-census:signupReview.fields.documents")}</span>
      <ul>
        {(documents ?? []).flatMap((document) =>
          document.files.map((documentFile) => (
            <li key={documentFile.id}>
              <a href={documentFile.url} rel="noreferrer" target="_blank">
                <Icon aria-hidden="true" name="doc" /> {documentFile.name}
              </a>
              <Button
                disabled={pending !== undefined && pending !== documentFile.id}
                loading={pending === documentFile.id}
                onClick={() => void remove(document, documentFile.id)}
                variant="ghost"
              >
                {t("admin-census:dog.documents.remove")}
              </Button>
            </li>
          )),
        )}
      </ul>
      {documents === undefined || documents.length === 0 ? null : (
        <div className="signup-edit-documents__add">
          <FormField id={`${idPrefix}-document-type`} label={t("admin-census:dog.documents.type")}>
            <Select
              id={`${idPrefix}-document-type`}
              onChange={(event) => {
                setType(event.currentTarget.value);
              }}
              value={selectedType}
            >
              {documents.map((document) => (
                <option key={document.type} value={document.type}>
                  {document.typeLabel}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id={`${idPrefix}-document-file`} label={t("admin-census:dog.documents.file")}>
            <Input
              accept="image/*,application/pdf"
              id={`${idPrefix}-document-file`}
              key={fileInput}
              onChange={(event) => {
                setFile(event.currentTarget.files?.[0]);
              }}
              type="file"
            />
          </FormField>
          <Button
            disabled={file === undefined || (pending !== undefined && pending !== "upload")}
            loading={pending === "upload"}
            onClick={() => void upload()}
            variant="ghost"
          >
            <Icon aria-hidden="true" name="up" />
            {t("admin-census:dog.documents.upload")}
          </Button>
        </div>
      )}
      {error === undefined ? null : <p role="alert">{error}</p>}
    </div>
  );
}

/** The drawer's message for a failed request: `READMISSION_PENDING` names the frozen dog record. */
function dogErrorText(cause: unknown, t: ReturnType<typeof useTranslation>["t"]): string {
  if (isApiError(cause, "STALE_VERSION")) return t("admin-census:signupReview.stale");
  if (
    isApiError(cause, "INVALID_STATE") &&
    typeof cause.details === "object" &&
    cause.details !== null &&
    (cause.details as Record<string, unknown>).reason === "READMISSION_PENDING"
  ) {
    return t("admin-census:signupReview.readmission.dogLocked");
  }
  return isApiError(cause)
    ? t(`errors:${cause.code}`, { defaultValue: t("admin-census:signupReview.genericError") })
    : t("admin-census:signupReview.genericError");
}

/**
 * The submitted documents of the reused dog of a pending readmission (R-04-06, R-04-19; api
 * E3-T17, E5-T19). Its record is frozen, so they change only through `PATCH /dogs/{id}`, one type
 * at a time: a file is added by sending the type's kept `fileKey`s plus the new upload, removed by
 * sending the kept ones; the last file of a type withdraws it (`files: []`), and the view then shows
 * the dog's own row for that type again (R-04-06), which the validation keeps. A row that is the
 * record's own (`own`) offers no [Retira]: the api cannot withdraw it (a no-op). A kept file keeps
 * its stored name, so there is no rename. The PATCH answers the dog record: the parent keeps what
 * was sent (and the version answered) until the view, read again, catches up. The club's document
 * types (`census.dogDocumentTypes`) label the choice, since the frozen record's own rows are not
 * the list.
 */
function ReadmissionDogDocuments({
  busy,
  client,
  documents,
  dogId,
  idPrefix,
  onBusy,
  onReload,
  onSent,
  own,
  version,
}: {
  busy: boolean;
  client: ApiClient;
  documents: readonly SubmittedDocument[];
  dogId: string;
  idPrefix: string;
  onBusy: (busy: boolean) => void;
  onReload: () => void;
  onSent: (sent: SentDocuments) => void;
  /** The record's own documents (`readmission.current.documents`). */
  own: readonly SubmittedDocument[];
  version: number;
}) {
  const { i18n, t } = useTranslation(["admin-census", "errors"]);
  const [types, setTypes] = useState<readonly { key: string; label: string }[]>();
  const [type, setType] = useState<string>();
  const [file, setFile] = useState<File>();
  const [fileInput, setFileInput] = useState(0);
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    loadDogDocumentTypes(client, i18n.resolvedLanguage ?? i18n.language).then(
      (loaded) => {
        if (active) setTypes(loaded);
      },
      (cause: unknown) => {
        if (!active) return;
        setTypes([]);
        setError(dogErrorText(cause, t));
      },
    );
    return () => {
      active = false;
    };
  }, [client, i18n.language, i18n.resolvedLanguage, t]);

  const selectedType = type ?? types?.[0]?.key ?? "";
  const kept = (documentType: string): SignupFile[] =>
    (documents.find((document) => document.type === documentType)?.files ?? []).map((item) => ({
      fileKey: item.fileKey,
      name: item.name,
    }));
  const ownRow = (documentType: string) => own.find((document) => document.type === documentType);
  const keysOf = (document: SubmittedDocument | undefined) =>
    (document?.files ?? []).map((item) => item.fileKey).join("\n");
  /** The row shown is the record's own, not a submitted one: nothing of it can be withdrawn. */
  const isOwnRow = (document: SubmittedDocument) => {
    const record = ownRow(document.type);
    return record !== undefined && keysOf(record) === keysOf(document);
  };

  /** One type's files as they must be after the change, sent with the dog's version. */
  const send = async (documentType: string, files: SubmittedDocument["files"], action: string) => {
    setPending(action);
    onBusy(true);
    setError(undefined);
    try {
      const result = await client.PATCH("/dogs/{id}", {
        body: { documents: [{ files: files.map(({ fileKey, name }) => ({ fileKey, name })), type: documentType }], version },
        params: { path: { id: dogId } },
      });
      // A withdrawn type shows the record's own row again, or no row when the record has none.
      const row = files.length === 0 ? ownRow(documentType) : { files, type: documentType };
      const next =
        row === undefined
          ? documents.filter((document) => document.type !== documentType)
          : documents.some((document) => document.type === documentType)
            ? documents.map((document) => (document.type === documentType ? row : document))
            : [...documents, row];
      onSent({ documents: next, version: result.data?.version ?? version + 1 });
      onReload();
      return true;
    } catch (cause) {
      setError(dogErrorText(cause, t));
      // A key another admin removed (400 FILE_NOT_FOUND) or a newer version: read the view again.
      if (isApiError(cause, "FILE_NOT_FOUND") || isApiError(cause, "STALE_VERSION")) onReload();
      return false;
    } finally {
      setPending(undefined);
      onBusy(false);
    }
  };

  const remove = (documentType: string, fileKey: string) =>
    send(
      documentType,
      (documents.find((document) => document.type === documentType)?.files ?? []).filter((item) => item.fileKey !== fileKey),
      fileKey,
    );

  const upload = async () => {
    if (file === undefined || selectedType === "") return;
    setPending("upload");
    onBusy(true);
    setError(undefined);
    let fileKey: string;
    try {
      const signed = await client.POST("/attachments/upload-url", {
        body: {
          fileName: file.name,
          mimeType: file.type === "" ? "application/octet-stream" : file.type,
          purpose: "DOG_DOCUMENT",
          sizeBytes: file.size,
        },
      });
      if (signed.data === undefined) throw new TypeError("Upload response did not contain data");
      // R-04-08: the storage signed these headers (Content-Type, If-None-Match); S3 answers 403 without them.
      const stored = await fetch(signed.data.uploadUrl, { body: file, headers: signed.data.headers, method: "PUT" });
      if (!stored.ok) throw new TypeError("File upload failed");
      fileKey = signed.data.fileKey;
    } catch (cause) {
      setError(dogErrorText(cause, t));
      setPending(undefined);
      onBusy(false);
      return;
    }
    if (await send(selectedType, [...kept(selectedType), { fileKey, name: file.name }], "upload")) {
      setFile(undefined);
      setFileInput((value) => value + 1);
    }
  };

  const disabled = busy || pending !== undefined;
  return (
    <div className="signup-edit-documents">
      <span className="ah-form-field__label">{t("admin-census:signupReview.fields.documents")}</span>
      <ul>
        {documents.flatMap((document) =>
          document.files.map((documentFile) => (
            <li key={documentFile.fileKey}>
              {documentFile.downloadUrl === undefined ? (
                <span>
                  <Icon aria-hidden="true" name="doc" /> {documentFile.name}
                </span>
              ) : (
                <a href={documentFile.downloadUrl} rel="noreferrer" target="_blank">
                  <Icon aria-hidden="true" name="doc" /> {documentFile.name}
                </a>
              )}
              {isOwnRow(document) ? null : (
                <Button
                  disabled={disabled && pending !== documentFile.fileKey}
                  loading={pending === documentFile.fileKey}
                  onClick={() => void remove(document.type, documentFile.fileKey)}
                  variant="ghost"
                >
                  {t("admin-census:dog.documents.remove")}
                </Button>
              )}
            </li>
          )),
        )}
      </ul>
      {types === undefined || types.length === 0 ? null : (
        <div className="signup-edit-documents__add">
          <FormField id={`${idPrefix}-document-type`} label={t("admin-census:dog.documents.type")}>
            <Select
              disabled={disabled}
              id={`${idPrefix}-document-type`}
              onChange={(event) => {
                setType(event.currentTarget.value);
              }}
              value={selectedType}
            >
              {types.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id={`${idPrefix}-document-file`} label={t("admin-census:dog.documents.file")}>
            <Input
              accept="image/*,application/pdf"
              disabled={disabled}
              id={`${idPrefix}-document-file`}
              key={fileInput}
              onChange={(event) => {
                setFile(event.currentTarget.files?.[0]);
              }}
              type="file"
            />
          </FormField>
          <Button
            disabled={file === undefined || (disabled && pending !== "upload")}
            loading={pending === "upload"}
            onClick={() => void upload()}
            variant="ghost"
          >
            <Icon aria-hidden="true" name="up" />
            {t("admin-census:dog.documents.upload")}
          </Button>
        </div>
      )}
      {error === undefined ? null : <p role="alert">{error}</p>}
    </div>
  );
}

/**
 * [EDITA LES DADES] of D2 (R-04-19): the fields of 16/17/19. Only the fields the admin changed are
 * sent, each entity with its own `version` (the member's for the person, each dog's for its dog).
 * The edits outlive a reload of the view, so a partial save or a stale version is rebased on the
 * fresh values instead of discarding what the admin typed. With an ACTIVE member (a dog added
 * from the app, R-04-25) the person is read-only here: only the pending dogs are edited.
 */
export function SignupEditDrawer({
  client,
  onClose,
  onReload,
  onSaved,
  open,
  signup,
}: {
  client: ApiClient;
  onClose: () => void;
  onReload: () => void;
  onSaved: () => void;
  open: boolean;
  signup: SignupView;
}) {
  const { t } = useTranslation(["admin-census", "errors"]);
  const branding = useBranding();
  const billing = branding.modules.includes("BILLING");
  // E38: a readmission edits its submitted values (the api keeps `member` as the LEFT record).
  const member = signupPerson(signup);
  const addDogMode = member.status === "ACTIVE";
  // R-04-06 (E38): the readmission matched on the document, so it is read-only while it waits.
  // An ordinary signup has no readmission block (absent, or `null` as the core writes it).
  const readmissionPending = signup.signup.readmission || signup.readmission != null;
  const [personEdits, setPersonEdits] = useState<Partial<PersonForm>>({});
  const [dogEdits, setDogEdits] = useState<Readonly<Record<string, Partial<DogForm>>>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<{ stale: boolean; text: string }>();
  // E38: what each reused dog's document PATCH sent and the version it answered, kept until the
  // view read again carries that version, so a change made meanwhile builds on it.
  const [sentDocuments, setSentDocuments] = useState<Readonly<Record<string, SentDocuments>>>({});
  const [documentsBusy, setDocumentsBusy] = useState(false);
  // R-04-10, R-04-19 (api E3-T14): the view lists the methods D2 offers and marks the applicant's
  // (`current`); only the `assignable` ones can be chosen. None assignable (an add-dog, whose
  // method is changed on D10) shows the current one read-only; an empty list shows no row.
  const methods = billing ? signup.paymentMethods : [];
  const currentMethod = methods.find((method) => method.current)?.type ?? "";
  const assignableMethods = methods.filter((method) => method.assignable).map((method) => method.type);

  const person: PersonForm = { ...personForm(member, currentMethod), ...personEdits };
  const requestedPlanId = signup.signup.planIdRequested ?? signup.proposals.planId;
  const requestedPlan =
    signup.planOptions.find((plan) => plan.planId === requestedPlanId)?.name ??
    member.plan?.name ??
    t("admin-census:values.empty");
  const hasStoredIban =
    member.paymentMethod?.type === "SEPA_DD" &&
    member.accountMissing !== true &&
    (member.paymentMethod.maskedAccount ?? member.maskedAccount) !== undefined;
  const paymentTouched =
    personEdits.accountHolder !== undefined || personEdits.holderTaxId !== undefined;

  const reset = () => {
    setPersonEdits({});
    setDogEdits({});
    setError(undefined);
  };

  const close = () => {
    reset();
    onClose();
  };

  /** A dog's version: the one its last document PATCH answered while the view is still older. */
  const dogVersion = (dog: Dog): number => Math.max(dog.version, sentDocuments[dog.id]?.version ?? 0);

  /** `READMISSION_PENDING` names what is frozen: the person's document, or the reused dog's record. */
  const showError = (cause: unknown, entity: "dog" | "member") => {
    const stale = isApiError(cause, "STALE_VERSION");
    const readmissionLocked =
      isApiError(cause, "INVALID_STATE") &&
      typeof cause.details === "object" &&
      cause.details !== null &&
      (cause.details as Record<string, unknown>).reason === "READMISSION_PENDING";
    setError({
      stale,
      text:
        readmissionLocked && entity === "member"
          ? t("admin-census:signupReview.readmission.documentLocked")
          : dogErrorText(cause, t),
    });
  };

  const save = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorking(true);
    setError(undefined);
    let saved = false;
    let entity: "dog" | "member" = "member";
    try {
      const body = addDogMode ? undefined : memberPatch(member, currentMethod, personEdits, billing);
      if (body !== undefined) {
        await client.PATCH("/members/{id}", { body, params: { path: { id: member.id } } });
        setPersonEdits({});
        saved = true;
      }
      entity = "dog";
      for (const dog of signup.dogs) {
        const edits = dogEdits[dog.id];
        // R-04-06 (b): the reused dog's chip is read-only while the readmission waits (never sent).
        const editable = dog.readmission == null ? edits : { ...edits, chip: dog.chip };
        const dogBody =
          dog.status === "PENDING" && edits !== undefined
            ? dogPatch({ ...dog, version: dogVersion(dog) }, editable ?? {})
            : undefined;
        if (dogBody === undefined) continue;
        await client.PATCH("/dogs/{id}", { body: dogBody, params: { path: { id: dog.id } } });
        setDogEdits((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== dog.id)));
        saved = true;
      }
      reset();
      onSaved();
    } catch (cause) {
      showError(cause, entity);
      // A partial save (the member saved, a dog failed) moved some versions: reload the view so the
      // next attempt sends the fresh versions with the edits still pending.
      if (saved) onReload();
    } finally {
      setWorking(false);
    }
  };

  const personInput = (key: PersonTextKey, label: string, type = "text", required = false) => (
    <FormField id={`signup-edit-${key}`} key={key} label={label}>
      <Input
        autoComplete={key === "iban" || key === "holderTaxId" ? "off" : undefined}
        id={`signup-edit-${key}`}
        onChange={(event) => {
          const input = event.currentTarget.value;
          setPersonEdits((current) => ({ ...current, [key]: input }));
        }}
        required={required}
        type={type}
        value={person[key]}
      />
    </FormField>
  );

  const dogValue = (dog: Dog): DogForm => ({ ...dogForm(dog), ...dogEdits[dog.id] });
  const editDog = (dog: Dog, patch: Partial<DogForm>) => {
    setDogEdits((current) => ({ ...current, [dog.id]: { ...current[dog.id], ...patch } }));
  };

  return (
    <Drawer
      closeLabel={t("admin-census:signupReview.cancel")}
      onClose={close}
      open={open}
      title={t("admin-census:signupReview.editTitle")}
    >
      <form className="signup-edit-form" onSubmit={(event) => void save(event)}>
        {/* Locked while saving: an edit typed during the request would be lost with the saved ones. */}
        <fieldset disabled={addDogMode || working}>
          <legend>{t("admin-census:signupReview.person")}</legend>
          {personInput("firstName", t("admin-census:signupReview.fields.firstName"))}
          {personInput("lastName1", t("admin-census:signupReview.fields.lastName1"))}
          {personInput("lastName2", t("admin-census:signupReview.fields.lastName2"))}
          {personInput("birthDate", t("admin-census:signupReview.fields.birthDate"), "date")}
          <FormField id="signup-edit-gender" label={t("admin-census:signupReview.fields.gender")}>
            <Select
              id="signup-edit-gender"
              onChange={(event) => {
                const input = event.currentTarget.value as Gender;
                setPersonEdits((current) => ({ ...current, gender: input }));
              }}
              value={person.gender}
            >
              {(["FEMALE", "MALE", "OTHER"] as const).map((gender) => (
                <option key={gender} value={gender}>
                  {t(`admin-census:signupReview.gender.${gender}`)}
                </option>
              ))}
            </Select>
          </FormField>
          {readmissionPending ? (
            <FormField id="signup-edit-idDocument" label={idDocumentLabel(member.idDocument?.type, t)}>
              <Input
                aria-describedby="signup-edit-idDocument-help"
                id="signup-edit-idDocument"
                readOnly
                value={member.idDocument?.number ?? ""}
              />
              <small className="ah-form-field__help" id="signup-edit-idDocument-help">
                {t("admin-census:signupReview.readmission.documentLocked")}
              </small>
            </FormField>
          ) : (
            personInput("idDocument", idDocumentLabel(member.idDocument?.type, t))
          )}
          {personInput("email1", t("admin-census:signupReview.fields.email"), "email", true)}
          {personInput("email2", t("admin-census:signupReview.fields.secondEmail"), "email")}
          <div className="signup-edit-form__row">
            {personInput("phone1Prefix", t("admin-census:signupReview.fields.phonePrefix"))}
            {personInput("phone1Number", t("admin-census:signupReview.fields.phone"), "tel", true)}
          </div>
          <fieldset>
            <legend>{t("admin-census:signupReview.fields.secondPhone")}</legend>
            <div className="signup-edit-form__row">
              {personInput("phone2Prefix", t("admin-census:signupReview.fields.phonePrefix"))}
              {personInput("phone2Number", t("admin-census:signupReview.fields.phone"), "tel")}
              {/* R-04-03: the second phone needs its label. */}
              {personInput("phone2Label", t("admin-census:signupReview.fields.phoneLabel"), "text", person.phone2Number.trim() !== "")}
            </div>
          </fieldset>
          {personInput("street", t("admin-census:signupReview.fields.street"))}
          {personInput("postalCode", t("admin-census:signupReview.fields.postalCode"))}
          {personInput("city", t("admin-census:signupReview.fields.city"))}
          {methods.length === 0 ? null : (
            <FormField id="signup-edit-paymentType" label={t("admin-census:signupReview.fields.paymentMethod")}>
              {assignableMethods.length === 0 ? (
                <Input
                  id="signup-edit-paymentType"
                  readOnly
                  value={
                    currentMethod === ""
                      ? t("admin-census:values.empty")
                      : t(`admin-census:signupReview.paymentMethod.${currentMethod}`)
                  }
                />
              ) : (
                <Select
                  id="signup-edit-paymentType"
                  onChange={(event) => {
                    const input = event.currentTarget.value as PaymentType;
                    setPersonEdits((current) => ({ ...current, paymentType: input }));
                  }}
                  value={person.paymentType}
                >
                  {person.paymentType === "" ? <option value="">{t("admin-census:values.empty")}</option> : null}
                  {/* The applicant's method whose provider is off since stays shown, but cannot be chosen again. */}
                  {methods.map((method) => (
                    <option disabled={!method.assignable} key={method.type} value={method.type}>
                      {t(`admin-census:signupReview.paymentMethod.${method.type}`)}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          )}
          {/* The SEPA data can only be sent with SEPA assignable (else the api answers 422). */}
          {person.paymentType === "SEPA_DD" && assignableMethods.includes("SEPA_DD") ? (
            <>
              {/* The api replaces the SEPA data: a stored IBAN must be typed again with a new holder. */}
              {personInput("iban", t("admin-census:signupReview.fields.iban"), "text", hasStoredIban && paymentTouched)}
              {personInput("accountHolder", t("admin-census:signupReview.fields.accountHolder"))}
              {personInput("holderTaxId", t("admin-census:signupReview.fields.holderTaxId"))}
            </>
          ) : null}
          <FormField id="signup-edit-requested-plan" label={t("admin-census:signupReview.fields.requestedPlan")}>
            <Input id="signup-edit-requested-plan" readOnly value={requestedPlan} />
          </FormField>
        </fieldset>
        {signup.dogs.map((dog, index) => {
          const value = dogValue(dog);
          const idPrefix = `signup-edit-dog-${String(index)}`;
          const dogInput = (key: DogTextKey) => (
            <FormField id={`${idPrefix}-${key}`} key={key} label={t(`admin-census:signupReview.fields.${key}`)}>
              <Input
                id={`${idPrefix}-${key}`}
                onChange={(event) => {
                  editDog(dog, { [key]: event.currentTarget.value });
                }}
                value={value[key]}
              />
            </FormField>
          );
          // R-04-06, E38: the reused dog of a pending readmission (`null` for any other dog).
          const reused = dog.readmission != null;
          const sent = sentDocuments[dog.id];
          const submittedDocuments = sent !== undefined && sent.version > dog.version ? sent.documents : dog.documents;
          return (
            <fieldset disabled={dog.status !== "PENDING" || working || documentsBusy} key={dog.id}>
              <legend>{t("admin-census:signupReview.dog", { current: index + 1, total: signup.dogs.length })}</legend>
              {dogInput("name")}
              {dogInput("breed")}
              {dogInput("birthMonth")}
              {reused ? (
                // R-04-06 (b): the readmission matched on the chip, so it cannot change while it waits.
                <FormField id={`${idPrefix}-chip`} label={t("admin-census:signupReview.fields.chip")}>
                  <Input aria-describedby={`${idPrefix}-chip-help`} id={`${idPrefix}-chip`} readOnly value={dog.chip} />
                  <small className="ah-form-field__help" id={`${idPrefix}-chip-help`}>
                    {t("admin-census:signupReview.readmission.dogLocked")}
                  </small>
                </FormField>
              ) : (
                dogInput("chip")
              )}
              <FormField id={`${idPrefix}-sex`} label={t("admin-census:signupReview.fields.sex")}>
                <Select
                  id={`${idPrefix}-sex`}
                  onChange={(event) => {
                    editDog(dog, { sex: event.currentTarget.value as Dog["sex"] });
                  }}
                  value={value.sex}
                >
                  {(["FEMALE", "MALE"] as const).map((sex) => (
                    <option key={sex} value={sex}>
                      {t(`admin-census:signupReview.sex.${sex}`)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField id={`${idPrefix}-notes`} label={t("admin-census:signupReview.fields.notes")}>
                <Textarea
                  id={`${idPrefix}-notes`}
                  maxLength={1000}
                  onChange={(event) => {
                    editDog(dog, { notesToInstructors: event.currentTarget.value });
                  }}
                  value={value.notesToInstructors}
                />
              </FormField>
              {!open || dog.status !== "PENDING" ? null : reused ? (
                // The frozen record's routes are never called for this dog: only PATCH /dogs/{id}.
                <ReadmissionDogDocuments
                  busy={working}
                  client={client}
                  documents={submittedDocuments}
                  dogId={dog.id}
                  idPrefix={idPrefix}
                  onBusy={setDocumentsBusy}
                  onReload={onReload}
                  onSent={(next) => {
                    setSentDocuments((current) => ({ ...current, [dog.id]: next }));
                  }}
                  own={dog.readmission?.current.documents ?? []}
                  version={dogVersion(dog)}
                />
              ) : (
                <SignupDogDocuments client={client} dog={dog} idPrefix={idPrefix} onChanged={onReload} />
              )}
            </fieldset>
          );
        })}
        {error === undefined ? null : (
          <div className="signup-review-error" role="alert">
            <span>{error.text}</span>
            {error.stale ? (
              <Button
                onClick={() => {
                  setError(undefined);
                  onReload();
                }}
                variant="ghost"
              >
                {t("admin-census:signupReview.actions.reload")}
              </Button>
            ) : null}
          </div>
        )}
        {/* A document change moves the dog's version: the save waits for its answer. */}
        <Button disabled={documentsBusy} loading={working} type="submit">
          {t("admin-census:signupReview.actions.save")}
        </Button>
      </form>
    </Drawer>
  );
}
