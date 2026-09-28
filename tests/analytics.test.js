import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  tokenize,
  prepare,
  analyze,
  phrases,
  contains,
  orders,
} from "../src/analytics.js";
test("Hebrew tokenization strips vowel marks and splits punctuation, preserving prefixes", () => {
  assert.deepEqual(tokenize("רַבִּי אוֹמֵר: וְהוּא־טָהוֹר."), [
    "רבי",
    "אומר",
    "והוא",
    "טהור",
  ]);
});
test("Search uses complete tokens and phrases, not substrings", () => {
  const t = tokenize("רַבִּי אומר הוא טהור");
  assert.ok(contains(t, "רבי אומר"));
  assert.ok(contains(t, "טָהוֹר"));
  assert.ok(!contains(t, "הור"));
  assert.ok(!contains(t, "רבי טהור"));
  assert.ok(!contains(t, ""));
});
test("Word totals, rare words, and phrases respect passage boundaries", () => {
  const b = prepare([
    { title: "Test", chapters: [["רבי אומר רבי", "אומר טהור"]] },
  ]);
  const a = analyze(b);
  assert.equal(a.total, 5);
  assert.equal(a.unique, 3);
  assert.equal(a.hapax, 1);
  assert.deepEqual(
    a.words.find((x) => x[0] === "רבי"),
    ["רבי", 2],
  );
  assert.equal(phrases(a.passages).find((x) => x[0] === "רבי אומר")[1], 1);
});
test("Downloaded corpus has 63 complete primary tractates across six orders", () => {
  const data = JSON.parse(
    readFileSync(new URL("../public/data/mishnah.json", import.meta.url)),
  );
  assert.equal(data.tractates.length, 63);
  assert.equal(new Set(data.tractates.map((t) => t.title)).size, 63);
  assert.deepEqual([...new Set(data.tractates.map((t) => t.order))], orders);
  for (const t of data.tractates) {
    assert.ok(t.chapters.length);
    for (const ch of t.chapters) {
      assert.ok(ch.length);
      for (const p of ch) assert.ok(tokenize(p).length);
    }
  }
  const stats = analyze(prepare(data.tractates));
  assert.equal(stats.chapters, 525);
  assert.equal(stats.passages.length, 4192);
  assert.equal(
    stats.total,
    stats.words.reduce((s, w) => s + w[1], 0),
  );
  console.log({ words: stats.total, unique: stats.unique, hapax: stats.hapax });
});
test("Source links handle Pirkei Avot without an extra Mishnah prefix", () => {
  const b = prepare([{ title: "Pirkei Avot", chapters: [["משה קבל תורה"]] }]);
  assert.equal(b[0].passages[0].url, "https://www.sefaria.org/Pirkei_Avot.1.1");
});

test('Hebrew punctuation separates tokens even without spaces',()=>{
 assert.deepEqual(tokenize('אמר׀רבי׃יהודה־אומר'),['אמר','רבי','יהודה','אומר']);
});
test('Search highlights the exact original vocalized words, including overlapping phrases',async()=>{
 const {matchingRanges}=await import('../src/analytics.js');
 const text='רַבִּי אוֹמֵר: רַבִּי טָהוֹר';
 assert.deepEqual(matchingRanges(text,'רבי אומר').map(([s,e])=>text.slice(s,e)),['רַבִּי אוֹמֵר']);
 assert.deepEqual(matchingRanges(text,'רבי').map(([s,e])=>text.slice(s,e)),['רַבִּי','רַבִּי']);
 assert.deepEqual(matchingRanges(text,'הור'),[]);
 assert.deepEqual(matchingRanges(text,'abc'),[]);
 assert.deepEqual(matchingRanges('א א א','א א'),[[0,5]]);
});
