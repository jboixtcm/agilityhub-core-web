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

type SignupView = components["schemas"]["MemberSignupView"];
type Member = SignupView["member"];
type Dog = SignupView["dogs"][number];
type MemberPatch = components["schemas"]["MemberPatch"];
type DogPatch = components["schemas"]["DogPatch"];
type DogDocument = components["schemas"]["DogDocument"];
type Gender = Member["gender"];

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

type PersonTextKey = Exclude<keyof PersonForm, "gender">;
type DogTextKey = Exclude<keyof DogForm, "notesToInstructors" | "sex">;

function personForm(member: Member): PersonForm {
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
  edits: Partial<PersonForm>,
  billing: boolean,
): MemberPatch | undefined {
  const current = personForm(member);
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
  if (
    billing &&
    member.paymentMethod?.type === "SEPA_DD" &&
    (changed.has("iban") || changed.has("accountHolder") || changed.has("holderTaxId"))
  ) {
    body.paymentMethod = {
      sepa: {
        holderName: value.accountHolder.trim(),
        ...(value.holderTaxId.trim() === "" ? {} : { holderTaxId: value.holderTaxId.trim() }),
        ...(value.iban.trim() === "" ? {} : { iban: value.iban.replaceAll(/\s/gu, "") }),
      },
      type: "SEPA_DD",
    };
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
  const member = signup.member;
  const addDogMode = member.status === "ACTIVE";
  const [personEdits, setPersonEdits] = useState<Partial<PersonForm>>({});
  const [dogEdits, setDogEdits] = useState<Readonly<Record<string, Partial<DogForm>>>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<{ stale: boolean; text: string }>();

  const person: PersonForm = { ...personForm(member), ...personEdits };
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

  const showError = (cause: unknown) => {
    const stale = isApiError(cause, "STALE_VERSION");
    setError({
      stale,
      text: stale
        ? t("admin-census:signupReview.stale")
        : isApiError(cause)
          ? t(`errors:${cause.code}`, { defaultValue: t("admin-census:signupReview.genericError") })
          : t("admin-census:signupReview.genericError"),
    });
  };

  const save = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorking(true);
    setError(undefined);
    let saved = false;
    try {
      const body = addDogMode ? undefined : memberPatch(member, personEdits, billing);
      if (body !== undefined) {
        await client.PATCH("/members/{id}", { body, params: { path: { id: member.id } } });
        setPersonEdits({});
        saved = true;
      }
      for (const dog of signup.dogs) {
        const edits = dogEdits[dog.id];
        const dogBody = dog.status === "PENDING" && edits !== undefined ? dogPatch(dog, edits) : undefined;
        if (dogBody === undefined) continue;
        await client.PATCH("/dogs/{id}", { body: dogBody, params: { path: { id: dog.id } } });
        setDogEdits((current) => {
          const next = { ...current };
          delete next[dog.id];
          return next;
        });
        saved = true;
      }
      reset();
      onSaved();
    } catch (cause) {
      showError(cause);
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
        <fieldset disabled={addDogMode}>
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
          {personInput("idDocument", t("admin-census:signupReview.fields.idDocument"))}
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
          {billing && member.paymentMethod?.type === "SEPA_DD" ? (
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
          return (
            <fieldset disabled={dog.status !== "PENDING"} key={dog.id}>
              <legend>{t("admin-census:signupReview.dog", { current: index + 1, total: signup.dogs.length })}</legend>
              {dogInput("name")}
              {dogInput("breed")}
              {dogInput("birthMonth")}
              {dogInput("chip")}
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
              {open && dog.status === "PENDING" ? (
                <SignupDogDocuments client={client} dog={dog} idPrefix={idPrefix} onChanged={onReload} />
              ) : null}
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
        <Button loading={working} type="submit">
          {t("admin-census:signupReview.actions.save")}
        </Button>
      </form>
    </Drawer>
  );
}
