export type Locale = "ca" | "en" | "es";

const catalanMessages = {
  "shell.clubs": "AgilityHub Clubs",
  "shell.clubsAdmin": "AgilityHub Clubs Admin",
  "shell.id": "AgilityHub ID",
} as const;

export type MessageKey = keyof typeof catalanMessages;

const messages: Record<Locale, Record<MessageKey, string>> = {
  ca: catalanMessages,
  en: {
    "shell.clubs": "AgilityHub Clubs",
    "shell.clubsAdmin": "AgilityHub Clubs Admin",
    "shell.id": "AgilityHub ID",
  },
  es: {
    "shell.clubs": "AgilityHub Clubs",
    "shell.clubsAdmin": "AgilityHub Clubs Admin",
    "shell.id": "AgilityHub ID",
  },
};

export function t(key: MessageKey, locale: Locale = "ca"): string {
  return messages[locale][key];
}
