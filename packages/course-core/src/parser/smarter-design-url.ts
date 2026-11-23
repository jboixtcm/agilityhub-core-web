/** Canonical link to a shared design (shared links may include a title or tracking parameters). */
export function smarterDesignUrl(input: string | null | undefined): string | null {
  const value = input?.trim();
  if (!value || value.length > 2048 || /[\s\\]/u.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['www.smarteragility.com', 'smarteragility.com'].includes(url.hostname)
        || url.port || url.username || url.password || !/^\/public-design\/?$/u.test(url.pathname)) return null;
    const ids = url.searchParams.getAll('id');
    const id = ids[0];
    if (ids.length !== 1 || !id || !/^[a-f0-9]{32}$/iu.test(id)) return null;
    return `https://www.smarteragility.com/public-design?id=${id.toLowerCase()}`;
  } catch {
    return null;
  }
}
