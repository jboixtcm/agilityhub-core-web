const MASK_OR_SPACE = /[\s·•*…]/gu;
const MASK_GROUP = "····";

/**
 * S03 R-03-27: the one masked-IBAN format, «···· ···· ···· ···· {last 4}».
 * Accepts whatever masked (or full) account string the core sends and keeps only its
 * last four characters; `null` when there is no account.
 */
export function fmtMaskedIban(maskedAccount: string | null | undefined): string | null {
  if (maskedAccount == null) return null;
  const visible = maskedAccount.replaceAll(MASK_OR_SPACE, "");
  if (visible === "") return null;
  return `${MASK_GROUP} ${MASK_GROUP} ${MASK_GROUP} ${MASK_GROUP} ${visible.slice(-4)}`;
}
