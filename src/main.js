import "./style.css";
import {
  orders,
  stopWords,
  prepare,
  analyze,
  phrases,
  contains,
  tokenize,
  matchingRanges,
} from "./analytics.js";
import { defaults, readState, stateURL } from "./ui-state.js";
const $ = (selector) => document.querySelector(selector);
const fmt = (n) => n.toLocaleString("en-US");
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const names = {
  overview: "Overview",
  words: "Words",
  tractates: "Tractates",
  reader: "Reader",
};
const heOrders = ["זרעים", "מועד", "נשים", "נזיקין", "קדשים", "טהרות"];
let corpus,
  books,
  scope,
  stats,
  state = { ...defaults },
  cachedScope = "",
  cachedPhrases,
  bookStats;
let lastFocus, toastTimer;

function option(value, label, selected) {
  return `<option value="${esc(value)}" ${String(value) === String(selected) ? "selected" : ""}>${esc(label)}</option>`;
}
function action(label, attrs = "", className = "text-button") {
  return `<button class="${className}" ${attrs}>${label}</button>`;
}
function scopeLabel() {
  return state.tractate || state.order || "The whole Mishnah";
}
function urlLink(label, changes, className = "") {
  return `<a class="${className}" href="${esc(stateURL({ ...state, ...changes, page: 0 }))}" data-nav>${label}</a>`;
}
function getPhrases() {
  return (cachedPhrases ||= phrases(stats.passages));
}
function currentWords() {
  let list = state.mode === "phrases" ? [...getPhrases()] : [...stats.words];
  if (state.mode === "rare")
    list.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], "he"));
  if (state.hide)
    list = list.filter(([w]) => !tokenize(w).some((t) => stopWords.has(t)));
  if (state.view === "words" && state.word.trim()) {
    const q = tokenize(state.word).join(" ");
    list = q ? list.filter(([w]) => w.includes(q)) : [];
  }
  return list;
}
function updateScope() {
  const key = `${state.order}|${state.tractate}`;
  if (key === cachedScope && stats) return;
  scope = books.filter(
    (b) =>
      (!state.order || b.order === state.order) &&
      (!state.tractate || b.title === state.tractate),
  );
  stats = analyze(scope);
  cachedPhrases = null;
  cachedScope = key;
}
function updateNavigation() {
  document.querySelectorAll("[data-view]").forEach((a) => {
    const selected = a.dataset.view === state.view;
    a.setAttribute("aria-current", selected ? "page" : "false");
    a.href = stateURL({ ...state, view: a.dataset.view, page: 0 });
  });
}
function storeURL(replace = false) {
  updateNavigation();
  const url = stateURL(state);
  if (
    location.pathname + location.search !==
    (url.startsWith("?") ? "/" + url : url)
  )
    history[replace ? "replaceState" : "pushState"](null, "", url);
}
function go(changes, { focus = "heading", replace = false } = {}) {
  state = { ...state, ...changes };
  render();
  storeURL(replace);
  if (focus) {
    const el = document.getElementById(focus);
    el?.focus({ preventScroll: true });
    if (focus === "heading") window.scrollTo({ top: 0 });
    if (focus === "results-start") el?.scrollIntoView({ block: "start" });
  }
}
async function init() {
  try {
    const res = await fetch("/data/mishnah.json");
    if (!res.ok) throw Error("The local text file could not be loaded.");
    corpus = await res.json();
    books = prepare(corpus.tractates);
    bookStats = new Map(books.map((b) => [b.title, analyze([b])]));
    state = readState(location.search, books);
    shell();
    render();
    storeURL(true);
    window.addEventListener("popstate", () => {
      state = readState(location.search, books);
      $("#dialog").close();
      render();
    });
    } catch (e) {
    $("#app").innerHTML =
      `<main class="loading"><h1>The text could not be loaded</h1><p>${esc(e.message)}</p><button class="button" id="retry">Try again</button></main>`;
    $("#retry").onclick = () => location.reload();
  }
}
function shell() {
  $("#app").innerHTML =
    `<a class="skip-link" href="#content">Skip to content</a>
  <header class="site-header"><a class="brand" href="/" data-nav><span lang="he" class="brand-he">משנה</span><span>Mishnah Atlas</span></a><nav aria-label="Main navigation">${Object.entries(
    names,
  )
    .map(
      ([v, label]) =>
        `<a href="${stateURL({ ...defaults, view: v })}" data-view="${v}" data-nav>${label}</a>`,
    )
    .join(
      "",
    )}</nav><button class="text-button about" id="method">Method</button></header>
  <main id="main"><div class="page-heading"><div><h1 id="heading" tabindex="-1"></h1><p id="subtitle"></p></div><div class="scope-side"><p id="scope-count"></p><button class="button subtle" id="copy-link">Copy link</button></div></div>
    <div class="scope-toolbar"><div class="scope-fields"><label for="order">Order<select id="order" aria-label="Order">${option("", "All orders", "")}${orders.map((o) => option(o, o, "")).join("")}</select></label><label for="tractate">Tractate<select id="tractate" aria-label="Tractate"></select></label><button class="text-button" id="reset-scope">Reset</button></div></div>
  <section id="content" tabindex="-1"></section>
  <footer><span>Hebrew text via <a href="https://www.sefaria.org/texts/Mishnah" target="_blank" rel="noreferrer">Sefaria</a></span><div><a href="/data/mishnah.txt" download>Plain text</a><a href="/data/mishnah.json" download>JSON</a><button class="text-button" id="footer-method">Method &amp; sources</button></div></footer></main>
  <dialog id="dialog" aria-labelledby="dialog-title"></dialog><div id="notice" role="status" aria-live="polite"></div>`;
  $("#order").onchange = (e) =>
    go(
      { order: e.target.value, tractate: "", chapter: 0, page: 0 },
      { focus: "order" },
    );
  $("#tractate").onchange = (e) =>
    go(
      { tractate: e.target.value, chapter: 0, page: 0 },
      { focus: "tractate" },
    );
  $("#reset-scope").onclick = () =>
    go({ order: "", tractate: "", chapter: 0, page: 0 }, { focus: "order" });
  $("#method").onclick = method;
  $("#footer-method").onclick = method;
  $("#copy-link").onclick = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      notify("Link copied.");
    } catch {
      notify("Copy the URL to share.");
    }
  };
  $("#dialog").addEventListener(
    "close",
    () => lastFocus?.isConnected && lastFocus.focus({ preventScroll: true }),
  );
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-nav]");
    if (
      !a ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      e.button !== 0
    )
      return;
    e.preventDefault();
    state = readState(new URL(a.href).search, books);
    go({}, { focus: "heading" });
  });
}
function render() {
  updateScope();
  document.title = `${names[state.view]} · ${scopeLabel()} — Mishnah Atlas`;
  $("#heading").textContent = {
    overview: "The Hebrew Mishnah",
    words: "Word frequency",
    tractates: "Tractates",
    reader: "Reader",
  }[state.view];
  $("#subtitle").textContent = {
    overview:
      state.order || state.tractate
        ? `Totals and frequent forms in ${scopeLabel()}.`
        : "Word frequencies and source passages across all six orders.",
    words:
      "Common and rare Hebrew forms. Select a row to see its passages.",
    tractates: "Length and vocabulary, tractate by tractate.",
    reader: "Search the Hebrew text, or browse by tractate and chapter.",
  }[state.view];
  $("#order").value = state.order;
  $("#tractate").innerHTML =
    option("", "All tractates", state.tractate) +
    books
      .filter((t) => !state.order || t.order === state.order)
      .map((t) => option(t.title, `${t.title} · ${t.heTitle}`, state.tractate))
      .join("");
  $("#reset-scope").hidden = !state.order && !state.tractate;
  $("#scope-count").textContent =
    `${scope.length} ${scope.length === 1 ? "tractate" : "tractates"} · ${fmt(stats.passages.length)} mishnayot`;
  updateNavigation();
  $("#content").innerHTML =
    state.view === "overview"
      ? overview()
      : state.view === "words"
        ? wordPanel(true)
        : state.view === "tractates"
          ? tractates()
          : reader();
  bind();
}
function overview() {
  const longest = stats.passages.reduce((a, b) =>
    a.tokens.length > b.tokens.length ? a : b,
  );
  return `<div class="overview-grid">${wordPanel(false)}<aside class="corpus-panel" aria-label="Corpus statistics"><h2>In this selection</h2><dl class="metrics">${[
    ["Total words", fmt(stats.total), `${fmt(stats.passages.length)} mishnayot`],
    ["Distinct forms", fmt(stats.unique), "Prefixes kept attached"],
    [
      "Used only once",
      fmt(stats.hapax),
      `${((stats.hapax / stats.unique) * 100).toFixed(1)}% of distinct forms`,
    ],
    [
      "Words per mishnah",
      (stats.total / stats.passages.length).toFixed(1),
      "Mean passage length",
    ],
  ]
    .map(
      ([label, n, note]) =>
        `<div><dt>${label}</dt><dd>${n}<small>${note}</small></dd></div>`,
    )
    .join("")}</dl>
  <section class="order-panel"><div class="section-head"><div><h2>${state.order || state.tractate ? "This selection" : "Orders"}</h2></div></div>${orderChart()}
  <div class="reading-note"><span class="note-label">Longest passage</span><button data-passage="${esc(longest.ref)}" class="passage-link">${esc(longest.ref)}</button><p>${fmt(longest.tokens.length)} words</p></div>
  </section></aside></div>`;
}
function orderChart() {
  return `<div class="order-chart">${orders
    .filter((o) => scope.some((t) => t.order === o))
    .map((o) => {
      const total = scope
          .filter((t) => t.order === o)
          .reduce((sum, t) => sum + bookStats.get(t.title).total, 0),
        percent = (total / stats.total) * 100;
      return urlLink(
        `<div class="order-name"><strong>${o}</strong><span lang="he" dir="rtl">${heOrders[orders.indexOf(o)]}</span><small>${percent.toFixed(1)}%</small></div><div class="order-bar"><span style="width:${percent}%"></span></div><span class="order-total">${fmt(total)} words</span>`,
        { order: o, tractate: "", chapter: 0 },
        "order-item",
      );
    })
    .join("")}</div>`;
}
function wordPanel(full) {
  return `<section class="word-panel"><div class="section-head"><div><h2>${full ? "Results" : "Word frequency"}</h2></div><button class="text-button export">Export CSV</button></div>
  <div class="word-controls"><div class="segmented" aria-label="Frequency view">${[
    ["common", "Common"],
    ["rare", "Rare"],
    ["phrases", "Phrases"],
  ]
    .map(
      ([m, l]) =>
        `<button id="mode-${m}" data-mode="${m}" aria-pressed="${state.mode === m}">${l}</button>`,
    )
    .join(
      "",
    )}</div><label class="check-label"><input id="hide" type="checkbox" ${state.hide ? "checked" : ""}>Hide particles</label></div>
  ${full ? `<div class="word-search"><label for="word-search">Filter the list</label><div class="input-wrap"><input id="word-search" dir="auto" placeholder="e.g. שבת" value="${esc(state.word)}" autocomplete="off"><button id="clear-word" class="text-button" ${!state.word ? "hidden" : ""}>Clear</button></div></div>` : ""}
  <div id="word-results">${wordResults(full)}</div></section>`;
}
function wordResults(full) {
  const list = currentWords(),
    count = full ? 20 : 12;
  if (full)
    state.page = Math.min(
      state.page,
      Math.max(0, Math.ceil(list.length / count) - 1),
    );
  const page = full ? state.page : 0,
    max = list.reduce((max, [, count]) => Math.max(max, count), 1),
    shown = list.slice(page * count, (page + 1) * count);
  return `<div class="table-caption" id="results-start" tabindex="-1"><span>${full ? `${fmt(list.length)} ${state.mode === "phrases" ? "phrases" : "forms"}` : ({ common: "Most frequent forms", rare: "Least frequent forms", phrases: "Most frequent pairs" }[state.mode])}</span><span>Occurrences</span></div>
  <div class="word-list">${shown.map(([w, n], i) => `<button class="word-row" data-word="${esc(w)}" aria-label="${esc(w)}, ${fmt(n)} ${n === 1 ? "occurrence" : "occurrences"}; read passages"><span class="rank">${page * count + i + 1}</span><span class="he-word" lang="he" dir="rtl">${esc(w)}</span><span class="frequency-bar" aria-hidden="true"><span style="width:${Math.max(1, (n / max) * 100)}%"></span></span><span class="frequency-count">${fmt(n)}</span></button>`).join("") || emptyState("No matching words", "Try a shorter spelling, or widen the order and tractate filters.", "Clear search", "clear-query")}</div>
  ${full ? pagination(list.length, count) : `<div class="panel-bottom">${urlLink(`Browse all ${fmt(list.length)} forms`, { view: "words", word: "" })}</div>`}`;
}
function emptyState(title, description, label, id) {
  return `<div class="empty"><h3>${title}</h3><p>${description}</p>${action(label, `id="${id}"`, "button")}</div>`;
}
function pagination(total, count = 20) {
  const pages = Math.max(1, Math.ceil(total / count));
  return `<div class="pagination"><span>${total ? fmt(state.page * count + 1) : 0}–${fmt(Math.min((state.page + 1) * count, total))} of ${fmt(total)}</span><div>${action("← Prev", `data-page="${state.page - 1}" ${state.page === 0 ? "disabled" : ""}`, "button")}${pages > 1 ? `<form id="page-jump" class="page-jump"><label for="page-number">Page</label><input id="page-number" name="page" type="number" inputmode="numeric" min="1" max="${pages}" step="1" required value="${state.page + 1}" aria-describedby="page-total"><span id="page-total">of ${fmt(pages)}</span><button class="button" type="submit">Go</button></form>` : ""}${action("Next →", `data-page="${state.page + 1}" ${state.page + 1 >= pages ? "disabled" : ""}`, "button")}</div></div>`;
}
function tractates() {
  const rows = scope
    .map((t) => ({ t, s: bookStats.get(t.title) }))
    .sort((a, b) =>
      state.sort === "name"
        ? a.t.title.localeCompare(b.t.title)
        : state.sort === "average"
          ? b.s.total / b.s.passages.length - a.s.total / a.s.passages.length
          : b.s[state.sort] - a.s[state.sort],
    );
  const max = Math.max(...rows.map((r) => r.s.total));
  return `<div class="section-head comparison-head"><p>${scope.length} ${scope.length === 1 ? "tractate" : "tractates"}</p><label class="inline-label" for="sort">Sort by <select id="sort" aria-label="Sort by">${[
    ["total", "Most words"],
    ["unique", "Most forms"],
    ["average", "Longest passages"],
    ["name", "Name A–Z"],
  ]
    .map(([v, l]) => option(v, l, state.sort))
    .join("")}</select></label></div>
  <div class="table-scroll" tabindex="0" aria-label="Tractate comparison table"><table class="comparison"><thead><tr><th scope="col">Tractate</th><th scope="col">Words</th><th scope="col">Forms</th><th scope="col">Mishnayot</th><th scope="col">Per mishnah</th></tr></thead><tbody>${rows.map(({ t, s }) => `<tr><th scope="row">${urlLink(esc(t.title), { view: "overview", tractate: t.title, chapter: 0 })}<small>${esc(t.order)} · <span lang="he" dir="rtl">${esc(t.heTitle)}</span></small></th><td><span>${fmt(s.total)}</span><i style="width:${(s.total / max) * 100}%"></i></td><td>${fmt(s.unique)}</td><td>${fmt(s.passages.length)}</td><td>${(s.total / s.passages.length).toFixed(1)}</td></tr>`).join("")}</tbody></table></div>`;
}
function highlighted(text, query) {
  const ranges = matchingRanges(text, query);
  let cursor = 0,
    html = "";
  for (const [start, end] of ranges) {
    html +=
      esc(text.slice(cursor, start)) +
      `<mark>${esc(text.slice(start, end))}</mark>`;
    cursor = end;
  }
  return html + esc(text.slice(cursor));
}
function passageHTML(p, query = "") {
  return `<article class="passage"><div class="passage-meta"><h3>${esc(p.ref)}</h3><a href="${esc(p.url)}" target="_blank" rel="noreferrer">Sefaria</a></div><p class="he-text" lang="he" dir="rtl">${highlighted(p.text, query)}</p><span class="passage-count">${p.tokens.length} words</span></article>`;
}
function reader() {
  const selected = books.find((t) => t.title === state.tractate);
  const passages = stats.passages.filter(
    (p) => !state.chapter || p.chapter === state.chapter,
  );
  const found = state.text.trim()
    ? passages.filter((p) => contains(p.tokens, state.text))
    : passages;
  state.page = Math.min(
    state.page,
    Math.max(0, Math.ceil(found.length / 20) - 1),
  );
  return `<section class="reader-panel"><form id="reader-form" class="reader-search"><label for="text-search">Search the Hebrew text</label><div class="search-line"><input id="text-search" dir="auto" placeholder="e.g. רבי יהודה" value="${esc(state.text)}" autocomplete="off"><button class="button primary">Search</button>${state.text ? '<button type="button" class="button" id="clear-text">Clear</button>' : ""}</div></form>
   <div class="reader-tools">${selected ? `<label class="inline-label" for="chapter">Chapter <select id="chapter" aria-label="Chapter">${option(0, "All chapters", state.chapter)}${selected.chapters.map((_, i) => option(i + 1, `Chapter ${i + 1}`, state.chapter)).join("")}</select></label>${state.chapter ? `<div class="chapter-nav">${action("← Prev", `data-chapter="${state.chapter - 1}" ${state.chapter === 1 ? "disabled" : ""}`, "button")}${action("Next →", `data-chapter="${state.chapter + 1}" ${state.chapter === selected.chapters.length ? "disabled" : ""}`, "button")}</div>` : ""}` : "<span>Choose a tractate above to filter by chapter.</span>"}</div>
  <div class="reader-results" id="results-start" tabindex="-1"><p class="results-summary" role="status">${fmt(found.length)} ${found.length === 1 ? "passage" : "passages"}${state.text ? ` matching <bdi lang="he">“${esc(state.text)}”</bdi>` : ""}${state.chapter ? ` · chapter ${state.chapter}` : ""}</p>${
    found
      .slice(state.page * 20, (state.page + 1) * 20)
      .map((p) => passageHTML(p, state.text))
      .join("") ||
    emptyState(
      "No passages found",
      "Try a different spelling, or widen the order and tractate filters.",
      "Clear search",
      "clear-query",
    )
  }</div>${pagination(found.length)}</section>`;
}
function modal(title, body) {
  lastFocus = document.activeElement;
  const d = $("#dialog");
  d.innerHTML = `<div class="modal-head"><h2 id="dialog-title">${esc(title)}</h2><button class="button" id="close" autofocus>Close</button></div>${body}`;
  d.showModal();
  d.scrollTop = 0;
  $("#close").onclick = () => d.close();
  d.onclick = (e) => {
    if (e.target === d) {
      const rect = d.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      )
        d.close();
    }
  };
}
function wordDetail(word) {
  const found = stats.passages.filter((p) => contains(p.tokens, word));
  const occurrences = found.reduce((sum, p) => {
    const q = tokenize(word);
    return (
      sum +
      p.tokens.reduce(
        (n, _, i) => n + Number(q.every((w, j) => p.tokens[i + j] === w)),
        0,
      )
    );
  }, 0);
  modal(
    word,
    `<div class="detail-intro"><p>${fmt(occurrences)} ${occurrences === 1 ? "mention" : "mentions"} · ${fmt(found.length)} ${found.length === 1 ? "passage" : "passages"}<br><span>${esc(scopeLabel())}</span></p>${action("Show all passages", 'id="open-results"', "button primary")}</div>${found.length > 5 ? `<p class="detail-note">Showing the first 5.</p>` : ""}${found
      .slice(0, 5)
      .map((p) => passageHTML(p, word))
      .join("")}`,
  );
  $("#open-results").onclick = () => {
    $("#dialog").close();
    go({ view: "reader", text: word, chapter: 0, page: 0 });
  };
}
function notify(message) {
  clearTimeout(toastTimer);
  $("#notice").textContent = message;
  $("#notice").classList.add("visible");
  toastTimer = setTimeout(() => $("#notice").classList.remove("visible"), 4000);
}
function exportWords() {
  const rows = currentWords();
  const url = URL.createObjectURL(
    new Blob(["\uFEFFword,count\n" + rows.map((r) => r.join(",")).join("\n")], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `mishnah-${state.tractate || state.order || "all"}-${state.mode}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  notify(`Exported ${fmt(rows.length)} ${state.mode === "phrases" ? "phrases" : "forms"}.`);
}
function bindResults() {
  const pageJump = $("#page-jump");
  if (pageJump)
    pageJump.onsubmit = (e) => {
      e.preventDefault();
      if (!pageJump.reportValidity()) return;
      go(
        { page: $("#page-number").valueAsNumber - 1 },
        { focus: "results-start" },
      );
    };
  document
    .querySelectorAll("[data-word]")
    .forEach((b) => (b.onclick = () => wordDetail(b.dataset.word)));
  document
    .querySelectorAll("[data-page]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          go({ page: Number(b.dataset.page) }, { focus: "results-start" })),
    );
  const clear = $("#clear-query");
  if (clear)
    clear.onclick = () =>
      go(
        { [state.view === "reader" ? "text" : "word"]: "", page: 0 },
        { focus: state.view === "reader" ? "text-search" : "word-search" },
      );
}
function bind() {
  bindResults();
  document
    .querySelectorAll("[data-mode]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          go({ mode: b.dataset.mode, page: 0 }, { focus: b.id })),
    );
  const hide = $("#hide");
  if (hide)
    hide.onchange = () =>
      go({ hide: hide.checked, page: 0 }, { focus: "hide" });
  const ws = $("#word-search");
  if (ws) {
    ws.oninput = () => {
      state.word = ws.value;
      state.page = 0;
      $("#word-results").innerHTML = wordResults(true);
      $("#clear-word").hidden = !state.word;
      storeURL(true);
      bindResults();
    };
    $("#clear-word").onclick = () =>
      go({ word: "", page: 0 }, { focus: "word-search" });
  }
  const form = $("#reader-form");
  if (form)
    form.onsubmit = (e) => {
      e.preventDefault();
      go(
        { text: $("#text-search").value.trim(), page: 0 },
        { focus: "results-start" },
      );
    };
  const clearText = $("#clear-text");
  if (clearText)
    clearText.onclick = () =>
      go({ text: "", page: 0 }, { focus: "text-search" });
  const chapter = $("#chapter");
  if (chapter)
    chapter.onchange = () =>
      go({ chapter: Number(chapter.value), page: 0 }, { focus: "chapter" });
  document
    .querySelectorAll("[data-chapter]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          go(
            { chapter: Number(b.dataset.chapter), page: 0 },
            { focus: "chapter" },
          )),
    );
  const sort = $("#sort");
  if (sort) sort.onchange = () => go({ sort: sort.value }, { focus: "sort" });
  document.querySelectorAll("[data-passage]").forEach(
    (b) =>
      (b.onclick = () => {
        const p = stats.passages.find((p) => p.ref === b.dataset.passage);
        modal(p.ref, passageHTML(p));
      }),
  );
  const ex = $(".export");
  if (ex) ex.onclick = exportWords;
  const note = $("#counting-note");
  if (note) note.onclick = method;
}
function method() {
  modal(
    "How the text is counted",
    `<div class="method-copy"><p>These counts cover 63 Hebrew tractates of the Mishnah from Sefaria’s public export, without commentaries. The edition includes a few chapters the source supplies beyond the printed Mishnah, such as Avot 6 and Bikkurim 4, and the totals reflect that.</p><h3>Counting</h3><p>Vowel and cantillation marks are stripped before counting. A word is any run of Hebrew letters; punctuation and hyphens split words. Prefixes stay attached, so this counts written forms rather than roots or meanings. Phrases are adjacent word pairs inside one mishnah.</p><p>“Hide particles” removes a short list of frequent function words from the word lists. The totals always describe the full selection.</p><details><summary>Excluded particles</summary><p lang="he" dir="rtl">${[...stopWords].join(" · ")}</p></details><h3>Sources</h3><p>Source export ${new Date(corpus.exportDate).toLocaleDateString("en-GB")}, merged ${new Date(corpus.downloadedAt).toLocaleDateString("en-GB")}. <a href="/data/mishnah.json" download>Full JSON with attribution</a> · <a href="/data/mishnah.txt" download>Plain Hebrew text</a></p></div>`,
  );
}
init();
