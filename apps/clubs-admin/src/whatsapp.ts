/**
 * The wa.me link of a phone, digits only (FE-09): whatever a member typed in the prefix or the
 * number never shapes the link's path or query. The member record and the sign-up review use it.
 */
export function whatsAppUrl(phone: { number: string; prefix: string }): string {
  return `https://wa.me/${phone.prefix.replaceAll(/\D/gu, "")}${phone.number.replaceAll(/\D/gu, "")}`;
}
