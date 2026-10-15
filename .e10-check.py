import json
import re

codes = """SLUG_TAKEN HOST_ALREADY_USED MODULE_DEPENDENCY HOST_RESERVED VALIDATION_ERROR STALE_VERSION
TIMEZONE_CHANGE_BLOCKED THEME_CONTRAST PROVIDER_CONFIG_INVALID PROVIDER_IN_USE STRIPE_CONNECTION_FAILED
CATALOG_NOT_EMPTY CURRENCY_MISMATCH TEMPLATE_CLUB_NOT_FOUND LAST_ADMIN MEMBERSHIP_EXISTS INVALID_STATE
LAST_PLATFORM_ADMIN CLUB_NOT_FOUND FILE_TOO_LARGE FILE_TYPE_NOT_ALLOWED JOB_ALREADY_RUNNING
IMPERSONATION_DENIED FORBIDDEN PARAMETER_INVALID UNKNOWN_PARAMETER ACCOUNT_BLOCKED INVALID_FILTER
NOT_IMPLEMENTED MODULE_DISABLED JOB_UNKNOWN NOT_FOUND RATE_LIMITED""".split()
errors = {loc: json.load(open(f"packages/i18n/src/locales/{loc}/errors.json")) for loc in ("ca", "es", "en")}
catalog = open("docs/specs/00-transversal/CATALEG_ERRORS.md").read()
for c in codes:
    print(c, {loc: (c in e) for loc, e in errors.items()}, "catalog" if re.search(r"\b" + c + r"\b", catalog) else "NOT-IN-CATALOG")
print(list(errors["ca"].keys())[:5], type(errors["ca"][list(errors["ca"].keys())[0]]))
