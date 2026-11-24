/**
 * True only for plain objects. Arrays, class instances, `Date`, `Map`, and
 * similar values intentionally fall through to replacement semantics.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function mergeValues(english: unknown, locale: unknown): unknown {
  if (isPlainObject(english) && isPlainObject(locale)) {
    const merged: Record<string, unknown> = { ...english };
    for (const [key, localeValue] of Object.entries(locale)) {
      merged[key] = key in english ? mergeValues(english[key], localeValue) : localeValue;
    }
    return merged;
  }
  return locale;
}

/**
 * Deep-merges translated messages over their English counterparts.
 *
 * - locale values win, including arrays and primitives
 * - missing keys inherit from English
 * - only plain objects merge recursively; every other value is replaced
 * - `null`/`undefined` locale input yields the English tree
 * - inputs are never mutated
 */
export function withEnglishFallback<T>(english: T, locale: T): T {
  if (locale === null || locale === undefined) return english;
  return mergeValues(english, locale) as T;
}
