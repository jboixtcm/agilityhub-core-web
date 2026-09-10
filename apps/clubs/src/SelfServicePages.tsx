import { isApiError, type ApiClient, type components } from "@agilityhub/api-client";
import {
  Button,
  Card,
  EmptyState,
  FormField as UiFormField,
  Icon,
  Input,
  Modal,
  Select,
  Textarea,
  useBranding,
} from "@agilityhub/ui";
import {
  type ChangeEvent,
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useId,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

type License = components["schemas"]["LicenseWithPendingFields"];
type MeDog = Omit<components["schemas"]["MeDog"], "licenses"> & { licenses: License[] };
type MeDogs = Omit<components["schemas"]["MeDogs"], "dogs"> & { dogs: MeDog[] };
type MeProfile = components["schemas"]["MeProfile"];
type MeProfilePatch = components["schemas"]["MeProfilePatch"];
type Parameter = components["schemas"]["Parameter"];
type PostalTown = components["schemas"]["PostalTown"];
type CountryProfile = components["schemas"]["Country"];

interface DocumentTypeOption {
  code: string;
  label: string;
}

interface DocumentUpload {
  dogId: string;
  dogName: string;
}

function FormField({
  children,
  error,
  help,
  id,
  label,
}: {
  children: ReactNode;
  id: string;
  label: string;
  error?: string | undefined;
  help?: string | undefined;
}) {
  return (
    <UiFormField
      {...(error === undefined ? {} : { error })}
      {...(help === undefined ? {} : { help })}
      id={id}
      label={label}
    >
      {children}
    </UiFormField>
  );
}

type CountryField = "DNI" | "NIE" | "PHONE" | "POSTAL_CODE";

function countryProfile(value: unknown): CountryProfile {
  if (typeof value !== "object" || value === null) {
    return { code: "", idDocumentTypes: [], phonePrefix: "" };
  }
  const candidate = value as Record<string, unknown>;
  return {
    code: typeof candidate.code === "string" ? candidate.code : "",
    idDocumentTypes: Array.isArray(candidate.idDocumentTypes)
      ? candidate.idDocumentTypes.filter((item): item is string => typeof item === "string")
      : [],
    phonePrefix: typeof candidate.phonePrefix === "string" ? candidate.phonePrefix : "",
  };
}

function spanishIdIsValid(value: string, nie: boolean): boolean {
  const normalized = value.toUpperCase().replaceAll(/\s/gu, "");
  const expression = nie ? /^[XYZ]\d{7}[A-Z]$/u : /^\d{8}[A-Z]$/u;
  if (!expression.test(normalized)) {
    return false;
  }
  const digits = nie
    ? `${String({ X: 0, Y: 1, Z: 2 }[normalized.charAt(0) as "X" | "Y" | "Z"])}${normalized.slice(1, 8)}`
    : normalized.slice(0, 8);
  const letters = "TRWAGMYFPDXBNJZSQVHLCKE";
  return letters.charAt(Number(digits) % 23) === normalized.at(-1);
}

export function isCountryFieldValid(
  rawCountryProfile: unknown,
  field: CountryField,
  value: string,
): boolean {
  const profile = countryProfile(rawCountryProfile);
  const normalized = value.trim();
  if (profile.code !== "ES") {
    return normalized !== "";
  }
  if (field === "DNI") {
    return spanishIdIsValid(normalized, false);
  }
  if (field === "NIE") {
    return spanishIdIsValid(normalized, true);
  }
  if (field === "PHONE") {
    return /^\d{9}$/u.test(normalized.replaceAll(/\D/gu, ""));
  }
  return /^\d{5}$/u.test(normalized);
}

function fullDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

function documentTypeOptions(value: unknown): DocumentTypeOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }
    const candidate = item as Record<string, unknown>;
    return typeof candidate.code === "string" && typeof candidate.label === "string"
      ? [{ code: candidate.code, label: candidate.label }]
      : [];
  });
}

function fieldErrors(error: unknown): { code: string; field: string }[] {
  if (!isApiError(error) || typeof error.details !== "object" || error.details === null) {
    return [];
  }
  const candidate = (error.details as Record<string, unknown>).fieldErrors;
  if (!Array.isArray(candidate)) {
    return [];
  }
  return candidate.flatMap((item) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }
    const entry = item as Record<string, unknown>;
    return typeof entry.code === "string" && typeof entry.field === "string"
      ? [{ code: entry.code, field: entry.field }]
      : [];
  });
}

function formFieldName(field: string): string {
  const email = /^contactEmails\[(\d+)\]/u.exec(field);
  if (email?.[1] !== undefined) {
    return `email${email[1]}`;
  }
  const phone = /^phones\[(\d+)\]\.(label|number|prefix)$/u.exec(field);
  if (phone?.[1] !== undefined && phone[2] !== undefined) {
    return `phone${phone[1]}${phone[2]}`;
  }
  if (field.startsWith("address.")) {
    return field.slice("address.".length);
  }
  return field;
}

async function optionalParameter(client: ApiClient, key: string): Promise<Parameter | undefined> {
  try {
    const result = await client.GET("/parameters/{key}", { params: { path: { key } } });
    return result.data;
  } catch {
    return undefined;
  }
}

function apiMessage(error: unknown, t: ReturnType<typeof useTranslation>["t"]): string {
  if (isApiError(error, "STALE_VERSION")) {
    return t("errors:STALE_VERSION");
  }
  if (isApiError(error, "FILE_TOO_LARGE")) {
    return t("errors:FILE_TOO_LARGE");
  }
  if (isApiError(error, "FILE_TYPE_NOT_ALLOWED")) {
    return t("errors:FILE_TYPE_NOT_ALLOWED");
  }
  if (isApiError(error, "DOCUMENT_TYPE_UNKNOWN")) {
    return t("errors:DOCUMENT_TYPE_UNKNOWN");
  }
  return t("census:selfService.genericError");
}

function PageHeader({ title }: { title: string }) {
  const { t } = useTranslation("census");
  return (
    <header className="self-page__header">
      <a aria-label={t("census:selfService.back")} href="/perfil">
        <span aria-hidden="true">‹</span>
      </a>
      <h1>{title}</h1>
    </header>
  );
}

async function uploadFile(client: ApiClient, file: File, purpose: "DOG_DOCUMENT" | "DOG_PHOTO") {
  const upload = await client.POST("/attachments/upload-url", {
    body: {
      fileName: file.name,
      mimeType: file.type,
      purpose,
      sizeBytes: file.size,
    },
  });
  if (upload.data === undefined) {
    throw new TypeError("The upload URL response did not contain data", { cause: upload.error });
  }
  const response = await fetch(upload.data.uploadUrl, {
    body: file,
    headers: upload.data.headers,
    method: "PUT",
  });
  if (!response.ok) {
    throw new TypeError("The signed file upload failed");
  }
  return upload.data.fileKey;
}

function DogPhoto({
  client,
  dog,
  onError,
  onUpdated,
}: {
  client: ApiClient;
  dog: MeDog;
  onError: (message: string) => void;
  onUpdated: (photoUrl: string) => void;
}) {
  const { t } = useTranslation(["census", "errors"]);
  const id = useId();
  const [imageFailed, setImageFailed] = useState(false);
  const [working, setWorking] = useState(false);

  const changePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file === undefined) {
      return;
    }
    setWorking(true);
    try {
      const fileKey = await uploadFile(client, file, "DOG_PHOTO");
      const result = await client.PUT("/me/dogs/{id}/photo", {
        body: { fileKey },
        params: { path: { id: dog.id } },
      });
      if (result.data === undefined) {
        throw new TypeError("The dog photo response did not contain data", { cause: result.error });
      }
      setImageFailed(false);
      onUpdated(result.data.photoUrl);
    } catch (error) {
      onError(apiMessage(error, t));
    } finally {
      setWorking(false);
    }
  };

  return (
    <label className="dog-photo" data-working={working || undefined} htmlFor={id}>
      {dog.photoUrl === undefined || imageFailed ? (
        <Icon aria-hidden="true" name="cam" />
      ) : (
        <img
          alt=""
          onError={() => {
            setImageFailed(true);
          }}
          src={dog.photoUrl}
        />
      )}
      <span className="ah-sr-only">{t("census:myDogs.changePhoto", { dog: dog.name })}</span>
      <input
        accept="image/*"
        disabled={working}
        id={id}
        onChange={(event) => void changePhoto(event)}
        type="file"
      />
    </label>
  );
}

function DogTasks({ dog }: { dog: MeDog }) {
  const { t } = useTranslation("census");

  if (dog.tasks === undefined) {
    return null;
  }

  return (
    <section className="dog-card__section dog-tasks" aria-label={t("census:myDogs.tasksTitle")}>
      <h3>{t("census:myDogs.tasksTitle")}</h3>
      <p>{t("census:myDogs.tasksSummary", dog.tasks)}</p>
      <a className="self-link" href="/historic">
        {t("census:myDogs.history")}
      </a>
    </section>
  );
}

function DogNote({
  client,
  dog,
  onError,
  onSaved,
}: {
  client: ApiClient;
  dog: MeDog;
  onError: (message: string) => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation(["census", "errors"]);
  const [note, setNote] = useState(dog.instructorNote?.text ?? "");
  const [savedNote, setSavedNote] = useState(note);
  const [working, setWorking] = useState(false);

  const save = async () => {
    if (working || note === savedNote) {
      return;
    }
    setWorking(true);
    try {
      const result = await client.PUT("/me/dogs/{id}/instructor-note", {
        body: { text: note },
        params: { path: { id: dog.id } },
      });
      if (result.data === undefined) {
        throw new TypeError("The note response did not contain data", { cause: result.error });
      }
      setSavedNote(result.data.text);
      setNote(result.data.text);
      onSaved();
    } catch (error) {
      onError(apiMessage(error, t));
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="dog-card__section dog-note">
      <label htmlFor={`dog-note-${dog.id}`}>
        {t("census:myDogs.notesTitle")} <span>{t("census:myDogs.notesHelp")}</span>
      </label>
      <Textarea
        id={`dog-note-${dog.id}`}
        maxLength={2000}
        onBlur={() => void save()}
        onChange={(event) => {
          setNote(event.currentTarget.value);
        }}
        value={note}
      />
      <Button disabled={working || note === savedNote} onClick={() => void save()}>
        {t("census:selfService.save")}
      </Button>
    </section>
  );
}

function DogDocuments({ dog, onAdd }: { dog: MeDog; onAdd: () => void }) {
  const { t } = useTranslation("census");
  return (
    <section className="dog-card__section dog-documents">
      <Icon aria-hidden="true" name="doc" />
      <div>
        {dog.documents.length === 0 ? (
          <small>{t("census:myDogs.noDocuments")}</small>
        ) : (
          dog.documents.map((document) => (
            <div key={document.id}>
              {document.state === "PENDING" ? (
                <span className="dog-documents__pending">
                  {t("census:myDogs.documentPending", { document: document.typeLabel })}
                </span>
              ) : (
                document.files.map((file) => <span key={file.id}>{file.name}</span>)
              )}
            </div>
          ))
        )}
      </div>
      <Button onClick={onAdd} variant="ghost">
        {t("census:myDogs.addDocument")}
      </Button>
    </section>
  );
}

function DogCard({
  client,
  dog: initialDog,
  levelsEnabled,
  modules,
  onDocument,
  onMessage,
}: {
  client: ApiClient;
  dog: MeDog;
  levelsEnabled: boolean;
  modules: readonly string[];
  onDocument: (upload: DocumentUpload) => void;
  onMessage: (message: string, error?: boolean) => void;
}) {
  const { i18n, t } = useTranslation("census");
  const [dog, setDog] = useState(initialDog);
  const tasksEnabled = modules.includes("TASKS");
  const packsEnabled = modules.includes("PACKS");
  const freeTrainingEnabled = modules.includes("FREE_TRAINING");
  const consumed = dog.pack === undefined ? 0 : Math.max(0, dog.pack.total - dog.pack.remaining);
  const progress = dog.pack === undefined || dog.pack.total === 0 ? 0 : consumed / dog.pack.total;

  return (
    <Card className="dog-card">
      <div className="dog-card__identity">
        <DogPhoto
          client={client}
          dog={dog}
          onError={(message) => {
            onMessage(message, true);
          }}
          onUpdated={(photoUrl) => {
            setDog((current) => ({ ...current, photoUrl }));
            onMessage(t("census:myDogs.photoSaved", { dog: dog.name }));
          }}
        />
        <div>
          <h2>{dog.name}</h2>
          <p>
            {dog.breed} ·{" "}
            {dog.sex === "FEMALE" ? t("census:values.female") : t("census:values.male")} ·{" "}
            {t("census:values.years", { count: dog.ageYears })}
          </p>
        </div>
        {levelsEnabled && dog.level !== undefined ? (
          <span className="dog-card__level">
            {t("census:myDogs.level", { code: dog.level.code })}
          </span>
        ) : null}
      </div>
      {tasksEnabled ? (
        <>
          <DogNote
            client={client}
            dog={dog}
            onError={(message) => {
              onMessage(message, true);
            }}
            onSaved={() => {
              onMessage(t("census:myDogs.noteSaved", { dog: dog.name }));
            }}
          />
          {dog.tasks === undefined ? null : <DogTasks dog={dog} />}
        </>
      ) : null}
      <DogDocuments
        dog={dog}
        onAdd={() => {
          onDocument({ dogId: dog.id, dogName: dog.name });
        }}
      />
      {freeTrainingEnabled && dog.freeTrainingAllowed ? (
        <span className="dog-card__free">{t("census:values.freeTraining")}</span>
      ) : null}
      {dog.licenses.map((license) => (
        <p className="dog-card__license" key={license.organisation}>
          {license.organisation} · {t("census:myDogs.license", { number: license.number })}
          {[license.category, license.grade, license.division]
            .filter((value): value is string => typeof value === "string" && value !== "")
            .map((value) => ` · ${value}`)}
        </p>
      ))}
      {packsEnabled && dog.pack !== undefined ? (
        <section className="dog-pack">
          <div>
            <h3>{t("census:myDogs.pack", { count: dog.pack.total })}</h3>
            {dog.pack.expiresOn === undefined ? null : (
              <span>
                {t("census:myDogs.expires", {
                  date: fullDate(dog.pack.expiresOn, i18n.resolvedLanguage ?? "ca"),
                })}
              </span>
            )}
          </div>
          <div aria-hidden="true" className="dog-pack__track">
            <span style={{ inlineSize: `${String(progress * 100)}%` }} />
          </div>
          <p>
            <strong>{t("census:myDogs.consumed", { count: consumed })}</strong> ·{" "}
            <b>{t("census:myDogs.available", { count: dog.pack.remaining })}</b>
          </p>
        </section>
      ) : null}
    </Card>
  );
}

function DocumentModal({
  client,
  documentTypes,
  onClose,
  onError,
  onUploaded,
  upload,
}: {
  client: ApiClient;
  documentTypes: DocumentTypeOption[];
  onClose: () => void;
  onError: (message: string) => void;
  onUploaded: () => void;
  upload: DocumentUpload | null;
}) {
  const { t } = useTranslation(["census", "errors"]);
  const [name, setName] = useState("");
  const [type, setType] = useState(documentTypes[0]?.code ?? "VACCINATION_CARD");
  const [file, setFile] = useState<File>();
  const [working, setWorking] = useState(false);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (upload === null || file === undefined || name.trim() === "") {
      return;
    }
    setWorking(true);
    try {
      const fileKey = await uploadFile(client, file, "DOG_DOCUMENT");
      const result = await client.POST("/me/dogs/{id}/documents", {
        body: { fileKey, name: name.trim(), type },
        params: { path: { id: upload.dogId } },
      });
      if (result.data === undefined) {
        throw new TypeError("The dog document response did not contain data", {
          cause: result.error,
        });
      }
      onUploaded();
      onClose();
    } catch (error) {
      onError(apiMessage(error, t));
      setWorking(false);
    }
  };

  return (
    <Modal
      closeLabel={t("census:selfService.close")}
      onClose={onClose}
      open={upload !== null}
      title={
        upload === null
          ? t("census:myDogs.documentDialog")
          : t("census:myDogs.documentDialogFor", { dog: upload.dogName })
      }
    >
      <form className="self-modal-form" onSubmit={(event) => void submit(event)}>
        <FormField id="dog-document-type" label={t("census:myDogs.documentType")}>
          <Select
            id="dog-document-type"
            onChange={(event) => {
              setType(event.currentTarget.value);
            }}
            value={type}
          >
            {documentTypes.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="dog-document-name" label={t("census:myDogs.documentName")}>
          <Input
            id="dog-document-name"
            maxLength={80}
            onChange={(event) => {
              setName(event.currentTarget.value);
            }}
            required
            value={name}
          />
        </FormField>
        <FormField id="dog-document-file" label={t("census:myDogs.documentFile")}>
          <Input
            accept="application/pdf,image/*"
            id="dog-document-file"
            onChange={(event) => {
              setFile(event.currentTarget.files?.[0]);
            }}
            required
            type="file"
          />
        </FormField>
        <Button disabled={working || file === undefined || name.trim() === ""} type="submit">
          {t("census:myDogs.uploadDocument")}
        </Button>
      </form>
    </Modal>
  );
}

export function MyDogsPage({ client }: { client: ApiClient }) {
  const branding = useBranding();
  const { t } = useTranslation("census");
  const [data, setData] = useState<MeDogs>();
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>([]);
  const [levelsEnabled, setLevelsEnabled] = useState(true);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState<{ error?: boolean; text: string }>();
  const [documentUpload, setDocumentUpload] = useState<DocumentUpload | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.all([
      client.GET("/me/dogs"),
      optionalParameter(client, "census.dogDocumentTypes"),
      optionalParameter(client, "levels.enabled"),
    ]).then(
      ([dogs, types, levels]) => {
        if (!active) {
          return;
        }
        if (dogs.data === undefined) {
          setError(true);
          return;
        }
        setData(dogs.data);
        const options = documentTypeOptions(types?.value);
        setDocumentTypes(
          options.length > 0
            ? options
            : [
                {
                  code: "VACCINATION_CARD",
                  label: t("census:myDogs.vaccinationCard"),
                },
              ],
        );
        setLevelsEnabled(typeof levels?.value === "boolean" ? levels.value : true);
      },
      () => {
        if (active) {
          setError(true);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [client, reload, t]);

  return (
    <div className="self-page my-dogs-page">
      <PageHeader title={t("census:myDogs.title")} />
      <div className="self-page__body">
        {message === undefined ? null : (
          <div
            className="self-page__message"
            data-error={message.error ?? undefined}
            role={message.error === true ? "alert" : "status"}
          >
            {message.text}
          </div>
        )}
        {error ? (
          <EmptyState
            action={
              <Button
                onClick={() => {
                  setError(false);
                  setReload((current) => current + 1);
                }}
              >
                {t("census:list.retry")}
              </Button>
            }
            description={t("census:myDogs.loadError")}
            title={t("census:selfService.errorTitle")}
          />
        ) : data === undefined ? (
          <p role="status">{t("census:myDogs.loading")}</p>
        ) : data.dogs.length === 0 ? (
          <EmptyState
            action={
              data.canAddDog ? (
                <a className="self-button-link" href="/gossos/nou">
                  {t("census:myDogs.addDog")}
                </a>
              ) : undefined
            }
            description={t("census:myDogs.footnote")}
            title={t("census:myDogs.empty")}
          />
        ) : (
          <>
            {data.dogs.map((dog) => (
              <DogCard
                client={client}
                dog={dog}
                key={dog.id}
                levelsEnabled={levelsEnabled}
                modules={branding.modules}
                onDocument={setDocumentUpload}
                onMessage={(text, messageError) => {
                  setMessage({ ...(messageError === true ? { error: true } : {}), text });
                }}
              />
            ))}
            {data.canAddDog ? (
              <a className="self-button-link self-button-link--secondary" href="/gossos/nou">
                {t("census:myDogs.addDog")}
              </a>
            ) : null}
            <p className="my-dogs-page__footnote">{t("census:myDogs.footnote")}</p>
          </>
        )}
      </div>
      <DocumentModal
        client={client}
        documentTypes={documentTypes}
        onClose={() => {
          setDocumentUpload(null);
        }}
        onError={(text) => {
          setMessage({ error: true, text });
        }}
        onUploaded={() => {
          setMessage({ text: t("census:myDogs.documentSaved") });
          setReload((current) => current + 1);
        }}
        upload={documentUpload}
      />
    </div>
  );
}

function ReadOnlyProfileField({
  error,
  id,
  label,
  value,
}: {
  error: string | undefined;
  id: string;
  label: string;
  value: string;
}) {
  return (
    <FormField error={error} id={id} label={label}>
      <Input aria-invalid={error === undefined ? undefined : true} id={id} readOnly value={value} />
    </FormField>
  );
}

function translatedFieldError(code: string, t: ReturnType<typeof useTranslation>["t"]): string {
  if (code === "READ_ONLY") {
    return t("errors:READ_ONLY");
  }
  if (code === "INVALID_EMAIL") {
    return t("census:myData.invalidEmail");
  }
  if (code === "INVALID_PHONE") {
    return t("errors:INVALID_PHONE");
  }
  if (code === "INVALID_POSTAL_CODE") {
    return t("census:myData.invalidPostalCode");
  }
  if (code === "INVALID_ID_DOCUMENT") {
    return t("errors:INVALID_ID_DOCUMENT");
  }
  return t("errors:VALIDATION_ERROR");
}

export function MyDataPage({ client }: { client: ApiClient }) {
  const branding = useBranding();
  const profileCountry = countryProfile(branding.countryProfile);
  const { t } = useTranslation(["census", "errors"]);
  const [profile, setProfile] = useState<MeProfile>();
  const [towns, setTowns] = useState<PostalTown[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string>();
  const [loadError, setLoadError] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let active = true;
    void client.GET("/me/profile").then(
      (result) => {
        if (!active) {
          return;
        }
        if (result.data === undefined) {
          setLoadError(true);
          return;
        }
        setProfile(result.data);
      },
      () => {
        if (active) {
          setLoadError(true);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [client]);

  const postalCode = profile?.address.postalCode ?? "";
  useEffect(() => {
    let active = true;
    if (postalCode.length !== 5 || profileCountry.code !== "ES") {
      return () => {
        active = false;
      };
    }
    void client
      .GET("/country-profile/postal-codes/{code}", {
        params: { path: { code: postalCode } },
      })
      .then((result) => {
        if (!active || result.data === undefined) {
          return;
        }
        setTowns(result.data);
        const onlyTown = result.data[0];
        if (result.data.length === 1 && onlyTown !== undefined) {
          setProfile((current) =>
            current === undefined
              ? current
              : {
                  ...current,
                  address: {
                    ...current.address,
                    city: onlyTown.town,
                    province: onlyTown.region,
                  },
                },
          );
        }
      });
    return () => {
      active = false;
    };
  }, [client, postalCode, profileCountry.code]);

  if (loadError) {
    return (
      <div className="self-page">
        <PageHeader title={t("census:myData.title")} />
        <EmptyState
          description={t("census:myData.loadError")}
          title={t("census:selfService.errorTitle")}
        />
      </div>
    );
  }
  if (profile === undefined) {
    return (
      <div className="self-page">
        <PageHeader title={t("census:myData.title")} />
        <p className="self-page__loading" role="status">
          {t("census:myData.loading")}
        </p>
      </div>
    );
  }

  const email = (index: number) => profile.contactEmails[index]?.email ?? "";
  const phone = (index: number) =>
    profile.phones[index] ?? {
      label: "",
      number: "",
      prefix: profileCountry.phonePrefix,
    };
  const updateEmail = (index: number, value: string) => {
    const contactEmails = [...profile.contactEmails];
    contactEmails[index] = { bounced: false, email: value };
    setProfile({ ...profile, contactEmails });
  };
  const updatePhone = (index: number, part: "label" | "number", value: string) => {
    const phones = [...profile.phones];
    phones[index] = { ...phone(index), [part]: value };
    setProfile({ ...profile, phones });
  };

  const save = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const contactEmails = profile.contactEmails.filter(
      (item, index) => index === 0 || item.email.trim() !== "",
    );
    const phones = profile.phones.filter((item, index) => index === 0 || item.number.trim() !== "");
    contactEmails.forEach((item, index) => {
      if (!/^\S+@\S+\.\S+$/u.test(item.email)) {
        nextErrors[`email${String(index)}`] = t("census:myData.invalidEmail");
      }
    });
    phones.forEach((item, index) => {
      if (!isCountryFieldValid(profileCountry, "PHONE", item.number) || item.prefix.trim() === "") {
        nextErrors[`phone${String(index)}number`] = t("errors:INVALID_PHONE");
      }
    });
    if (!isCountryFieldValid(profileCountry, "POSTAL_CODE", profile.address.postalCode)) {
      nextErrors.postalCode = t("census:myData.invalidPostalCode");
    }
    setErrors(nextErrors);
    setMessage(undefined);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setWorking(true);
    const body: MeProfilePatch = {
      address: profile.address,
      contactEmails: contactEmails.map((item) => ({ email: item.email.trim() })),
      phones: phones.map((item) => ({
        label: item.label?.trim() ?? "",
        number: item.number.replaceAll(/\D/gu, ""),
        prefix: item.prefix,
      })),
      version: profile.version,
    };
    try {
      const result = await client.PATCH("/me/profile", { body });
      if (result.data === undefined) {
        throw new TypeError("The profile response did not contain data", { cause: result.error });
      }
      setProfile(result.data);
      setMessage(t("census:myData.saved"));
    } catch (error) {
      const serverErrors = fieldErrors(error);
      if (serverErrors.length > 0) {
        setErrors(
          Object.fromEntries(
            serverErrors.map((item) => [
              formFieldName(item.field),
              translatedFieldError(item.code, t),
            ]),
          ),
        );
      } else {
        setMessage(apiMessage(error, t));
      }
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="self-page my-data-page">
      <PageHeader title={t("census:myData.title")} />
      <form className="my-data-form" noValidate onSubmit={(event) => void save(event)}>
        {message === undefined ? null : (
          <p className="self-page__message" role="status">
            {message}
          </p>
        )}
        <div className="my-data-form__identity">
          <ReadOnlyProfileField
            error={errors.idDocumentMasked}
            id="my-data-id"
            label={t("census:myData.idDocument")}
            value={profile.idDocumentMasked}
          />
          <ReadOnlyProfileField
            error={errors.firstName}
            id="my-data-first-name"
            label={t("census:myData.firstName")}
            value={profile.firstName}
          />
          <div className="my-data-form__columns">
            <ReadOnlyProfileField
              error={errors.lastName1}
              id="my-data-last-name-1"
              label={t("census:myData.lastName1")}
              value={profile.lastName1}
            />
            <ReadOnlyProfileField
              error={errors.lastName2}
              id="my-data-last-name-2"
              label={t("census:myData.lastName2")}
              value={profile.lastName2 ?? ""}
            />
          </div>
        </div>

        <section>
          <h2>{t("census:myData.emails")}</h2>
          <FormField
            error={errors.email0}
            id="my-data-email-0"
            label={t("census:myData.primaryEmail")}
          >
            <Input
              aria-invalid={errors.email0 === undefined ? undefined : true}
              autoComplete="email"
              id="my-data-email-0"
              onChange={(event) => {
                updateEmail(0, event.currentTarget.value);
              }}
              required
              type="email"
              value={email(0)}
            />
          </FormField>
          <FormField
            error={errors.email1}
            id="my-data-email-1"
            label={t("census:myData.secondEmail")}
          >
            <Input
              aria-invalid={errors.email1 === undefined ? undefined : true}
              autoComplete="email"
              id="my-data-email-1"
              onChange={(event) => {
                updateEmail(1, event.currentTarget.value);
              }}
              type="email"
              value={email(1)}
            />
          </FormField>
          <p className="my-data-form__help">{t("census:myData.emailHelp")}</p>
        </section>

        <section>
          <h2>{t("census:myData.phones")}</h2>
          {[0, 1].map((index) => (
            <div className="my-data-form__phone" key={index}>
              <span aria-hidden="true" className="my-data-form__prefix">
                {phone(index).prefix}
              </span>
              <FormField
                error={errors[`phone${String(index)}number`]}
                id={`my-data-phone-${String(index)}`}
                label={
                  index === 0 ? t("census:myData.primaryPhone") : t("census:myData.secondPhone")
                }
              >
                <Input
                  aria-invalid={
                    errors[`phone${String(index)}number`] === undefined ? undefined : true
                  }
                  autoComplete="tel-national"
                  id={`my-data-phone-${String(index)}`}
                  inputMode="tel"
                  onChange={(event) => {
                    updatePhone(index, "number", event.currentTarget.value);
                  }}
                  required={index === 0}
                  value={phone(index).number}
                />
              </FormField>
              <FormField
                error={errors[`phone${String(index)}label`]}
                id={`my-data-phone-label-${String(index)}`}
                label={t("census:myData.phoneLabel")}
              >
                <Input
                  id={`my-data-phone-label-${String(index)}`}
                  maxLength={30}
                  onChange={(event) => {
                    updatePhone(index, "label", event.currentTarget.value);
                  }}
                  value={phone(index).label}
                />
              </FormField>
            </div>
          ))}
          <p className="my-data-form__help">{t("census:myData.phoneHelp")}</p>
        </section>

        <section>
          <h2>{t("census:myData.address")}</h2>
          <FormField error={errors.street} id="my-data-street" label={t("census:myData.street")}>
            <Input
              autoComplete="street-address"
              id="my-data-street"
              onChange={(event) => {
                setProfile({
                  ...profile,
                  address: { ...profile.address, street: event.currentTarget.value },
                });
              }}
              required
              value={profile.address.street}
            />
          </FormField>
          <div className="my-data-form__address-row">
            <FormField
              error={errors.postalCode}
              id="my-data-postal-code"
              label={t("census:myData.postalCode")}
            >
              <Input
                aria-invalid={errors.postalCode === undefined ? undefined : true}
                autoComplete="postal-code"
                id="my-data-postal-code"
                inputMode="numeric"
                onChange={(event) => {
                  setTowns([]);
                  setProfile({
                    ...profile,
                    address: { ...profile.address, postalCode: event.currentTarget.value },
                  });
                }}
                required
                value={profile.address.postalCode}
              />
            </FormField>
            <FormField error={errors.city} id="my-data-city" label={t("census:myData.city")}>
              {towns.length > 1 ? (
                <Select
                  id="my-data-city"
                  onChange={(event) => {
                    const town = towns.find((item) => item.town === event.currentTarget.value);
                    setProfile({
                      ...profile,
                      address: {
                        ...profile.address,
                        city: event.currentTarget.value,
                        ...(town === undefined ? {} : { province: town.region }),
                      },
                    });
                  }}
                  value={profile.address.city}
                >
                  {towns.map((town) => (
                    <option key={`${town.region}-${town.town}`} value={town.town}>
                      {town.town}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id="my-data-city"
                  onChange={(event) => {
                    setProfile({
                      ...profile,
                      address: { ...profile.address, city: event.currentTarget.value },
                    });
                  }}
                  readOnly={towns.length === 1}
                  value={profile.address.city}
                />
              )}
            </FormField>
          </div>
        </section>

        {branding.modules.includes("BILLING") &&
        profile.paymentMethod?.type === "SEPA_DD" &&
        profile.paymentMethod.maskedAccount !== undefined ? (
          <section>
            <h2>{t("census:myData.directDebit")}</h2>
            <Input
              aria-label={t("census:myData.directDebit")}
              className="my-data-form__masked"
              readOnly
              value={profile.paymentMethod.maskedAccount}
            />
            <p className="my-data-form__help">{t("census:myData.directDebitHelp")}</p>
          </section>
        ) : null}

        <Button disabled={working} loading={working} type="submit">
          {t("census:selfService.save")}
        </Button>
      </form>
    </div>
  );
}
