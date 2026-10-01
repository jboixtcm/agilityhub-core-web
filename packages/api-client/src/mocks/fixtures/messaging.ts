import type { components } from "../../generated/schema";

type AudienceChannels = components["schemas"]["AudienceChannels"];
type ChannelCaps = components["schemas"]["ChannelCaps"];
type ChannelMatrix = components["schemas"]["ChannelMatrix"];
type DeliveryStatus = components["schemas"]["DeliveryStatus"];
type DeliveryView = components["schemas"]["DeliveryView"];
type LastChange = NonNullable<components["schemas"]["LastChange"]>;
type MessageTemplateDetail = components["schemas"]["MessageTemplateDetail"];
type MessageTemplateListItem = components["schemas"]["MessageTemplateListItem"];
type NotificationAudience = components["schemas"]["NotificationAudience"];
type NotificationCategory = components["schemas"]["NotificationCategory"];
type NotificationChannel = components["schemas"]["NotificationChannel"];
type NotificationDetail = components["schemas"]["NotificationDetail"];
type NotificationListItem = components["schemas"]["NotificationListItem"];
type TemplateColor = components["schemas"]["TemplateColor"];
type TemplateIcon = components["schemas"]["TemplateIcon"];
type TemplatePreview = components["schemas"]["TemplatePreview"];
type TemplateVariable = components["schemas"]["TemplateVariable"];

/** The languages this world answers in (the admin's `Accept-Language`); `ca` otherwise. */
export type MessagingLocale = "ca" | "en" | "es";

export function messagingLocale(acceptLanguage: string | null): MessagingLocale {
  const language = acceptLanguage?.slice(0, 2).toLowerCase();
  return language === "es" || language === "en" ? language : "ca";
}

type Audience = "ADMINS" | "INSTRUCTORS" | "MEMBER";
type LocalizedText = Readonly<Record<string, string>>;

// ── Variables: the code keys and their D9 labels (`notif.variable.<key>`, S11 R-11-05) ──────

const VARIABLE_LABELS: Readonly<Record<string, Readonly<Record<MessagingLocale, string>>>> = {
  admin_text: { ca: "text_admin", en: "admin_text", es: "texto_admin" },
  class_date: { ca: "classe_data", en: "class_date", es: "clase_fecha" },
  class_description: { ca: "classe_descripcio", en: "class_description", es: "clase_descripcion" },
  class_time: { ca: "classe_hora", en: "class_time", es: "clase_hora" },
  club_name: { ca: "entitat_nom", en: "club_name", es: "entidad_nombre" },
  confirm_by: { ca: "confirmar_abans", en: "confirm_by", es: "confirmar_antes" },
  date: { ca: "data", en: "date", es: "fecha" },
  dog_name: { ca: "gos_nom", en: "dog_name", es: "perro_nombre" },
  effective_date: { ca: "persona_data_baixa", en: "person_leave_date", es: "persona_fecha_baja" },
  level_name: { ca: "gos_nivell", en: "dog_level", es: "perro_nivel" },
  member_first_name: { ca: "persona_nom", en: "person_first_name", es: "persona_nombre" },
  member_last_names: { ca: "persona_cognoms", en: "person_last_names", es: "persona_apellidos" },
  member_name: { ca: "persona_nom_complet", en: "person_full_name", es: "persona_nombre_completo" },
  ring_name: { ca: "pista_nom", en: "ring_name", es: "pista_nombre" },
  time: { ca: "hora", en: "time", es: "hora" },
};

/** The member variables of a CUSTOM template (R-11-12) and of the member notices of the mockup. */
const MEMBER_VARIABLES = [
  "member_first_name",
  "member_last_names",
  "dog_name",
  "level_name",
  "class_date",
  "club_name",
] as const;

function variables(keys: readonly string[], locale: MessagingLocale): TemplateVariable[] {
  return keys.map((key) => ({ key, label: VARIABLE_LABELS[key]?.[locale] ?? key }));
}

/** The fictional data of the preview (R-11-12: «Laura», «Duna» C, «dimecres 12 · 18:50 · B+C»). */
const PREVIEW_VALUES: Readonly<Record<string, Readonly<Record<MessagingLocale, string>>>> = {
  admin_text: {
    ca: "La classe queda anul·lada per la pluja. Podeu reservar-ne una altra des de l'app. Disculpeu les molèsties!",
    en: "The class is cancelled because of the rain. You can book another one in the app. Sorry for the inconvenience!",
    es: "La clase queda anulada por la lluvia. Podéis reservar otra desde la app. ¡Disculpad las molestias!",
  },
  class_date: { ca: "dimecres 12", en: "Wednesday 12", es: "miércoles 12" },
  class_description: { ca: "B+C", en: "B+C", es: "B+C" },
  class_time: { ca: "18:50", en: "18:50", es: "18:50" },
  confirm_by: { ca: "19:30", en: "19:30", es: "19:30" },
  date: { ca: "dt 4", en: "Tue 4", es: "mar 4" },
  dog_name: { ca: "Duna", en: "Duna", es: "Duna" },
  effective_date: { ca: "31 d'agost de 2026", en: "31 August 2026", es: "31 de agosto de 2026" },
  level_name: { ca: "C", en: "C", es: "C" },
  member_first_name: { ca: "Laura", en: "Laura", es: "Laura" },
  member_last_names: { ca: "Serra Vidal", en: "Serra Vidal", es: "Serra Vidal" },
  member_name: { ca: "Laura Serra Vidal", en: "Laura Serra Vidal", es: "Laura Serra Vidal" },
  ring_name: { ca: "Central", en: "Central", es: "Central" },
  time: { ca: "8:00–8:30", en: "8:00–8:30", es: "8:00–8:30" },
};

// ── Templates (S11 §3, §8; mockup D9) ─────────────────────────────────────────────────────────

const NONE: AudienceChannels = { APP: false, EMAIL: false, SMS: false };

function cells(channels: readonly NotificationChannel[]): AudienceChannels {
  return {
    APP: channels.includes("APP"),
    EMAIL: channels.includes("EMAIL"),
    SMS: channels.includes("SMS"),
  };
}

/** R-11-12: the cells a category lets a template activate, per audience. */
function categoryCaps(category: NotificationCategory, kind: "CATALOG" | "CUSTOM"): ChannelCaps {
  const staff: NotificationChannel[] = kind === "CUSTOM" ? [] : ["APP", "EMAIL"];
  switch (category) {
    case "CLUB_CHANGES":
      return { ADMINS: staff, INSTRUCTORS: staff, MEMBER: ["APP", "EMAIL", "SMS"] };
    default:
      return { ADMINS: staff, INSTRUCTORS: staff, MEMBER: ["APP", "EMAIL"] };
  }
}

export interface StoredTemplate {
  body: LocalizedText;
  category: NotificationCategory;
  code: string | null;
  color: TemplateColor;
  caps: ChannelCaps;
  customized: boolean;
  enabled: boolean;
  icon: TemplateIcon;
  id: string;
  kind: "CATALOG" | "CUSTOM";
  lastChange: LastChange | null;
  mandatory: boolean;
  matrix: ChannelMatrix;
  push: NotificationAudience[];
  /** N-08a `admin_text` (R-11-12): a text without it is refused. */
  requiredVariables: string[];
  seed: { body: LocalizedText; sms: LocalizedText | null; title: LocalizedText } | null;
  sms: LocalizedText | null;
  status: "ACTIVE" | "ARCHIVED" | "DISABLED";
  title: LocalizedText;
  variables: string[];
  version: number;
}

interface TemplateSeed {
  body: LocalizedText;
  category: NotificationCategory;
  code: string | null;
  color?: TemplateColor;
  customized?: { body: LocalizedText };
  icon: TemplateIcon;
  lastChange?: LastChange;
  mandatory?: boolean;
  matrix: Partial<Record<Audience, readonly NotificationChannel[]>>;
  push?: NotificationAudience[];
  requiredVariables?: string[];
  sms?: LocalizedText;
  title: LocalizedText;
  variables: readonly string[];
}

const N28_SEED_BODY = {
  ca: "Hola [[member_first_name]], et comuniquem que en data [[effective_date]] s'ha fet efectiva la teva baixa com a associat de [[club_name]]. T'agraïm el temps que hem compartit — les portes sempre seran obertes per a tu i per a [[dog_name]]. Fins aviat!",
  es: "Hola [[member_first_name]], te comunicamos que en fecha [[effective_date]] se ha hecho efectiva tu baja como asociado de [[club_name]]. Te agradecemos el tiempo que hemos compartido: las puertas siempre estarán abiertas para ti y para [[dog_name]]. ¡Hasta pronto!",
};

/** Mockup D9's text of N-28, with its line breaks (the club edited the seed: `customized`). */
const N28_MOCKUP_BODY = {
  ca: "Hola [[member_first_name]],\net comuniquem que en data [[effective_date]] s'ha fet efectiva la teva baixa com a associat de [[club_name]].\nT'agraïm el temps que hem compartit — les portes sempre seran obertes per a tu i per a [[dog_name]].\nFins aviat!",
  es: "Hola [[member_first_name]],\nte comunicamos que en fecha [[effective_date]] se ha hecho efectiva tu baja como asociado de [[club_name]].\nTe agradecemos el tiempo que hemos compartido: las puertas siempre estarán abiertas para ti y para [[dog_name]].\n¡Hasta pronto!",
};

const SEEDS: readonly TemplateSeed[] = [
  // PERSONAL, in mockup D9's order (N-02, N-09, N-28, N-19), then N-20 and N-37.
  {
    // S11 R-11-12 (E76, E79): N-02's `link` belongs to its welcome e-mail only; the template (the
    // APP copy) does not declare it.
    body: {
      ca: "Ja tens accés a l'app del club.",
      es: "Ya tienes acceso a la app del club.",
    },
    category: "PERSONAL",
    code: "N-02",
    icon: "mail",
    mandatory: true,
    matrix: { MEMBER: ["APP", "EMAIL"] },
    title: { ca: "Benvinguda amb accés", es: "Bienvenida con acceso" },
    variables: ["member_first_name", "club_name"],
  },
  {
    body: {
      ca: "Per la vostra evolució, [[dog_name]] ja ha pujat a nivell [[level_name]]. Ja podeu reservar classes en aquest nou nivell.",
      es: "Por vuestra evolución, [[dog_name]] ya ha subido a nivel [[level_name]]. Ya podéis reservar clases en este nuevo nivel.",
    },
    category: "PERSONAL",
    code: "N-09",
    color: "OK",
    icon: "up",
    matrix: { MEMBER: ["APP", "EMAIL"] },
    title: { ca: "Canvi de nivell", es: "Cambio de nivel" },
    variables: ["dog_name", "level_name", "member_first_name", "club_name"],
  },
  {
    body: N28_SEED_BODY,
    category: "PERSONAL",
    code: "N-28",
    customized: { body: N28_MOCKUP_BODY },
    icon: "doc",
    lastChange: { action: "CATALOG_CHANGED", actorName: "Jordi Soler", at: "2026-08-03T10:12:00Z" },
    matrix: { ADMINS: ["APP"], MEMBER: ["APP", "EMAIL"] },
    title: {
      ca: "Comunicació de baixa com a associat",
      es: "Comunicación de baja como asociado",
    },
    variables: [...MEMBER_VARIABLES, "effective_date"],
  },
  {
    body: {
      ca: "[[class_date]] no vas poder venir a la classe de [[class_description]]. Recorda que pots anul·lar des de l'app fins a última hora: així pot aprofitar la classe algú altre.",
      es: "[[class_date]] no pudiste venir a la clase de [[class_description]]. Recuerda que puedes anular desde la app hasta última hora: así otra persona puede aprovechar la clase.",
    },
    category: "PERSONAL",
    code: "N-19",
    icon: "heart",
    matrix: { MEMBER: ["APP", "EMAIL"] },
    title: { ca: "T'hem trobat a faltar", es: "Te hemos echado de menos" },
    variables: ["class_date", "class_description", "dog_name", "club_name"],
  },
  {
    body: {
      ca: "Tens una tasca nova per a [[dog_name]]. Obre la fitxa per veure-la.",
      es: "Tienes una tarea nueva para [[dog_name]]. Abre la ficha para verla.",
    },
    category: "PERSONAL",
    code: "N-20",
    icon: "doc",
    matrix: { MEMBER: ["APP", "EMAIL"] },
    title: { ca: "Tasca nova", es: "Tarea nueva" },
    variables: ["dog_name", "club_name"],
  },
  {
    body: {
      ca: "Hem registrat [[dog_name]] a la teva fitxa del club.",
      es: "Hemos registrado a [[dog_name]] en tu ficha del club.",
    },
    category: "PERSONAL",
    code: "N-37",
    color: "OK",
    icon: "paw",
    matrix: { MEMBER: ["APP"] },
    title: { ca: "Nou gos afegit", es: "Nuevo perro añadido" },
    variables: ["dog_name", "club_name"],
  },
  // CLUB_CHANGES (8).
  {
    body: {
      ca: "[[class_date]] · [[class_time]] · [[class_description]], amb [[dog_name]]. «[[admin_text]]» — [[club_name]]. Aquesta sessió no compta al teu còmput.",
      es: "[[class_date]] · [[class_time]] · [[class_description]], con [[dog_name]]. «[[admin_text]]» — [[club_name]]. Esta sesión no cuenta en tu cómputo.",
    },
    category: "CLUB_CHANGES",
    code: "N-08a",
    color: "ERROR",
    icon: "x",
    mandatory: true,
    matrix: { ADMINS: ["APP"], INSTRUCTORS: ["APP", "EMAIL"], MEMBER: ["APP", "EMAIL", "SMS"] },
    requiredVariables: ["admin_text"],
    sms: {
      ca: "[[club_name]]: la classe de [[class_date]] a les [[class_time]] ([[class_description]]) queda anul·lada. [[admin_text]]",
      es: "[[club_name]]: la clase de [[class_date]] a las [[class_time]] ([[class_description]]) queda anulada. [[admin_text]]",
    },
    title: { ca: "Classe anul·lada pel club", es: "Clase anulada por el club" },
    variables: [
      "class_date",
      "class_time",
      "class_description",
      "dog_name",
      "admin_text",
      "club_name",
    ],
  },
  {
    body: {
      ca: "La classe de [[class_date]] a les [[class_time]] ha canviat. Revisa-la a l'app.",
      es: "La clase de [[class_date]] a las [[class_time]] ha cambiado. Revísala en la app.",
    },
    category: "CLUB_CHANGES",
    code: "N-08b",
    color: "WARNING",
    icon: "cal",
    matrix: { INSTRUCTORS: ["APP"], MEMBER: ["APP", "EMAIL", "SMS"] },
    sms: {
      ca: "[[club_name]]: la classe de [[class_date]] a les [[class_time]] ha canviat.",
      es: "[[club_name]]: la clase de [[class_date]] a las [[class_time]] ha cambiado.",
    },
    title: { ca: "Classe modificada pel club", es: "Clase modificada por el club" },
    variables: ["class_date", "class_time", "dog_name", "club_name"],
  },
  {
    body: {
      ca: "[[class_date]] [[class_time]] [[class_description]] esteu sols. Si ningú més no s'hi apunta, la classe es cancel·larà.",
      es: "[[class_date]] [[class_time]] [[class_description]] estáis solos. Si nadie más se apunta, la clase se cancelará.",
    },
    category: "CLUB_CHANGES",
    code: "N-16",
    color: "WARNING",
    icon: "warn",
    matrix: { ADMINS: ["APP"], MEMBER: ["APP", "EMAIL"] },
    title: { ca: "Possible anul·lació de classe", es: "Posible anulación de clase" },
    variables: ["class_date", "class_time", "class_description", "dog_name"],
  },
  {
    body: {
      ca: "La classe de [[class_date]] a les [[class_time]] s'ha anul·lat per manca d'alumnes.",
      es: "La clase de [[class_date]] a las [[class_time]] se ha anulado por falta de alumnos.",
    },
    category: "CLUB_CHANGES",
    code: "N-17",
    color: "ERROR",
    icon: "x",
    mandatory: true,
    matrix: { ADMINS: ["APP", "EMAIL"], INSTRUCTORS: ["APP", "EMAIL"] },
    title: {
      ca: "Classe anul·lada per manca d'alumnes",
      es: "Clase anulada por falta de alumnos",
    },
    variables: ["class_date", "class_time", "class_description"],
  },
  {
    body: {
      ca: "Hem hagut d'anul·lar l'activitat. «[[admin_text]]» — [[club_name]].",
      es: "Hemos tenido que anular la actividad. «[[admin_text]]» — [[club_name]].",
    },
    category: "CLUB_CHANGES",
    code: "N-32c",
    color: "ERROR",
    icon: "flag",
    mandatory: true,
    matrix: { MEMBER: ["APP", "EMAIL", "SMS"] },
    sms: {
      ca: "[[club_name]]: activitat anul·lada. [[admin_text]]",
      es: "[[club_name]]: actividad anulada. [[admin_text]]",
    },
    title: { ca: "Activitat cancel·lada pel club", es: "Actividad cancelada por el club" },
    variables: ["admin_text", "club_name"],
  },
  {
    body: {
      ca: "L'activitat ha canviat de data, hora o lloc. Revisa-la a l'app.",
      es: "La actividad ha cambiado de fecha, hora o lugar. Revísala en la app.",
    },
    category: "CLUB_CHANGES",
    code: "N-32d",
    color: "WARNING",
    icon: "flag",
    matrix: { MEMBER: ["APP", "EMAIL", "SMS"] },
    sms: {
      ca: "[[club_name]]: l'activitat ha canviat. Revisa-la a l'app.",
      es: "[[club_name]]: la actividad ha cambiado. Revísala en la app.",
    },
    title: { ca: "Activitat modificada pel club", es: "Actividad modificada por el club" },
    variables: ["club_name"],
  },
  {
    body: {
      ca: "El club ha fet un canvi en la reserva de [[dog_name]]: [[class_date]] a les [[class_time]].",
      es: "El club ha hecho un cambio en la reserva de [[dog_name]]: [[class_date]] a las [[class_time]].",
    },
    category: "CLUB_CHANGES",
    code: "N-36",
    icon: "cal",
    matrix: { MEMBER: ["APP", "EMAIL", "SMS"] },
    sms: {
      ca: "[[club_name]]: canvi en la reserva de [[dog_name]] ([[class_date]] [[class_time]]).",
      es: "[[club_name]]: cambio en la reserva de [[dog_name]] ([[class_date]] [[class_time]]).",
    },
    title: {
      ca: "Reserva feta o anul·lada pel club en nom teu",
      es: "Reserva hecha o anulada por el club en tu nombre",
    },
    variables: ["dog_name", "class_date", "class_time", "club_name"],
  },
  {
    body: {
      ca: "El club ha fet un canvi en l'entrenament de [[dog_name]]: [[date]] · [[time]].",
      es: "El club ha hecho un cambio en el entrenamiento de [[dog_name]]: [[date]] · [[time]].",
    },
    category: "CLUB_CHANGES",
    code: "N-47",
    icon: "cone",
    matrix: { MEMBER: ["APP", "EMAIL", "SMS"] },
    sms: {
      ca: "[[club_name]]: canvi en l'entrenament de [[dog_name]] ([[date]] [[time]]).",
      es: "[[club_name]]: cambio en el entrenamiento de [[dog_name]] ([[date]] [[time]]).",
    },
    title: {
      ca: "Entrenament reservat o anul·lat pel club en nom teu",
      es: "Entrenamiento reservado o anulado por el club en tu nombre",
    },
    variables: ["dog_name", "date", "time", "club_name"],
  },
  // CLUB_NEWS (4): N-24, N-32a and the club's own.
  {
    body: {
      ca: "Hola [[member_first_name]], [[club_name]] us vol fer arribar aquest comunicat.",
      es: "Hola [[member_first_name]], [[club_name]] os quiere hacer llegar este comunicado.",
    },
    category: "CLUB_NEWS",
    code: "N-24",
    color: "ACCENT",
    icon: "bell",
    matrix: { MEMBER: ["APP", "EMAIL"] },
    push: ["MEMBER"],
    title: { ca: "Comunicat del club", es: "Comunicado del club" },
    variables: [...MEMBER_VARIABLES, "member_name"],
  },
  {
    body: {
      ca: "Hem publicat una activitat nova. Consulta-la i apunta-t'hi des de l'app.",
      es: "Hemos publicado una actividad nueva. Consúltala y apúntate desde la app.",
    },
    category: "CLUB_NEWS",
    code: "N-32a",
    color: "ACCENT",
    icon: "flag",
    matrix: { MEMBER: ["APP"] },
    title: { ca: "Activitat publicada", es: "Actividad publicada" },
    variables: ["club_name"],
  },
  // OPERATIONAL (12).
  ...(
    [
      [
        "N-01",
        "Sol·licitud d'alta rebuda",
        "Solicitud de alta recibida",
        "doc",
        { ADMINS: ["APP", "EMAIL"] },
      ],
      ["N-04", "Reserva confirmada", "Reserva confirmada", "check", { MEMBER: ["APP"] }],
      ["N-05", "Reserva anul·lada", "Reserva anulada", "x", { MEMBER: ["APP"] }],
      ["N-06", "Entrenament reservat", "Entrenamiento reservado", "check", { MEMBER: ["APP"] }],
      ["N-07", "Entrenament anul·lat", "Entrenamiento anulado", "x", { MEMBER: ["APP"] }],
      ["N-10", "Rebut impagat", "Recibo impagado", "warn", { ADMINS: ["APP", "EMAIL"] }],
      ["N-13", "Recordatori de classe", "Recordatorio de clase", "clock", { MEMBER: ["APP"] }],
      [
        "N-14",
        "Sol·licitud de baixa rebuda",
        "Solicitud de baja recibida",
        "doc",
        { ADMINS: ["APP", "EMAIL"] },
      ],
      [
        "N-15",
        "S'ha alliberat una plaça!",
        "¡Se ha liberado una plaza!",
        "unlock",
        { MEMBER: ["APP", "SMS"] },
      ],
      ["N-21", "Tasca completada", "Tarea completada", "check", { INSTRUCTORS: ["APP"] }],
      ["N-22", "Nota de l'alumne", "Nota del alumno", "doc", { INSTRUCTORS: ["APP"] }],
      [
        "N-34",
        "Sol·licituds d'alta pendents",
        "Solicitudes de alta pendientes",
        "clock",
        { ADMINS: ["APP"] },
      ],
    ] as const
  ).map(([code, ca, es, icon, matrix]): TemplateSeed => ({
    body: {
      ca: `${ca}: consulta-ho a l'app de [[club_name]].`,
      es: `${es}: consúltalo en la app de [[club_name]].`,
    },
    category: "OPERATIONAL",
    code,
    icon,
    matrix,
    ...(code === "N-13" || code === "N-15" ? { push: ["MEMBER" as const] } : {}),
    ...(code === "N-15"
      ? {
          sms: {
            ca: "[[club_name]]: s'ha alliberat una plaça. Entra a l'app per agafar-la.",
            es: "[[club_name]]: se ha liberado una plaza. Entra en la app para cogerla.",
          },
        }
      : {}),
    title: { ca, es },
    variables: ["club_name"],
  })),
];

/** The club's own templates (CUSTOM, CLUB_NEWS): member variables only, no action (R-11-12). */
const CUSTOM_SEEDS: readonly TemplateSeed[] = [
  {
    body: {
      ca: "Hola [[member_first_name]]! Dissabte fem la festa de final de temporada a la pista Central. Porta [[dog_name]] i ganes de passar-ho bé.",
      es: "¡Hola [[member_first_name]]! El sábado hacemos la fiesta de final de temporada en la pista Central. Trae a [[dog_name]] y ganas de pasarlo bien.",
    },
    category: "CLUB_NEWS",
    code: null,
    color: "ACCENT",
    icon: "heart",
    matrix: { MEMBER: ["APP", "EMAIL"] },
    title: { ca: "Festa de final de temporada", es: "Fiesta de final de temporada" },
    variables: [...MEMBER_VARIABLES],
  },
  {
    body: {
      ca: "Hola [[member_first_name]], a l'agost les classes de tarda comencen a les 19:00. Bon estiu!",
      es: "Hola [[member_first_name]], en agosto las clases de tarde empiezan a las 19:00. ¡Feliz verano!",
    },
    category: "CLUB_NEWS",
    code: null,
    icon: "info",
    matrix: { MEMBER: ["APP", "EMAIL"] },
    title: { ca: "Horari d'estiu", es: "Horario de verano" },
    variables: [...MEMBER_VARIABLES],
  },
];

function stored(seed: TemplateSeed, index: number): StoredTemplate {
  const kind = seed.code === null ? "CUSTOM" : "CATALOG";
  const matrix: ChannelMatrix = {
    ADMINS: seed.matrix.ADMINS === undefined ? NONE : cells(seed.matrix.ADMINS),
    INSTRUCTORS: seed.matrix.INSTRUCTORS === undefined ? NONE : cells(seed.matrix.INSTRUCTORS),
    MEMBER: seed.matrix.MEMBER === undefined ? NONE : cells(seed.matrix.MEMBER),
  };
  const caps = categoryCaps(seed.category, kind);
  // Per-code exception of the catalog (R-11-12): N-15 carries SMS to MEMBER.
  if (seed.code === "N-15") caps.MEMBER = ["APP", "EMAIL", "SMS"];
  const body = seed.customized?.body ?? seed.body;
  return {
    body,
    caps,
    category: seed.category,
    code: seed.code,
    color: seed.color ?? "NEUTRAL",
    customized: seed.customized !== undefined,
    enabled: true,
    icon: seed.icon,
    id: seed.code === null ? `tpl-custom-${String(index + 1)}` : `tpl-${seed.code.toLowerCase()}`,
    kind,
    lastChange: seed.lastChange ?? null,
    mandatory: seed.mandatory ?? false,
    matrix,
    push: seed.push ?? [],
    requiredVariables: seed.requiredVariables ?? [],
    seed: kind === "CATALOG" ? { body: seed.body, sms: seed.sms ?? null, title: seed.title } : null,
    sms: seed.sms ?? null,
    status: "ACTIVE",
    title: seed.title,
    variables: [...seed.variables],
    version: seed.customized === undefined ? 1 : 3,
  };
}

function initialTemplates(): StoredTemplate[] {
  return [...SEEDS.map((seed, index) => stored(seed, index)), ...CUSTOM_SEEDS.map(stored)];
}

interface Replay {
  body: unknown;
  signature: string;
  status: number;
}

export const messagingState: {
  batches: number;
  idempotency: Map<string, Replay>;
  nextId: number;
  /** Test sends of the preview (`sendTest`), newest last. */
  testSends: { locale: string; templateId: string }[];
  templates: StoredTemplate[];
} = {
  batches: 0,
  idempotency: new Map(),
  nextId: 100,
  testSends: [],
  templates: initialTemplates(),
};

export function resetMessagingState(): void {
  messagingState.batches = 0;
  messagingState.idempotency = new Map();
  messagingState.nextId = 100;
  messagingState.testSends = [];
  messagingState.templates = initialTemplates();
}

export function nextMessagingId(prefix: string): string {
  messagingState.nextId += 1;
  return `${prefix}-${String(messagingState.nextId)}`;
}

export function findTemplate(id: string): StoredTemplate | undefined {
  return messagingState.templates.find(
    (template) => template.id === id && template.status !== "ARCHIVED",
  );
}

/** `LocalizedText` read in the admin's language (R-11-01 fallback: the club's first locale). */
function resolved(text: LocalizedText, locale: MessagingLocale): string {
  return text[locale] ?? text.ca ?? Object.values(text)[0] ?? "";
}

export function templateListItem(
  template: StoredTemplate,
  locale: MessagingLocale,
): MessageTemplateListItem {
  return {
    caps: template.caps,
    category: template.category,
    code: template.code,
    color: template.color,
    customized: template.customized,
    enabled: template.enabled,
    icon: template.icon,
    id: template.id,
    kind: template.kind,
    lastChange: template.lastChange,
    matrix: template.matrix,
    name: resolved(template.title, locale),
    push: template.push,
    variables: variables(template.variables, locale),
  };
}

export function templateDetail(
  template: StoredTemplate,
  locale: MessagingLocale,
): MessageTemplateDetail {
  return {
    ...templateListItem(template, locale),
    bodyI18n: { ...template.body },
    mandatory: template.mandatory,
    seedDefault:
      template.seed === null
        ? null
        : {
            bodyI18n: { ...template.seed.body },
            smsBodyI18n: template.seed.sms === null ? null : { ...template.seed.sms },
            titleI18n: { ...template.seed.title },
          },
    smsBodyI18n: template.sms === null ? null : { ...template.sms },
    status: template.status,
    titleI18n: { ...template.title },
    version: template.version,
  };
}

/** «Plantilles per categoria»: the live templates per category (archived ones excluded). */
export function countsByCategory(): components["schemas"]["CategoryCounts"] {
  const count = (category: NotificationCategory) =>
    messagingState.templates.filter(
      (template) => template.category === category && template.status !== "ARCHIVED",
    ).length;
  return {
    CLUB_CHANGES: count("CLUB_CHANGES"),
    CLUB_NEWS: count("CLUB_NEWS"),
    OPERATIONAL: count("OPERATIONAL"),
    PERSONAL: count("PERSONAL"),
  };
}

// ── Validation and rendering (R-11-05, R-11-06, R-11-12) ──────────────────────────────────────

const VARIABLE_PATTERN = /\[\[([^\]]*)\]\]/gu;

/** `[[` without its `]]` (or the reverse): TEMPLATE_SYNTAX_ERROR. */
export function syntaxError(text: string): boolean {
  const stripped = text.replace(VARIABLE_PATTERN, "");
  return stripped.includes("[[") || stripped.includes("]]");
}

/** The `[[keys]]` of a text that the template does not list: TEMPLATE_UNKNOWN_VARIABLE. */
export function unknownVariables(text: string, known: readonly string[]): string[] {
  return [...text.matchAll(VARIABLE_PATTERN)]
    .map((match) => (match[1] ?? "").trim())
    .filter((key) => !known.includes(key));
}

/** The required variables absent from every body (VALIDATION_ERROR `details.missingVariables`). */
export function missingVariables(body: LocalizedText, required: readonly string[]): string[] {
  return required.filter((key) => Object.values(body).some((text) => !text.includes(`[[${key}]]`)));
}

/** The female branch of an ICU `{gender, select, …}` (Laura, the preview's person). */
function icuFemale(text: string): string {
  return text.replace(
    /\{gender, select, female \{([^}]*)\} other \{[^}]*\}\}/gu,
    (_, female: string) => female,
  );
}

function render(
  text: string,
  locale: MessagingLocale,
  clubName: string,
  warnings: Set<string>,
  omitted: readonly string[] = [],
) {
  const rendered = icuFemale(text).replace(VARIABLE_PATTERN, (_, raw: string) => {
    const key = raw.trim();
    if (omitted.includes(key)) return "";
    if (key === "club_name") return clubName;
    const value = PREVIEW_VALUES[key]?.[locale];
    if (value === undefined) {
      warnings.add(key);
      return "";
    }
    return value;
  });
  // R-11-05 (4): the first letter in capitals.
  return rendered.charAt(0).toLocaleUpperCase(locale) + rendered.slice(1);
}

const GSM7: Readonly<Record<string, string>> = {
  "·": ".",
  "—": "-",
  "“": '"',
  "”": '"',
  "«": '"',
  "»": '"',
  "’": "'",
  à: "a",
  á: "a",
  ç: "c",
  è: "e",
  í: "i",
  ï: "i",
  ò: "o",
  ó: "o",
  ú: "u",
  ü: "u",
};

/** R-11-06: the SMS text transliterated to GSM-7. */
function gsm7(text: string): string {
  return text.replace(/./gsu, (character) => GSM7[character] ?? character);
}

/**
 * The length `SMS_BODY_TOO_LONG` counts against 160 (R-11-06; ruling E82 on E6-W04 Q3): the SMS
 * text rendered with the preview data of its language, without `admin_text` (the admin writes it
 * at each send, so N-08a's own text is not refused for it), and transliterated to GSM-7.
 */
export function smsCheckedLength(text: string, locale: string, clubName: string): number {
  return gsm7(render(text, messagingLocale(locale), clubName, new Set(), ["admin_text"])).length;
}

function smsPreview(text: string) {
  const transliterated = gsm7(text);
  const truncated = transliterated.length > 160;
  const final = truncated ? `${transliterated.slice(0, 159)}…` : transliterated;
  return { length: final.length, segments: Math.ceil(final.length / 160), text: final, truncated };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** `POST …/preview`: the draft (or the saved texts) rendered with the fictional data. */
export function templatePreview(
  template: StoredTemplate,
  locale: MessagingLocale,
  draft: { body: string; smsBody?: string | null | undefined; title: string } | null,
  clubName: string,
): TemplatePreview {
  const warnings = new Set<string>();
  const title = render(
    draft?.title ?? resolved(template.title, locale),
    locale,
    clubName,
    warnings,
  );
  const body = render(draft?.body ?? resolved(template.body, locale), locale, clubName, warnings);
  const smsSource =
    draft === null
      ? template.sms === null
        ? null
        : resolved(template.sms, locale)
      : (draft.smsBody ?? null);
  const sms =
    smsSource === null || smsSource === ""
      ? null
      : smsPreview(render(smsSource, locale, clubName, warnings));
  const paragraphs = body
    .split("\n")
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
  return {
    body,
    emailHtml: `<!doctype html><html lang="${locale}"><body><header><strong>${escapeHtml(clubName)}</strong></header><h1>${escapeHtml(title)}</h1>${paragraphs}</body></html>`,
    emailSubject: title,
    sms,
    title,
    warnings: [...warnings].map((variable) => ({ code: "TEMPLATE_UNKNOWN_VARIABLE", variable })),
  };
}

// ── The notification log (R-11-10) ───────────────────────────────────────────────────────────

interface LogSeed {
  audience: NotificationAudience;
  category: NotificationCategory;
  code: string;
  createdAt: string;
  deliveries: [NotificationChannel, DeliveryStatus][];
  memberId: string | null;
  name: string;
  readAt: string | null;
  title: string;
}

const LAURA = "member-laura";
const MARC = "member-marc";
const ANNA = "member-anna";

const LOG_SEEDS: readonly LogSeed[] = [
  {
    audience: "MEMBER",
    category: "CLUB_CHANGES",
    code: "N-08a",
    createdAt: "2026-08-10T15:58:00Z",
    deliveries: [
      ["APP", "DELIVERED"],
      ["EMAIL", "DELIVERED"],
      ["SMS", "SENT"],
    ],
    memberId: LAURA,
    name: "Laura Serra Vidal",
    readAt: null,
    title: "Classe anul·lada pel club",
  },
  {
    audience: "MEMBER",
    category: "OPERATIONAL",
    code: "N-15",
    createdAt: "2026-08-10T15:56:00Z",
    deliveries: [
      ["APP", "DELIVERED"],
      ["SMS", "SKIPPED_CAP"],
      ["EMAIL", "QUEUED"],
    ],
    memberId: LAURA,
    name: "Laura Serra Vidal",
    readAt: null,
    title: "S'ha alliberat una plaça!",
  },
  {
    audience: "MEMBER",
    category: "CLUB_NEWS",
    code: "N-24",
    createdAt: "2026-08-09T09:00:00Z",
    deliveries: [
      ["APP", "DELIVERED"],
      ["EMAIL", "SKIPPED_BY_PREFERENCE"],
      ["PUSH", "SKIPPED_NO_CONTACT"],
    ],
    memberId: ANNA,
    name: "Anna Ballart",
    readAt: "2026-08-09T12:30:00Z",
    title: "Comunicat del club",
  },
  {
    audience: "MEMBER",
    category: "OPERATIONAL",
    code: "N-13",
    createdAt: "2026-08-08T16:50:00Z",
    deliveries: [
      ["APP", "DELIVERED"],
      ["PUSH", "SKIPPED_STALE"],
    ],
    memberId: MARC,
    name: "Marc Puig",
    readAt: null,
    title: "Recordatori de classe",
  },
  {
    audience: "MEMBER",
    category: "PERSONAL",
    code: "N-09",
    createdAt: "2026-08-07T11:20:00Z",
    deliveries: [
      ["APP", "DELIVERED"],
      ["EMAIL", "FAILED"],
    ],
    memberId: LAURA,
    name: "Laura Serra Vidal",
    readAt: "2026-08-07T18:00:00Z",
    title: "Canvi de nivell",
  },
  {
    audience: "MEMBER",
    category: "CLUB_CHANGES",
    code: "N-36",
    createdAt: "2026-08-06T10:05:00Z",
    deliveries: [
      ["APP", "DELIVERED"],
      ["EMAIL", "SENT"],
      ["SMS", "SKIPPED_MODULE_OFF"],
    ],
    memberId: ANNA,
    name: "Anna Ballart",
    readAt: null,
    title: "Reserva feta o anul·lada pel club en nom teu",
  },
  {
    audience: "ADMINS",
    category: "OPERATIONAL",
    code: "N-01",
    createdAt: "2026-08-05T08:40:00Z",
    deliveries: [
      ["APP", "DELIVERED"],
      ["EMAIL", "DELIVERED"],
    ],
    memberId: null,
    name: "Jordi Soler",
    readAt: "2026-08-05T09:00:00Z",
    title: "Sol·licitud d'alta rebuda",
  },
  {
    audience: "APPLICANT",
    category: "OPERATIONAL",
    code: "N-01",
    createdAt: "2026-08-05T08:40:00Z",
    deliveries: [["EMAIL", "DELIVERED"]],
    memberId: null,
    name: "Clara Font",
    readAt: null,
    title: "Sol·licitud d'alta rebuda",
  },
  {
    audience: "MEMBER",
    category: "PERSONAL",
    code: "N-38",
    createdAt: "2026-08-04T17:30:00Z",
    deliveries: [["EMAIL", "SKIPPED_NOT_ALLOWED"]],
    memberId: MARC,
    name: "Marc Puig",
    readAt: null,
    title: "Canvi de mètode de pagament",
  },
  {
    audience: "INSTRUCTORS",
    category: "OPERATIONAL",
    code: "N-21",
    createdAt: "2026-08-02T09:20:00Z",
    deliveries: [["APP", "DELIVERED"]],
    memberId: null,
    name: "Estel Rius",
    readAt: "2026-08-02T10:00:00Z",
    title: "Tasca completada",
  },
  {
    audience: "MEMBER",
    category: "PERSONAL",
    code: "N-19",
    createdAt: "2026-07-29T06:00:00Z",
    deliveries: [
      ["APP", "DELIVERED"],
      ["EMAIL", "DELIVERED"],
    ],
    memberId: LAURA,
    name: "Laura Serra Vidal",
    readAt: "2026-07-29T07:45:00Z",
    title: "T'hem trobat a faltar",
  },
  {
    audience: "MEMBER",
    category: "PERSONAL",
    code: "N-28",
    createdAt: "2026-07-31T10:00:00Z",
    deliveries: [
      ["APP", "DELIVERED"],
      ["EMAIL", "DELIVERED"],
    ],
    memberId: ANNA,
    name: "Anna Ballart",
    readAt: null,
    title: "Comunicació de baixa com a associat",
  },
];

/** A delivery's destination as the api stores it: the full address or phone (the UI masks it). */
function target(channel: NotificationChannel, seed: LogSeed): string | null {
  const person =
    seed.name.split(" ")[0]?.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "") ?? "";
  switch (channel) {
    case "APP":
      return null;
    case "EMAIL":
      return `${person}@example.test`;
    case "SMS":
      return "+34655100101";
    case "PUSH":
      return "push-subscription-7f3a";
  }
}

function delivery(
  channel: NotificationChannel,
  status: DeliveryStatus,
  seed: LogSeed,
): DeliveryView {
  const at = seed.createdAt;
  const done = status === "SENT" || status === "DELIVERED";
  return {
    attempts: status === "FAILED" ? 5 : status === "QUEUED" ? 1 : done ? 1 : 0,
    channel,
    deliveredAt: status === "DELIVERED" ? at : null,
    failedAt: status === "FAILED" ? at : null,
    lastError: status === "FAILED" ? "550 5.1.1 mailbox unavailable" : null,
    nextAttemptAt: status === "QUEUED" ? at : null,
    providerRef:
      done && channel !== "APP" ? `prov-${seed.code.toLowerCase()}-${channel.toLowerCase()}` : null,
    sentAt: done && channel !== "APP" ? at : null,
    status,
    target: target(channel, seed),
  };
}

export interface StoredNotification extends NotificationDetail {
  /** The filter of the D10 link (`memberId`): the recipient's member. */
  memberId: string | null;
}

function notification(seed: LogSeed, index: number): StoredNotification {
  return {
    audience: seed.audience,
    body: `${seed.title}. Text renderitzat i congelat del codi ${seed.code}.`,
    category: seed.category,
    channels: seed.deliveries.map(([channel, status]) => ({ channel, status })),
    code: seed.code,
    createdAt: seed.createdAt,
    deliveries: seed.deliveries.map(([channel, status]) => delivery(channel, status, seed)),
    eventType: seed.code === "N-24" ? "AnnouncementSent" : "ClassCancelledByClub",
    id: `notification-${String(index + 1)}`,
    locale: "ca",
    memberId: seed.memberId,
    readAt: seed.readAt,
    recipient: {
      displayName: seed.name,
      email: seed.audience === "APPLICANT" ? "clara.font@example.test" : null,
      memberId: seed.memberId,
    },
    smsBody: seed.deliveries.some(([channel]) => channel === "SMS")
      ? `${seed.title}. Entra a l'app.`
      : null,
    subject: { memberId: seed.memberId },
    templateId: `tpl-${seed.code.toLowerCase()}`,
    templateVersion: 1,
    title: seed.title,
  };
}

export const notificationLog: readonly StoredNotification[] = LOG_SEEDS.map(notification);

export function notificationListItem(item: StoredNotification): NotificationListItem {
  return {
    audience: item.audience ?? null,
    category: item.category,
    channels: item.channels,
    code: item.code,
    createdAt: item.createdAt,
    id: item.id,
    readAt: item.readAt ?? null,
    recipient: item.recipient,
  };
}

/** `GET /notifications/{id}`: the stored notification without the log's own filter key. */
export function notificationDetail(item: StoredNotification): NotificationDetail {
  return Object.fromEntries(
    Object.entries(item).filter(([key]) => key !== "memberId"),
  ) as unknown as NotificationDetail;
}
