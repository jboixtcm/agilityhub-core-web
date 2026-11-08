import { createContext, type ReactNode, useContext } from "react";

const ListPreferenceScope = createContext<string | undefined>(undefined);

/** Account and tenant scope is supplied by the authenticated shell, never shared across users. */
export function ListPreferencesProvider({
  children,
  scope,
}: {
  children: ReactNode;
  scope: string | undefined;
}) {
  return <ListPreferenceScope.Provider value={scope}>{children}</ListPreferenceScope.Provider>;
}

export function useListPageSizePreference(listKey: string) {
  const scope = useContext(ListPreferenceScope);
  const key =
    scope === undefined
      ? undefined
      : `agilityhub.list.pageSize.${JSON.stringify([scope, listKey])}`;
  return {
    key,
    read: () => {
      try {
        return key === undefined ? undefined : Number(localStorage.getItem(key));
      } catch {
        return undefined;
      }
    },
    save: (size: number) => {
      try {
        if (key !== undefined) localStorage.setItem(key, String(size));
      } catch {
        // Private browsing or full storage must not prevent list navigation.
      }
    },
  };
}
