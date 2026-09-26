/**
 * Sparse lists (CONVENCIONS_API §4, api E5-T20 and E5-T22): with `fields`, each list item carries
 * its row id and the keys asked for, and every other key is absent (never `null` nor `false` in its
 * place). So the generated list item types mark every key but the row id optional.
 *
 * A screen that shows a fixed set of keys asks for them with `listFields` and reads the answer
 * through `itemsWith`, which types those keys as present and refuses an item that lacks one: an
 * absent key is never read as a value.
 */

/** A list item asked with `fields`: the keys in `Key` are present. */
export type ListItemWith<Item, Key extends keyof Item> = Item & {
  [K in Key]-?: Exclude<Item[K], undefined>;
};

/** The `fields` parameter: the row id first, then each key once. */
export function listFields(keys: readonly string[], rowId = "id"): string {
  return [...new Set([rowId, ...keys])].join(",");
}

/**
 * The items of a list asked with `fields`, typed with `keys` present. `keys` are the keys the api
 * always sends once asked for; an optional key the item may not have (a family group, a plan) is
 * asked for but left out of `keys`. An item without one of `keys` breaks the contract: this throws,
 * and the screen shows its error state instead of reading the absent key.
 */
export function itemsWith<Item extends object, Key extends keyof Item & string>(
  items: readonly Item[],
  keys: readonly Key[],
): ListItemWith<Item, Key>[] {
  for (const item of items) {
    const missing = keys.find((key) => !(key in item));
    if (missing !== undefined) {
      throw new TypeError(`A list item lacks the key it was asked for: ${missing}`);
    }
  }
  return items as ListItemWith<Item, Key>[];
}
