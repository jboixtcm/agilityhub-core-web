import type { components } from "@agilityhub/api-client";

type SignupView = components["schemas"]["MemberSignupView"];
type Member = SignupView["member"];

/**
 * R-04-06 (E38): during a pending readmission `member` is the LEFT record, which keeps its values
 * until the validation applies the submitted ones, and a `PATCH /members/{id}` edits the submitted
 * values. D2 therefore shows and edits the person as submitted: the LEFT record overlaid with
 * `readmission.submitted`. Any other signup is its `member` as is.
 */
export function signupPerson(signup: SignupView): Member {
  const submitted = signup.readmission?.submitted;
  if (submitted === undefined) return signup.member;
  const record = signup.member;
  const sameName =
    submitted.firstName === record.firstName &&
    submitted.lastName1 === record.lastName1 &&
    submitted.lastName2 === record.lastName2;
  const person: Member = {
    ...record,
    address: submitted.address ?? record.address,
    birthDate: submitted.birthDate ?? record.birthDate,
    contactEmails: submitted.contactEmails,
    firstName: submitted.firstName,
    fullName: sameName
      ? record.fullName
      : [submitted.firstName, submitted.lastName1, submitted.lastName2]
          .filter((part): part is string => typeof part === "string" && part.trim() !== "")
          .join(" "),
    gender: submitted.gender ?? record.gender,
    lastName1: submitted.lastName1,
    phones: submitted.phones,
  };
  // The submitted block is the whole person: no second surname there (absent or null) means none.
  if (submitted.lastName2 == null) delete person.lastName2;
  else person.lastName2 = submitted.lastName2;
  const payment = submitted.paymentMethod;
  if (payment != null) {
    person.paymentMethod = payment;
    // R-04-10: SEPA without an account is «Compte no informat» (the core sends `maskedAccount: null`).
    const account = payment.maskedAccount ?? undefined;
    person.accountMissing = payment.type === "SEPA_DD" && account === undefined;
    if (account === undefined) delete person.maskedAccount;
    else person.maskedAccount = account;
  }
  return person;
}
