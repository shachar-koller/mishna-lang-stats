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
export function phrases(passages) {
  const counts = new Map();
  for (const p of passages)
    for (let i = 0; i < p.tokens.length - 1; i++) {
      const key = p.tokens.slice(i, i + 2).join(" ");
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
