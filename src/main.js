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
  reader: "Read & search",
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
  return (
    state.tractate ||
    (state.order ? `Seder ${state.order}` : "The complete Mishnah")
  );
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
      `<main class="loading"><h1>Couldn’t load the Mishnah</h1><p>${esc(e.message)}</p><button class="button" id="retry">Try again</button></main>`;
    $("#retry").onclick = () => location.reload();
  }
}
function shell() {
  $("#app").innerHTML =
    `<a class="skip-link" href="#content">Skip to content</a>
 <header class="site-header"><a class="brand" href="/" data-nav><span lang="he" class="brand-he">משנה</span><span>Mishnah <em>Atlas</em></span></a><nav aria-label="Main navigation">${Object.entries(
   names,
 )
   .map(
     ([v, label]) =>
       `<a href="${stateURL({ ...defaults, view: v })}" data-view="${v}" data-nav>${label}</a>`,
   )
   .join(
     "",
   )}</nav><button class="text-button about" id="method">About the text</button></header>
 <main id="main"><div class="page-heading"><div><p class="kicker" id="scope-label"></p><h1 id="heading" tabindex="-1"></h1><p id="subtitle"></p></div><button class="button subtle" id="copy-link">Copy link <span aria-hidden="true">↗</span></button></div>
   <div class="scope-toolbar"><div class="scope-fields"><label for="order">Order<select id="order" aria-label="Order">${option("", "All six orders", "")}${orders.map((o) => option(o, o, "")).join("")}</select></label><label for="tractate">Tractate<select id="tractate" aria-label="Tractate"></select></label><button class="text-button" id="reset-scope">Reset filters</button></div><p id="scope-count"></p></div>
 <section id="content" tabindex="-1"></section>
 <footer><span>Hebrew text from <a href="https://www.sefaria.org/texts/Mishnah" target="_blank" rel="noreferrer">Sefaria ↗</a></span><div><a href="/data/mishnah.txt" download>Download full text ↓</a><button class="text-button" id="footer-method">Sources & counting</button></div></footer></main>
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
      notify("Link copied. It includes your current filters.");
    } catch {
      notify("Copy the address in your browser to share this view.");
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
  $("#scope-label").textContent = scopeLabel();
  $("#heading").textContent = {
    overview: "The Mishnah, by the numbers.",
    words: "Word frequencies",
    tractates: "Compare tractates",
    reader: "Read the Mishnah",
  }[state.view];
  $("#subtitle").textContent = {
    overview: "Word counts, recurring phrases, and the passages behind them.",
    words:
      "Find common and rare Hebrew word forms. Select any result to see it in the text.",
    tractates:
      "Compare length and vocabulary. Select a tractate to examine its words.",
    reader:
      "Search a Hebrew word or phrase, or select a tractate and chapter to read.",
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
  return `<dl class="metrics">${[
    ["Words", fmt(stats.total), `${fmt(stats.passages.length)} mishnayot`],
    [
      "Distinct forms",
      fmt(stats.unique),
      "Prefixes and inflections kept intact",
    ],
    [
      "Used only once",
      fmt(stats.hapax),
      `${((stats.hapax / stats.unique) * 100).toFixed(1)}% of distinct forms`,
    ],
    [
      "Words per mishnah",
      (stats.total / stats.passages.length).toFixed(1),
      "Average passage length",
    ],
  ]
    .map(
      ([label, n, note]) =>
        `<div><dt>${label}</dt><dd>${n}</dd><p>${note}</p></div>`,
    )
    .join("")}</dl>
 <div class="overview-grid">${wordPanel(false)}<section class="order-panel"><div class="section-head"><div><h2>${state.order || state.tractate ? "Within this selection" : "The six orders"}</h2><p>Share of all words in your selection</p></div></div>${orderChart()}
 <div class="reading-note"><span class="kicker">Longest passage</span><button data-passage="${esc(longest.ref)}">${esc(longest.ref)} <span aria-hidden="true">↗</span></button><p>${fmt(longest.tokens.length)} words · Read the passage</p></div>
 </section></div>
 <div class="under-note"><p>Counts ignore vowel marks. Different spellings and prefixes remain separate.</p><button class="text-button" id="counting-note">How words are counted ↗</button></div>`;
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
        `<div class="order-name"><strong>${o}</strong><span lang="he" dir="rtl">${heOrders[orders.indexOf(o)]}</span><small>${percent.toFixed(1)}%</small></div><div class="order-bar"><span style="width:${percent}%"></span></div><span class="order-total">${fmt(total)} words <span aria-hidden="true">→</span></span>`,
        { order: o, tractate: "", chapter: 0 },
        "order-item",
      );
    })
    .join("")}</div>`;
}
function wordPanel(full) {
  return `<section class="word-panel"><div class="section-head"><div><h2>${full ? "Results" : "Word frequency"}</h2><p>${full ? "Word forms, without vowel marks" : "Select a word to read its source passages"}</p></div><button class="text-button export">Export CSV ↓</button></div>
 <div class="word-controls"><div class="segmented" aria-label="Frequency view">${[
   ["common", "Most common"],
   ["rare", "Least common"],
   ["phrases", "Phrases"],
 ]
   .map(
     ([m, l]) =>
       `<button id="mode-${m}" data-mode="${m}" aria-pressed="${state.mode === m}">${l}</button>`,
   )
   .join(
     "",
   )}</div><label class="check-label"><input id="hide" type="checkbox" ${state.hide ? "checked" : ""}>Hide common particles</label></div>
 ${full ? `<div class="word-search"><label for="word-search">Filter results</label><div class="input-wrap"><input id="word-search" dir="auto" placeholder="Type a Hebrew word…" value="${esc(state.word)}" autocomplete="off"><button id="clear-word" class="text-button" ${!state.word ? "hidden" : ""}>Clear</button></div></div>` : ""}
 <div id="word-results">${wordResults(full)}</div></section>`;
}
function wordResults(full) {
  const list = currentWords(),
    count = full ? 20 : 8;
  if (full)
    state.page = Math.min(
      state.page,
      Math.max(0, Math.ceil(list.length / count) - 1),
    );
  const page = full ? state.page : 0,
    max = list.reduce((max, [, count]) => Math.max(max, count), 1),
    shown = list.slice(page * count, (page + 1) * count);
  return `<div class="table-caption" id="results-start" tabindex="-1"><span>${full ? `${fmt(list.length)} ${state.mode === "phrases" ? "phrases" : "word forms"}` : "Word"}</span><span>Occurrences</span></div>
 <div class="word-list">${shown.map(([w, n], i) => `<button class="word-row" data-word="${esc(w)}" aria-label="${esc(w)}, ${fmt(n)} ${n === 1 ? "occurrence" : "occurrences"}; read passages"><span class="rank">${page * count + i + 1}</span><span class="he-word" lang="he" dir="rtl">${esc(w)}</span><span class="frequency-bar" aria-hidden="true"><span style="width:${Math.max(1, (n / max) * 100)}%"></span></span><span class="frequency-count">${fmt(n)}</span><span class="row-arrow" aria-hidden="true">↗</span></button>`).join("") || emptyState("No matching words", tokenize(state.word).length ? "Try a shorter spelling, include common particles, or change your filters." : "Enter Hebrew letters to filter the word list.", "Clear word search", "clear-query")}</div>
 ${state.mode === "rare" ? '<p class="list-note">Ties are sorted alphabetically. A count of 1 means the word appears once in this selection.</p>' : ""}
 ${full ? pagination(list.length, count) : `<div class="panel-bottom">${urlLink(`Browse ${fmt(list.length)} ${state.mode === "phrases" ? "phrases" : "word forms"} →`, { view: "words", word: "" })}</div>`}`;
}
function emptyState(title, description, label, id) {
  return `<div class="empty"><h3>${title}</h3><p>${description}</p>${action(label, `id="${id}"`, "button")}</div>`;
}
function pagination(total, count = 20) {
  const pages = Math.max(1, Math.ceil(total / count));
  return `<div class="pagination"><span>${total ? fmt(state.page * count + 1) : 0}–${fmt(Math.min((state.page + 1) * count, total))} of ${fmt(total)}</span><div>${action("← Previous", `data-page="${state.page - 1}" ${state.page === 0 ? "disabled" : ""}`, "button")}${pages > 1 ? `<form id="page-jump" class="page-jump"><label for="page-number">Page</label><input id="page-number" name="page" type="number" inputmode="numeric" min="1" max="${pages}" step="1" required value="${state.page + 1}" aria-describedby="page-total"><span id="page-total">of ${fmt(pages)}</span><button class="button" type="submit">Go</button></form>` : "<span>Page 1 of 1</span>"}${action("Next →", `data-page="${state.page + 1}" ${state.page + 1 >= pages ? "disabled" : ""}`, "button")}</div></div>`;
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
  return `<div class="section-head comparison-head"><p>${scope.length} ${scope.length === 1 ? "tractate" : "tractates"} in this selection</p><label class="inline-label" for="sort">Sort by <select id="sort" aria-label="Sort by">${[
    ["total", "Most words"],
    ["unique", "Largest vocabulary"],
    ["average", "Longest average passage"],
    ["name", "Name (A–Z)"],
  ]
    .map(([v, l]) => option(v, l, state.sort))
    .join("")}</select></label></div>
 <p class="table-hint">Scroll the table horizontally to compare all columns →</p><div class="table-scroll" tabindex="0" aria-label="Tractate comparison table"><table class="comparison"><thead><tr><th scope="col">Tractate</th><th scope="col">Words</th><th scope="col">Distinct forms</th><th scope="col">Mishnayot</th><th scope="col">Words / mishnah</th></tr></thead><tbody>${rows.map(({ t, s }) => `<tr><th scope="row">${urlLink(`${esc(t.title)} <span aria-hidden="true">↗</span>`, { view: "overview", tractate: t.title, chapter: 0 })}<small>${esc(t.order)} <span lang="he" dir="rtl">${esc(t.heTitle)}</span></small></th><td><span>${fmt(s.total)}</span><i style="width:${(s.total / max) * 100}%"></i></td><td>${fmt(s.unique)}</td><td>${fmt(s.passages.length)}</td><td>${(s.total / s.passages.length).toFixed(1)}</td></tr>`).join("")}</tbody></table></div><p class="list-note">“Distinct forms” counts written words, including their prefixes and inflections.</p>`;
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
  return `<article class="passage"><div class="passage-meta"><h3>${esc(p.ref)}</h3><a href="${esc(p.url)}" target="_blank" rel="noreferrer" aria-label="Read ${esc(p.ref)} on Sefaria">Sefaria ↗</a></div><p class="he-text" lang="he" dir="rtl">${highlighted(p.text, query)}</p><span class="passage-count">${p.tokens.length} words</span></article>`;
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
  return `<section class="reader-panel"><form id="reader-form" class="reader-search"><label for="text-search">Search the Hebrew text</label><div class="search-line"><input id="text-search" dir="auto" placeholder="A word or phrase, e.g. רבי יהודה" value="${esc(state.text)}" autocomplete="off"><button class="button primary">Search</button>${state.text ? '<button type="button" class="button" id="clear-text">Clear</button>' : ""}</div><p>Whole words and exact phrases. Vowel marks are ignored.</p></form>
   <div class="reader-tools">${selected ? `<label class="inline-label" for="chapter">Chapter<select id="chapter" aria-label="Chapter">${option(0, "All chapters", state.chapter)}${selected.chapters.map((_, i) => option(i + 1, `Chapter ${i + 1}`, state.chapter)).join("")}</select></label>${state.chapter ? `<div class="chapter-nav">${action("← Previous chapter", `data-chapter="${state.chapter - 1}" ${state.chapter === 1 ? "disabled" : ""}`, "button")}${action("Next chapter →", `data-chapter="${state.chapter + 1}" ${state.chapter === selected.chapters.length ? "disabled" : ""}`, "button")}</div>` : ""}` : "<span>Select a tractate above to browse by chapter.</span>"}</div>
 <div class="reader-results" id="results-start" tabindex="-1"><p class="results-summary" role="status">${fmt(found.length)} ${found.length === 1 ? "passage" : "passages"}${state.text ? ` matching <bdi lang="he">“${esc(state.text)}”</bdi>` : ""}${state.chapter ? ` · Chapter ${state.chapter}` : ""}</p>${
   found
     .slice(state.page * 20, (state.page + 1) * 20)
     .map((p) => passageHTML(p, state.text))
     .join("") ||
   emptyState(
     "No passages found",
     tokenize(state.text).length
       ? "Try a different spelling or phrase, or reset the order and tractate filters."
       : "Enter Hebrew letters. For example: מאימתי",
     "Clear search",
     "clear-query",
   )
 }</div>${pagination(found.length)}</section>`;
}
function modal(title, body) {
  lastFocus = document.activeElement;
  const d = $("#dialog");
  d.innerHTML = `<div class="modal-head"><h2 id="dialog-title">${esc(title)}</h2><button class="button" id="close" autofocus>Close <span aria-hidden="true">×</span></button></div>${body}`;
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
    `<div class="detail-intro"><p>${fmt(occurrences)} occurrences in ${fmt(found.length)} passages<br><span>${esc(scopeLabel())}</span></p>${action("View all passages →", 'id="open-results"', "button primary")}</div><p class="list-note">${found.length > 5 ? "First 5 passages. Open all results to continue." : "All matching passages."}</p>${found
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
  notify(
    `Exported ${fmt(rows.length)} ${state.mode === "phrases" ? "phrases" : "word forms"}.`,
  );
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
    "The text behind the numbers",
    `<div class="method-copy"><h3>One complete corpus</h3><p>All 63 primary Hebrew tractates of the Mishnah from <a href="https://github.com/Sefaria/Sefaria-Export" target="_blank" rel="noreferrer">Sefaria’s public export</a>. Commentary collections are excluded. The merged edition includes additional chapters supplied by the source, such as Avot 6 and Bikkurim 4; counts reflect this edition.</p><h3>How we count</h3><p>HTML, footnotes, vowels, and cantillation marks are removed for counting. A word is a consecutive sequence of Hebrew letters א–ת. Punctuation and hyphens separate words. Prefixes remain attached; inflections and final letter forms are not combined. This measures word forms, not roots or meanings. Phrase counts are adjacent pairs within a mishnah.</p><p>The “Hide common particles” switch excludes a small, explicit list of frequent function words and reporting expressions from word lists only. Summary totals always describe the full selected text.</p><details><summary>See the excluded words</summary><p lang="he" dir="rtl">${[...stopWords].join(" · ")}</p></details><h3>Sources and reuse</h3><p>Downloaded ${new Date(corpus.downloadedAt).toLocaleDateString("en-GB")}; source export ${new Date(corpus.exportDate).toLocaleDateString("en-GB")}. Raw source files and version attribution are preserved in the download. Merged source files do not declare a single license; consult the underlying editions and <a href="https://www.sefaria.org/terms" target="_blank" rel="noreferrer">Sefaria’s terms</a> for reuse.</p><p><a href="/data/mishnah.json" download>Download complete JSON with source attribution ↗</a></p><p><a href="/data/mishnah.txt" download>Download full Hebrew text ↗</a></p></div>`,
  );
}
init();
