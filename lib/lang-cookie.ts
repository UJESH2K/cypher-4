import { isLang, type Lang } from "./i18n";

// The reader's language lives in a plain cookie, so the server can render the
// sign-in screen and the desk in that language from the first byte.

export const LANG_COOKIE = "kd_lang";

export function langFrom(value: string | undefined | null): Lang {
  return isLang(value) ? value : "en";
}

/** Browser only. */
export function saveLang(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.lang = lang;
}
