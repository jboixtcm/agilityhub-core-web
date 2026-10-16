/**
 * A file name from a course or ring name: lower case, ASCII, dashes; `fallback` when nothing is
 * left. Its own module so D7 (in the main bundle) names files like D18 without loading it.
 */
export function fileSlug(name: string, fallback: string): string {
  const slug = (value: string) =>
    value
      .normalize("NFD")
      .replaceAll(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, "-")
      .replaceAll(/^-|-$/gu, "");
  const named = slug(name);
  return named === "" ? slug(fallback) : named;
}
