import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { analyse } from "../lib/engine";
import { DICTS, LANGS, t } from "../lib/i18n";
import { actionMessage, issueTitle, issueWhy, noteText, optionLabel, pickReason } from "../lib/present";
import { buildSample } from "../lib/sample";
import { DEFAULT_SETTINGS } from "../lib/types";

const names = (s: string) => [...new Set([...s.matchAll(/\{(\w+)#?\}/g)].map((m) => m[1]))].sort().join(",");

test("every language has every key with the same placeholders", () => {
  const keys = Object.keys(DICTS.en);
  for (const { code } of LANGS) {
    const dict = DICTS[code] as Record<string, string>;
    assert.deepEqual(Object.keys(dict).sort(), [...keys].sort(), `${code} has the same keys`);
    for (const k of keys) {
      assert.ok(dict[k].trim().length > 0, `${code}.${k} is not empty`);
      assert.equal(names(dict[k]), names((DICTS.en as Record<string, string>)[k]), `${code}.${k} placeholders`);
    }
  }
});

test("every reason code the engine can emit has a sentence", () => {
  const src = readFileSync(new URL("../lib/engine.ts", import.meta.url), "utf8");
  const codes = new Set([...src.matchAll(/code: (?:[^"\n]*\? )?"(\w+)"(?: : "(\w+)")?/g)].flatMap((m) => [m[1], m[2]].filter(Boolean)));
  assert.ok(codes.size > 25);
  for (const c of codes) assert.ok(`note.${c}` in DICTS.en, `note.${c} exists`);
});

test("every sentence renders fully in all five languages", () => {
  const data = buildSample("2026-10-09");
  const a = analyse(data, DEFAULT_SETTINGS, "2026-10-09");
  for (const { code } of LANGS) {
    for (const issue of a.issues) {
      const texts = [issueTitle(code, issue, data), issueWhy(code, issue), pickReason(code, issue), ...issue.causes.map((c) => noteText(code, c))];
      for (const o of issue.options) {
        texts.push(optionLabel(code, o, issue), ...o.notes.map((n) => noteText(code, n)), ...o.actions.map((x) => actionMessage(code, x, data)));
      }
      for (const s of texts) {
        assert.ok(s.length > 3, `${code}: text is present`);
        assert.ok(!/[{}]|undefined|NaN|Infinity/.test(s), `${code}: nothing left unfilled in "${s}"`);
      }
    }
  }
  assert.equal(t("en", "unit.day.one", { n: 1 }), "1 day");
});
