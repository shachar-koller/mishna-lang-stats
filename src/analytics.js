export const orders = [
  "Zeraim",
  "Moed",
  "Nashim",
  "Nezikin",
  "Kodashim",
  "Tahorot",
];
export const stopWords = new Set(
  "את ואת של על ועל לא ולא כל וכל אם ואם או אין ואין מן הוא היא זה זו הן הם רבי אמר אומר אומרים לו לה בה בו בין עד אחד אחת היו היה אינו אלא אבל".split(
    " ",
  ),
);
export function tokenize(text) {
  return (
    text
      .normalize("NFD")
      .replace(/[\u0591-\u05BD\u05BF\u05C1-\u05C2\u05C4-\u05C5\u05C7]/g, "")
      .match(/[א-ת]+/g) || []
  );
}
export function prepare(tractates) {
  return tractates.map((t) => ({
    ...t,
    passages: t.chapters.flatMap((ch, c) =>
      ch.map((text, m) => ({
        text,
        ref: `${t.title} ${c + 1}:${m + 1}`,
        chapter: c + 1,
        order: t.order,
        tract: t.title,
        url: `https://www.sefaria.org/${(t.sourceTitle || (t.title === "Pirkei Avot" ? t.title : "Mishnah " + t.title)).replaceAll(" ", "_")}.${c + 1}.${m + 1}`,
        tokens: tokenize(text),
      })),
    ),
  }));
}
export function analyze(tractates) {
  const passages = tractates.flatMap((t) => t.passages),
    frequencies = new Map();
  for (const p of passages)
    for (const w of p.tokens) frequencies.set(w, (frequencies.get(w) || 0) + 1);
  const words = [...frequencies].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "he"),
  );
  return {
    passages,
    words,
    total: words.reduce((s, w) => s + w[1], 0),
    unique: words.length,
    hapax: words.filter((w) => w[1] === 1).length,
    chapters: tractates.reduce((s, t) => s + t.chapters.length, 0),
  };
}
export function phrases(passages, n = 2) {
  const counts = new Map();
  for (const p of passages)
    for (let i = 0; i <= p.tokens.length - n; i++) {
      const key = p.tokens.slice(i, i + n).join(" ");
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  return [...counts].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "he"),
  );
}
export function contains(tokens, query) {
  const q = tokenize(query);
  return (
    q.length > 0 &&
    tokens.some((_, i) => q.every((w, j) => tokens[i + j] === w))
  );
}

// Total token hits plus the number of passages containing the query.
export function occurrences(passages, query) {
  const q = tokenize(query);
  if (!q.length) return { hits: 0, passages: 0 };
  let hits = 0,
    passagesWith = 0;
  for (const p of passages) {
    let found = 0;
    for (let i = 0; i <= p.tokens.length - q.length; i++) {
      if (q.every((w, j) => p.tokens[i + j] === w)) found++;
    }
    if (found) {
      hits += found;
      passagesWith++;
    }
  }
  return { hits, passages: passagesWith };
}

// Words appearing immediately before / after the query, plus content words
// sharing its passages. Before/after keep particles (e.g. רבי → אומר is
// meaningful); the shared-passage list drops stopwords and query tokens.
export function collocates(passages, query, limit = 5) {
  const q = tokenize(query);
  if (!q.length) return { before: [], after: [], beside: [], together: [] };
  const inQuery = new Set(q);
  const before = new Map(),
    after = new Map(),
    together = new Map();
  const bump = (map, w) => map.set(w, (map.get(w) || 0) + 1);
  for (const p of passages) {
    let matched = false;
    for (let i = 0; i <= p.tokens.length - q.length; i++) {
      if (!q.every((w, j) => p.tokens[i + j] === w)) continue;
      matched = true;
      if (i > 0 && !inQuery.has(p.tokens[i - 1])) bump(before, p.tokens[i - 1]);
      const next = p.tokens[i + q.length];
      if (next !== undefined && !inQuery.has(next)) bump(after, next);
    }
    if (matched) {
      for (const w of new Set(p.tokens)) {
        if (!inQuery.has(w) && !stopWords.has(w)) bump(together, w);
      }
    }
  }
  const rank = (map) =>
    [...map]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "he"))
      .slice(0, limit);
  const beside = new Map();
  for (const [w, n] of [...before, ...after])
    beside.set(w, (beside.get(w) || 0) + n);
  return { before: rank(before), after: rank(after), beside: rank(beside), together: rank(together) };
}

// Matching-passage counts per chapter for one tractate's passages.
export function chapterHits(passages, query) {
  const chapters = new Map();
  for (const p of passages) {
    if (!chapters.has(p.chapter)) chapters.set(p.chapter, { chapter: p.chapter, total: 0, matched: 0 });
    const row = chapters.get(p.chapter);
    row.total++;
    if (contains(p.tokens, query)) row.matched++;
  }
  return [...chapters.values()].sort((a, b) => a.chapter - b.chapter);
}

export function diversity(stats) {
  return stats.total ? stats.unique / stats.total : 0;
}

// Return ranges in the original vocalized text, so matches can be highlighted
// without changing the source text or treating its content as HTML.
export function matchingRanges(text, query) {
  const q = tokenize(query);
  if (!q.length) return [];
  const words = [
    ...text.matchAll(
      /[א-ת][א-ת\u0591-\u05BD\u05BF\u05C1-\u05C2\u05C4-\u05C5\u05C7]*/gu,
    ),
  ];
  const ranges = [];
  for (let i = 0; i <= words.length - q.length; i++) {
    if (q.every((word, j) => tokenize(words[i + j][0])[0] === word)) {
      const start = words[i].index,
        last = words[i + q.length - 1],
        end = last.index + last[0].length;
      if (ranges.length && start <= ranges.at(-1)[1]) ranges.at(-1)[1] = end;
      else ranges.push([start, end]);
    }
  }
  return ranges;
}
