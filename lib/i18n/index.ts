import { en, type Dict, type Key } from "./en";
import { hi } from "./hi";
import { kn } from "./kn";
import { ta } from "./ta";
import { te } from "./te";

export type { Key } from "./en";
export type Lang = "en" | "hi" | "kn" | "ta" | "te";

export const LANGS: { code: Lang; name: string; english: string; locale: string }[] = [
  { code: "en", name: "English", english: "English", locale: "en-IN" },
  { code: "hi", name: "हिन्दी", english: "Hindi", locale: "hi-IN" },
  { code: "kn", name: "ಕನ್ನಡ", english: "Kannada", locale: "kn-IN" },
  { code: "ta", name: "தமிழ்", english: "Tamil", locale: "ta-IN" },
  { code: "te", name: "తెలుగు", english: "Telugu", locale: "te-IN" },
];

export const DICTS: Record<Lang, Dict> = { en, hi, kn, ta, te };

export function isLang(x: unknown): x is Lang {
  return typeof x === "string" && x in DICTS;
}

export function langName(code: string): string {
  return LANGS.find((l) => l.code === code)?.name ?? "English";
}

export function localeOf(lang: Lang): string {
  return LANGS.find((l) => l.code === lang)?.locale ?? "en-IN";
}

/** A length of time. Rendered as "2 days" by {x}, or as the bare number by {x#}. */
export type Days = { days: number };
export const days = (n: number): Days => ({ days: n });
export type Vars = Record<string, string | number | Days>;

const nf = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Rupees with Indian digit grouping: ₹1,24,000. Digits stay Latin in every language. */
export function money(n: number): string {
  return `₹${nf0.format(Math.round(n))}`;
}
export function num(n: number): string {
  return nf.format(n);
}

function isDays(v: unknown): v is Days {
  return typeof v === "object" && v !== null && "days" in v;
}

export function t(lang: Lang, key: Key, vars: Vars = {}): string {
  const dict = DICTS[lang] ?? en;
  const tpl = dict[key] ?? en[key] ?? key;
  return tpl.replace(/\{(\w+)(#?)\}/g, (_m, name: string, raw: string) => {
    const v = vars[name];
    if (v === undefined) return "";
    if (isDays(v)) {
      if (raw) return num(v.days);
      const unitKey: Key = v.days === 1 ? "unit.day.one" : "unit.day.other";
      return (dict[unitKey] ?? en[unitKey]).replace("{n}", num(v.days));
    }
    return typeof v === "number" ? num(v) : v;
  });
}

const PLACES: Record<string, Partial<Record<Lang, string>>> = {
  Gokak: { hi: "गोकाक", kn: "ಗೋಕಾಕ", ta: "கோகாக்", te: "గోకాక్" },
  Belgaum: { hi: "बेलगाम", kn: "ಬೆಳಗಾವಿ", ta: "பெல்காம்", te: "బెల్గాం" },
  Dharwad: { hi: "धारवाड़", kn: "ಧಾರವಾಡ", ta: "தார்வாட்", te: "ధార్వాడ్" },
  Gadag: { hi: "गदग", kn: "ಗದಗ", ta: "கதக்", te: "గదగ్" },
  Vijayapura: { hi: "विजयपुरा", kn: "ವಿಜಯಪುರ", ta: "விஜயபுரா", te: "విజయపుర" },
  Haveri: { hi: "हावेरी", kn: "ಹಾವೇರಿ", ta: "ஹாவேரி", te: "హావేరి" },
  "Hubli Warehouse": { hi: "हुबली गोदाम", kn: "ಹುಬ್ಬಳ್ಳಿ ಗೋದಾಮು", ta: "ஹூப்ளி கிடங்கு", te: "హుబ్లీ గోదాం" },
  "Bagalkot Warehouse": { hi: "बागलकोट गोदाम", kn: "ಬಾಗಲಕೋಟೆ ಗೋದಾಮು", ta: "பாகல்கோட் கிடங்கு", te: "బాగల్‌కోట్ గోదాం" },
};

/** Place names in the reader's script. Unknown places (imported data) are shown as typed. */
export function place(lang: Lang, name: string): string {
  return PLACES[name]?.[lang] ?? name;
}
