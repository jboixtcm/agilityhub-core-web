/**
 * WEB-07 (decision of 13 Nov 2026): a member's IBAN entered by an admin (D10's payment method, D2's
 * [EDITA LES DADES]) is checked before it is saved, as the sign-up checks it (R-04-10): the IBAN
 * pattern (country, check digits, 11–30 account characters), the Spanish length (24) and the
 * ISO 7064 mod-97 check digits. Spaces are ignored and letters may be lower case, as the api reads
 * it; the api checks it again (`400 INVALID_IBAN`).
 */
export function validIban(value: string): boolean {
  const iban = value.replaceAll(/\s/gu, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/u.test(iban)) return false;
  if (iban.startsWith("ES") && iban.length !== 24) return false;
  const digits = `${iban.slice(4)}${iban.slice(0, 4)}`.replaceAll(/[A-Z]/gu, (letter) =>
    String(letter.charCodeAt(0) - 55),
  );
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}
