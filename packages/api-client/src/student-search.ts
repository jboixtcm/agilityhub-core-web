import { useCallback, useEffect, useRef, useState } from "react";

import type { ApiClient } from "./client";
import type { components } from "./generated/schema";

export type StudentSearchDog = components["schemas"]["DogListItem"];

/** CONVENCIONS_API §4: the list's page size; «Mostra'n més» reads the next page. */
export const STUDENT_SEARCH_PAGE_SIZE = 50;

/**
 * S10 R-10-00 for a search row: the «{guia}» of «{guia} + {gos}» is `handlerName`, else the owner's
 * first name as the api sends it (`owner.firstName`, a compound one whole, E5-T29); when another
 * guide leads the dog, `ownerFullName` names the member for «(abonat: {nom i cognom})».
 */
export function studentSearchGuide(dog: StudentSearchDog): {
  guide: string;
  ownerFullName?: string;
} {
  const handler = dog.handlerName?.trim() ?? "";
  if (handler === "") return { guide: dog.owner?.firstName ?? "" };
  return dog.owner === undefined || dog.owner.fullName === handler
    ? { guide: handler }
    : { guide: handler, ownerFullName: dog.owner.fullName };
}

interface SearchPages {
  /** A failed first page (the screen's error) or a failed next page (the rows stay). */
  error?: unknown;
  items: StudentSearchDog[];
  /** The query (and retry) these pages answer. */
  key: string;
  /** Pages read so far. */
  loaded: number;
  /** The next page is being read. */
  pending: boolean;
  totalPages: number;
}

/**
 * The instructor's student search (S10 §2 «Alumnes», §13-9; screen 22's search and the back
 * office's `/alumnes`): `GET /dogs?q=&filter=status:eq:ACTIVE` in the instructor's projection,
 * read one page after another (CONVENCIONS_API §4, as the universal lists do) — the first when
 * the query settles, each next one on `more()`, appended. An answer for another query than the
 * one on screen is dropped; the api searches, the list is never filtered here.
 */
export function useStudentSearch(client: ApiClient, query: string) {
  const [reload, setReload] = useState(0);
  const requestKey = `${query}|${String(reload)}`;
  const [pages, setPages] = useState<SearchPages>({
    items: [],
    key: "",
    loaded: 0,
    pending: false,
    totalPages: 0,
  });
  // One next page at a time per query, also for a second tap before the next render: the guard
  // holds the query whose next page is being read, so a new query's «Mostra'n més» answers at once.
  const reading = useRef<string | undefined>(undefined);

  const readPage = useCallback(
    async (page: number) => {
      const { data } = await client.GET("/dogs", {
        params: {
          query: {
            fields: "id,name,handlerName,owner,level",
            filter: ["status:eq:ACTIVE"],
            page,
            size: STUDENT_SEARCH_PAGE_SIZE,
            sort: ["name,asc"],
            ...(query === "" ? {} : { q: query }),
          },
        },
      });
      if (data === undefined) throw new TypeError("The dogs response did not contain data");
      return data;
    },
    [client, query],
  );

  useEffect(() => {
    let current = true;
    readPage(0).then(
      (data) => {
        if (!current) return;
        setPages({
          items: data.items,
          key: requestKey,
          loaded: 1,
          pending: false,
          totalPages: data.totalPages,
        });
      },
      (error: unknown) => {
        if (!current) return;
        setPages({ error, items: [], key: requestKey, loaded: 0, pending: false, totalPages: 0 });
      },
    );
    return () => {
      current = false;
    };
  }, [readPage, requestKey]);

  const ready = pages.key === requestKey;
  const more = async () => {
    if (!ready || reading.current === requestKey || pages.loaded >= pages.totalPages) return;
    const forKey = requestKey;
    reading.current = forKey;
    const page = pages.loaded;
    setPages((value) => ({ ...value, error: undefined, pending: true }));
    try {
      const data = await readPage(page);
      setPages((value) => {
        if (value.key !== forKey) return value;
        const known = new Set(value.items.map((item) => item.id));
        return {
          ...value,
          items: [...value.items, ...data.items.filter((item) => !known.has(item.id))],
          loaded: page + 1,
          pending: false,
          totalPages: data.totalPages,
        };
      });
    } catch (error) {
      setPages((value) => (value.key === forKey ? { ...value, error, pending: false } : value));
    } finally {
      if (reading.current === forKey) reading.current = undefined;
    }
  };

  return {
    error: ready ? pages.error : undefined,
    firstFailed: ready && pages.loaded === 0 && pages.error !== undefined,
    hasMore: ready && pages.loaded > 0 && pages.loaded < pages.totalPages,
    items: ready ? pages.items : [],
    loading: !ready,
    more,
    pending: ready && pages.pending,
    retry: () => {
      setReload((value) => value + 1);
    },
  };
}
