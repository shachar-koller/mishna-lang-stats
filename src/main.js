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
  occurrences,
  collocates,
  chapterHits,
  diversity,
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
  overview: "Words",
  words: "Words",
  tractates: "Compare",
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
  bookStats,
  orderStats = [],
  orderWordMaps = [],
  fontScale = 1;
let lastFocus, toastTimer;
const FONT_KEY = "mishnah-font-scale";
try {
  const saved = Number(localStorage.getItem(FONT_KEY));
  if (saved >= 0.85 && saved <= 1.35) fontScale = saved;
} catch { /* private mode */ }

function option(value, label, selected) {
  return `<option value="${esc(value)}" ${String(value) === String(selected) ? "selected" : ""}>${esc(label)}</option>`;
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
  if (state.word.trim()) {
    const q = tokenize(state.word).join(" ");
    list = q ? list.filter(([w]) => w.includes(q)) : [];
  }
  return list;
}
function applyFont() {
  document.documentElement.style.setProperty("--he-scale", String(fontScale));
  const label = $("#font-val");
  if (label) label.textContent = `${Math.round(fontScale * 100)}%`;
}
function setFont(scale) {
  fontScale = Math.min(1.35, Math.max(0.85, Math.round(scale * 100) / 100));
  try { localStorage.setItem(FONT_KEY, String(fontScale)); } catch { /* private mode */ }
  applyFont();
}
// Jump to a word: clear the text filter when it would hide the target,
// move to the page containing it, and select it.
function jumpToWord(word) {
  let list = currentWords();
  let index = list.findIndex(([w]) => w === word);
  if (index < 0 && state.word) {
    state.word = "";
    list = currentWords();
    index = list.findIndex(([w]) => w === word);
  }
  go({ word: state.word, entry: word, page: Math.max(0, Math.floor(index / 20)) }, { focus: null });
}
// Six-order distribution for the shown rows. Single words read precomputed
// maps; phrases share one pass over the corpus instead of N × 6 scans.
function rowDists(shown) {
  if (state.mode !== "phrases") return shown.map(([w]) => orderWordMaps.map(map => map.get(w) || 0));
  const qs = shown.map(([w]) => tokenize(w));
  const counts = shown.map(() => orders.map(() => 0));
  orderStats.forEach(({ stats }, oi) => {
    for (const p of stats.passages) {
      for (let wi = 0; wi < qs.length; wi++) {
        const q = qs[wi];
        for (let i = 0; i <= p.tokens.length - q.length; i++) {
          let ok = true;
          for (let j = 0; j < q.length; j++) {
            if (p.tokens[i + j] !== q[j]) { ok = false; break; }
          }
          if (ok) { counts[wi][oi]++; break; }
        }
      }
    }
  });
  return counts;
}
function distBar(dist) {
  const max = Math.max(1, ...dist);
  return `<span class="dist" aria-hidden="true" title="${orders.map((o, i) => `${o}: ${fmt(dist[i])}`).join(" · ")}">${dist.map(n => `<i style="height:${Math.max(8, Math.round(n / max * 100))}%"></i>`).join("")}</span>`;
}
function coverageNote(list) {
  if (!list.length || !stats.total) return "";
  const top = list.slice(0, Math.min(20, list.length)).reduce((s, [, n]) => s + n, 0);
  return `<p class="list-note">Top ${Math.min(20, list.length)} cover ${(top / stats.total * 100).toFixed(1)}% of ${fmt(stats.total)} words · ${fmt(stats.hapax)} used once</p>`;
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
    const selected = a.dataset.view === state.view || (a.dataset.view === "overview" && state.view === "words");
    a.setAttribute("aria-current", selected ? "page" : "false");
    a.href = stateURL({ ...state, view: a.dataset.view, page: 0 });
  });
  document.querySelectorAll("#library-tree a").forEach(link => {
    const destination = readState(new URL(link.href).search, books);
    link.href = stateURL({ ...state, order: destination.order, tractate: destination.tractate, chapter: 0, page: 0, entry: "" });
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
  if (["order", "tractate", "mode", "hide", "word", "page"].some(key => key in changes)) changes = { entry: "", ...changes };
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
    if (!res.ok) throw Error("The local corpus file could not be loaded. Reload to try again.");
    corpus = await res.json();
    books = prepare(corpus.tractates);
    bookStats = new Map(books.map(b => [b.title, analyze([b])]));
    orderStats = orders.map(order => ({ order, stats: analyze(books.filter(b => b.order === order)) }));
    orderWordMaps = orderStats.map(({ stats }) => new Map(stats.words));
    state = readState(location.search, books);
    shell();
    render();
    storeURL(true);
    window.addEventListener("popstate", () => {
      state = readState(location.search, books);
      $("#dialog").close();
      render();
    });
  } catch (error) {
    $("#app").innerHTML = `<main class="loading"><h1>The text could not be loaded</h1><p>${esc(error.message)}</p><button class="button" onclick="location.reload()">Reload</button></main>`;
  }
}
function shell() {
  $("#app").innerHTML = `<a class="skip-link" href="#content">Skip to content</a>
  <header class="app-header">
    <a class="brand" href="/" data-nav><span lang="he">משנה</span><strong>Mishnah Atlas</strong></a>
    <nav aria-label="Main navigation">${[["overview", "Words"], ["reader", "Reader"], ["tractates", "Compare"]].map(([view, label]) => `<a data-view="${view}" data-nav href="${stateURL({...defaults, view})}">${label}</a>`).join("")}</nav>
    <button id="method" class="text-button">About &amp; sources</button>
  </header>
  <div class="app-body">
    <aside class="library" id="library" aria-label="Text library">
      <div class="library-heading"><h2>Library</h2><span>63 tractates</span></div>
      <label class="sr-only" for="library-search">Find a tractate</label>
      <input id="library-search" type="search" placeholder="Find a tractate…" autocomplete="off">
      <div id="library-tree"></div>
      <p id="library-empty" class="library-empty" hidden>No matching tractates.</p>
      <div class="library-bottom"><button id="stats-toggle" class="text-button" aria-expanded="false" aria-controls="scope-stats">Selection statistics <span aria-hidden="true">+</span></button><div id="scope-stats" hidden></div>
      <div class="downloads"><a href="/data/mishnah.txt" download>Download text</a><a href="/data/mishnah.json" download>JSON</a></div></div>
    </aside>
    <main id="main">
      <div class="scope-bar"><button id="library-toggle" class="button" aria-expanded="false" aria-controls="library">Library</button><div class="scope-title"><h1 id="heading" tabindex="-1"></h1><span id="scope-count"></span></div><button id="reset-scope" class="text-button">Clear selection</button><button id="copy-link" class="text-button">Copy link</button></div>
      <section id="content" tabindex="-1"></section>
    </main>
  </div><dialog id="dialog" aria-labelledby="dialog-title"></dialog><div id="notice" role="status" aria-live="polite"></div>`;
  $("#method").onclick = method;
  $("#reset-scope").onclick = () => go({order: "", tractate: "", chapter: 0, page: 0});
  $("#copy-link").onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); notify("Link copied."); }
    catch { notify("Copy the address from your browser to share this view."); }
  };
  $("#library-toggle").onclick = () => {
    const open = $("#library-toggle").getAttribute("aria-expanded") !== "true";
    $("#library-toggle").setAttribute("aria-expanded", String(open));
    $(".app-body").classList.toggle("library-open", open);
    if (open) $("#library-search").focus();
  };
  $("#stats-toggle").onclick = () => {
    const open = $("#scope-stats").hidden;
    $("#scope-stats").hidden = !open;
    $("#stats-toggle").setAttribute("aria-expanded", String(open));
    $("#stats-toggle span").textContent = open ? "−" : "+";
  };
  $("#library-search").oninput = filterLibrary;
  $("#library").addEventListener("keydown", event => {
    if (event.key === "Escape" && $(".app-body").classList.contains("library-open")) {
      $(".app-body").classList.remove("library-open");
      $("#library-toggle").setAttribute("aria-expanded", "false");
      $("#library-toggle").focus();
    }
  });
  $("#dialog").addEventListener("close", () => lastFocus?.isConnected && lastFocus.focus({preventScroll: true}));
  document.addEventListener("keydown", event => {
    if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || $("#dialog")?.open;
      if (!typing) {
        event.preventDefault();
        $(state.view === "reader" ? "#text-search" : "#word-search")?.focus();
      }
    }
  });
  document.addEventListener("click", event => {
    const link = event.target.closest("a[data-nav]");
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    state = readState(new URL(link.href).search, books);
    $(".app-body").classList.remove("library-open");
    $("#library-toggle").setAttribute("aria-expanded", "false");
    $("#library-search").value = "";
    go({});
  });
}
function library() {
  const selectedBook = books.find(book => book.title === state.tractate);
  return `${urlLink(`<span>Whole Mishnah</span><span class="library-count">63</span>`, {order: "", tractate: "", chapter: 0, entry: ""}, `library-all ${!state.order && !state.tractate ? "selected" : ""}`)}
  ${orders.map((order, index) => {
    const group = books.filter(book => book.order === order);
    return `<details class="library-order" ${state.order === order || selectedBook?.order === order ? "open" : ""}>
      <summary><span>${order}</span><span lang="he" dir="rtl">${heOrders[index]}</span><span class="library-count">${group.length}</span></summary>
      <div class="library-books">${urlLink(`All of ${order}`, {order, tractate: "", chapter: 0, entry: ""}, `order-link ${state.order === order && !state.tractate ? "selected" : ""}`)}${group.map(book => urlLink(`<span>${esc(book.title)}</span><span lang="he" dir="rtl">${esc(book.heTitle)}</span>`, {order, tractate: book.title, chapter: 0, entry: ""}, `book-link ${state.tractate === book.title ? "selected" : ""}`)).join("")}</div>
    </details>`;
  }).join("")}`;
}
function filterLibrary() {
  const query = $("#library-search").value.trim().toLocaleLowerCase();
  const hebrewQuery = tokenize(query).join(" ");
  let matches = 0;
  document.querySelectorAll(".library-order").forEach(group => {
    let groupMatches = 0;
    group.querySelectorAll(".book-link").forEach(link => {
      const text = link.textContent.toLocaleLowerCase();
      const match = !query || text.includes(query) || (hebrewQuery && tokenize(text).join(" ").includes(hebrewQuery));
      link.hidden = !match;
      if (match) groupMatches++;
    });
    group.hidden = !groupMatches;
    group.querySelector(".order-link").hidden = Boolean(query);
    if (query) group.open = Boolean(groupMatches);
    else group.open = group.querySelector(".selected") !== null;
    matches += groupMatches;
  });
  $("#library-empty").hidden = matches > 0;
}
function scopeStatsHTML() {
  const perOrder = orders.map(order => ({
    order,
    n: stats.passages.filter(p => p.order === order).length,
  }));
  const maxOrder = Math.max(1, ...perOrder.map(o => o.n));
  const topForms = stats.words.filter(([w]) => !tokenize(w).some(t => stopWords.has(t))).slice(0, 5);
  return `<dl>${[["Tractates", scope.length], ["Chapters", stats.chapters], ["Passages", stats.passages.length], ["Words", stats.total], ["Distinct forms", stats.unique], ["Forms used once", stats.hapax], ["Words / passage", (stats.total / Math.max(1, stats.passages.length)).toFixed(1)], ["Diversity", (diversity(stats) * 100).toFixed(1) + "%"]].map(([name, count]) => `<div><dt>${name}</dt><dd>${typeof count === "number" ? fmt(count) : count}</dd></div>`).join("")}</dl>
  <div class="breakdown" aria-label="Passages by order">${perOrder.map(({ order, n }) => `<div><span>${order}</span><span class="frequency-bar" aria-hidden="true"><i style="width:${n / maxOrder * 100}%"></i></span><span>${fmt(n)}</span></div>`).join("")}</div>
  ${topForms.length ? `<p class="top-forms">Top forms: ${topForms.map(([w]) => `<button class="text-link" data-goto-word="${esc(w)}" lang="he" dir="rtl">${esc(w)}</button>`).join(" · ")}</p>` : ""}
  <p>Written forms, with prefixes attached.</p><div class="stats-actions"><button class="text-button" id="longest">Read the longest passage</button><button class="text-button" id="copy-stats">Copy summary</button></div>`;
}
function render() {
  updateScope();
  const wordView = state.view === "overview" || state.view === "words";
  document.title = `${wordView ? "Words" : names[state.view]} · ${scopeLabel()} — Mishnah Atlas`;
  $("#heading").textContent = state.tractate || state.order || "Whole Mishnah";
  $("#scope-count").textContent = `${fmt(stats.passages.length)} passages · ${fmt(stats.total)} words`;
  $("#reset-scope").hidden = !state.order && !state.tractate;
  $("#library-tree").innerHTML = library();
  document.querySelectorAll("#library-tree .selected").forEach(link => link.setAttribute("aria-current", "true"));
  filterLibrary();
  $("#scope-stats").innerHTML = scopeStatsHTML();
  $("#longest").onclick = () => {
    const passage = stats.passages.reduce((a, b) => a.tokens.length > b.tokens.length ? a : b);
    modal(passage.ref, `${passageHTML(passage)}<p class="modal-link">${urlLink("Open in reader →", {view: "reader", order: passage.order || "", tractate: passage.tract || "", chapter: passage.chapter, text: "", entry: ""})}</p>`);
  };
  const copyStats = $("#copy-stats");
  if (copyStats) copyStats.onclick = async () => {
    const top = stats.words[0] || ["—", 0];
    const text = `${scopeLabel()}: ${fmt(stats.passages.length)} passages, ${fmt(stats.total)} words, ${fmt(stats.unique)} forms, top form ${top[0]} (${fmt(top[1])})`;
    try { await navigator.clipboard.writeText(text); notify("Summary copied."); }
    catch { notify(text); }
  };
  document.querySelectorAll("[data-goto-word]").forEach(button => button.onclick = () => jumpToWord(button.dataset.gotoWord));
  updateNavigation();
  $("#content").className = wordView ? "word-view" : state.view === "reader" ? "reading-view" : "comparison-view";
  $("#content").innerHTML = wordView ? wordWorkspace() : state.view === "reader" ? reader() : tractates();
  bind();
  applyFont();
}
function wordWorkspace() {
  const list = currentWords();
  state.page = Math.min(state.page, Math.max(0, Math.ceil(list.length / 20) - 1));
  const entry = state.entry || list[state.page * 20]?.[0] || "";
  return `<div class="word-tools">
    <div class="word-search"><label for="word-search">${state.mode === "phrases" ? "Find a word pair" : "Find a word"}</label><div class="search-field"><svg class="search-icon" aria-hidden="true" width="15" height="15" viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="m13 13 4 4" stroke="currentColor" stroke-width="1.5"/></svg><input id="word-search" type="search" dir="auto" title="Shortcut: press / to search" placeholder="${state.mode === "phrases" ? "Two Hebrew words, e.g. רבי יהודה" : "Search Hebrew, e.g. שבת"}" value="${esc(state.word)}" autocomplete="off"><button id="clear-word" class="text-button" ${!state.word ? "hidden" : ""}>Clear</button></div></div>
    <div class="word-options"><div class="segmented" aria-label="Word list">${[["common", "Most frequent"], ["rare", "Least frequent"], ["phrases", "Word pairs"]].map(([mode, label]) => `<button id="mode-${mode}" data-mode="${mode}" aria-pressed="${state.mode === mode}">${label}</button>`).join("")}</div><label class="check-label" title="Excludes a documented list of particles and reporting words, including רבי and אומר."><input id="hide" type="checkbox" ${state.hide ? "checked" : ""}>Exclude common words</label></div>
  </div>
  <div class="word-workspace ${state.entry ? "entry-open" : ""}"><section class="word-index" aria-label="Word frequencies"><div id="word-results">${wordResults()}</div></section><section id="entry-panel" class="entry-panel" aria-label="Source passages" tabindex="-1">${entryDetail(entry)}</section></div>`;
}
function wordResults() {
  const list = currentWords(), count = 20;
  state.page = Math.min(state.page, Math.max(0, Math.ceil(list.length / count) - 1));
  const shown = list.slice(state.page * count, (state.page + 1) * count);
  const max = list.reduce((maximum, [, n]) => Math.max(maximum, n), 1);
  const entry = state.entry || shown[0]?.[0];
  const dists = rowDists(shown);
  return `<div class="list-heading" id="results-start" tabindex="-1"><h2>${fmt(list.length)} ${state.mode === "phrases" ? "word pairs" : "word forms"}</h2><div class="list-actions"><button class="text-button" id="random-word">Random</button><button class="text-button export">Export CSV</button></div></div>${coverageNote(list)}<div class="column-head"><span>Word</span><span>Occurrences</span></div>
  <div class="word-list" tabindex="0" aria-label="Word frequency results">${shown.map(([word, count], index) => `<button class="word-row ${entry === word ? "selected" : ""}" data-word="${esc(word)}" aria-pressed="${entry === word}" aria-controls="entry-panel" aria-label="${esc(word)}, ${fmt(count)} occurrences; show passages" title="${(count / Math.max(1, stats.total) * 100).toFixed(2)}% of selection"><span class="rank">${state.page * 20 + index + 1}</span><span class="he-word" dir="rtl" lang="he">${esc(word)}</span><span class="word-measure"><span class="frequency-count">${fmt(count)}</span><span class="frequency-bar" aria-hidden="true"><i style="width:${count / max * 100}%"></i></span>${distBar(dists[index])}</span><span class="row-arrow" aria-hidden="true">›</span></button>`).join("") || emptyState("No matching forms", "Try a shorter Hebrew spelling or choose a wider selection in the library.", "Clear search", "clear-query")}</div>${pagination(list.length, "words")}`;
}
function entryDetail(word) {
  if (!word) return `<div class="entry-empty"><h2>No word selected</h2><p>Matching words and their source passages will appear here.</p></div>`;
  const found = stats.passages.filter(passage => contains(passage.tokens, word));
  const { hits } = occurrences(stats.passages, word);
  const list = currentWords();
  const index = list.findIndex(([w]) => w === word);
  const prev = index > 0 ? list[index - 1][0] : null;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1][0] : null;
  const tracts = new Set(found.map(p => p.tract || p.ref.split(" ").slice(0, -1).join(" ")));
  const share = stats.total ? (hits / stats.total * 100) : 0;
  const perOrder = orders.map(order => ({ order, n: found.filter(p => p.order === order).length })).filter(o => o.n);
  const maxOrder = Math.max(1, ...perOrder.map(o => o.n));
  const co = collocates(stats.passages, word, 5);
  const chipRow = (label, items) => items.length ? `<p class="co-row"><span>${label}:</span> ${items.map(([w, n]) => `<button class="text-link" data-goto-word="${esc(w)}" lang="he" dir="rtl" title="${fmt(n)} times">${esc(w)}</button>`).join(" · ")}</p>` : "";
  return `<div class="entry-heading"><button class="text-button back-to-list" id="back-to-list">← Word list</button><div class="entry-title"><h2 lang="he" dir="rtl">${esc(word)}</h2><span>${fmt(hits)} occurrences in ${fmt(found.length)} passages · ${fmt(tracts.size)} tractates · ${share.toFixed(2)}% of selection</span></div><div class="entry-actions"><span>In ${esc(scopeLabel().replace(/^The /, "the "))}</span><span class="entry-nav">${prev ? `<button class="text-link" data-goto-word="${esc(prev)}" aria-label="Previous form ${esc(prev)}">← Prev</button>` : ""}${next ? `<button class="text-link" data-goto-word="${esc(next)}" aria-label="Next form ${esc(next)}">Next →</button>` : ""}<button class="text-link" id="copy-word">Copy</button>${urlLink("Open in reader ↗", {view: "reader", text: word, chapter: 0}, "text-link")}</span></div>
  ${perOrder.length > 1 ? `<div class="breakdown" aria-label="Passages by order">${perOrder.map(({ order, n }) => `${urlLink(`<span>${order}</span><span class="frequency-bar" aria-hidden="true"><i style="width:${n / maxOrder * 100}%"></i></span><span>${fmt(n)}</span>`, {order, tractate: "", chapter: 0}, "breakdown-row")}`).join("")}</div>` : ""}
  ${(co.beside.length || co.together.length) ? `<div class="cooc">${chipRow("Often beside", co.beside)}${chipRow("In the same passages", co.together)}</div>` : ""}</div>
  <div class="entry-passages">${found.slice(0, 8).map(passage => passageHTML(passage, word)).join("") || `<p class="empty">This form is not in the selected text. Choose another word from the list.</p>`}${found.length > 8 ? `<div class="more-passages"><p>Showing 8 of ${fmt(found.length)} passages</p>${urlLink("Read all matching passages →", {view: "reader", text: word, chapter: 0}, "button")}</div>` : ""}</div>`;
}
function emptyState(title, description, label, id) {
  return `<div class="empty"><h3>${title}</h3><p>${description}</p><button class="button" id="${id}">${label}</button></div>`;
}
function pagination(total, kind = "reader") {
  const pages = Math.max(1, Math.ceil(total / 20));
  return `<div class="pagination"><span>${total ? fmt(state.page * 20 + 1) : 0}–${fmt(Math.min((state.page + 1) * 20, total))} of ${fmt(total)}</span><div><button class="page-button" data-page="${state.page - 1}" ${state.page === 0 ? "disabled" : ""} aria-label="Previous ${kind} page">←</button><form id="page-jump"><label class="sr-only" for="page-number">Page number</label><input id="page-number" type="number" min="1" max="${pages}" value="${state.page + 1}" required aria-describedby="page-total"><span id="page-total">/ ${fmt(pages)}</span><button class="text-button">Go</button></form><button class="page-button" data-page="${state.page + 1}" ${state.page + 1 >= pages ? "disabled" : ""} aria-label="Next ${kind} page">→</button></div></div>`;
}
function tractateSortValue(sort, s) {
  if (sort === "average") return s.total / Math.max(1, s.passages.length);
  if (sort === "diversity") return diversity(s);
  if (sort === "name") return 0;
  return s[sort] ?? 0;
}
function tractates() {
  const rows = scope.map(t => ({t, s: bookStats.get(t.title)})).sort((a, b) => state.sort === "name" ? a.t.title.localeCompare(b.t.title) : tractateSortValue(state.sort, b.s) - tractateSortValue(state.sort, a.s));
  const max = Math.max(1, ...rows.map(row => row.s.total));
  const ordersInScope = orders.filter(order => !state.order || order === state.order);
  const orderRows = ordersInScope.map(order => {
    const group = scope.filter(b => b.order === order);
    const s = analyze(group);
    const top = s.words[0];
    return { order, group, s, top };
  });
  const showOrders = ordersInScope.length > 1;
  const arrow = (key) => state.sort === key ? (key === "name" ? " ▲" : " ▼") : "";
  const head = (key, label) => `<th scope="col" aria-sort="${state.sort === key ? (key === "name" ? "ascending" : "descending") : "none"}"><button class="sort-head" data-sort="${key}"> ${label}${arrow(key)}</button></th>`;
  return `<div class="view-heading"><div><h2>Compare tractates</h2><p>Length and vocabulary in ${esc(scopeLabel().replace(/^The /, "the "))}. Select a column heading to sort.</p></div><div class="view-actions"><label class="inline-label" for="sort">Sort by<select id="sort">${[["total", "Word count"], ["unique", "Distinct forms"], ["hapax", "Forms used once"], ["diversity", "Diversity"], ["average", "Average passage length"], ["name", "Name A–Z"]].map(([value, label]) => option(value, label, state.sort)).join("")}</select></label><button class="text-button" id="export-compare">Export CSV</button></div></div>
  ${showOrders ? `<h3 class="sub-heading">Orders (${orderRows.length})</h3><div class="table-scroll" tabindex="0" aria-label="Order comparison"><table class="comparison"><thead><tr><th scope="col">Order</th><th scope="col">Words</th><th scope="col">Distinct forms</th><th scope="col">Passages</th><th scope="col">Diversity</th><th scope="col">Top form</th></tr></thead><tbody>${orderRows.map(({ order, group, s, top }) => `<tr><th scope="row">${urlLink(esc(order), {view: "overview", order, tractate: "", chapter: 0, word: "", entry: ""})}<small>${group.length} tractates</small></th><td>${fmt(s.total)}<i style="width:${s.total / Math.max(1, Math.max(...orderRows.map(r => r.s.total))) * 100}%"></i></td><td>${fmt(s.unique)}</td><td>${fmt(s.passages.length)}</td><td>${(diversity(s) * 100).toFixed(1)}%</td><td lang="he" dir="rtl">${top ? `${urlLink(esc(top[0]), {view: "overview", order, tractate: "", word: "", entry: top[0]})} <small>${fmt(top[1])}</small>` : "—"}</td></tr>`).join("")}</tbody></table></div>` : ""}
  <h3 class="sub-heading">Tractates (${rows.length})</h3>
  <div class="table-scroll" tabindex="0" aria-label="Tractate comparison"><table class="comparison"><thead><tr><th scope="col">Tractate</th>${head("total", "Words")}${head("unique", "Distinct forms")}${head("hapax", "Used once")}${head("diversity", "Diversity")}<th scope="col">Passages</th>${head("average", "Words / passage")}<th scope="col"><span class="sr-only">Explore</span></th></tr></thead><tbody>${rows.map(({t, s}) => `<tr><th scope="row">${urlLink(esc(t.title), {view: "reader", order: t.order, tractate: t.title, chapter: 0, text: "", entry: ""})}<span lang="he" dir="rtl">${esc(t.heTitle)}</span><small>${esc(t.order)}</small></th><td>${fmt(s.total)}<i style="width:${s.total / max * 100}%"></i></td><td>${fmt(s.unique)}</td><td>${fmt(s.hapax)}</td><td>${(diversity(s) * 100).toFixed(1)}%</td><td>${fmt(s.passages.length)}</td><td>${(s.total / s.passages.length).toFixed(1)}</td><td>${urlLink("Words →", {view: "overview", order: t.order, tractate: t.title, chapter: 0, word: "", entry: ""})}</td></tr>`).join("")}</tbody></table></div>`;
}
function exportCompare() {
  const rows = scope.map(t => ({ t, s: bookStats.get(t.title) }));
  const head = "tractate,order,words,distinct,hapax,passages,avg_per_passage,diversity_pct\n";
  const body = rows.map(({ t, s }) => [t.title, t.order, s.total, s.unique, s.hapax, s.passages.length, (s.total / s.passages.length).toFixed(1), (diversity(s) * 100).toFixed(1)].map(v => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + head + body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `mishnah-compare-${state.order || "all"}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  notify(`Exported ${rows.length} tractates.`);
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
  const selected = books.find(book => book.title === state.tractate);
  const passages = stats.passages.filter(passage => !state.chapter || passage.chapter === state.chapter);
  const found = state.text.trim() ? passages.filter(passage => contains(passage.tokens, state.text)) : passages;
  state.page = Math.min(state.page, Math.max(0, Math.ceil(found.length / 20) - 1));
  const showPassages = Boolean(selected || state.text.trim());
  return `<div class="reader-toolbar"><form id="reader-form"><label for="text-search">Search passages</label><div class="search-field"><input id="text-search" type="search" dir="auto" title="Shortcut: press / to search" placeholder="Hebrew word or exact phrase…" value="${esc(state.text)}" autocomplete="off"><button class="button primary">Search</button>${state.text ? '<button type="button" class="text-button" id="clear-text">Clear</button>' : ""}</div></form>${selected ? `<div class="chapter-tools"><label for="chapter">Chapter<select id="chapter">${option(0, "All chapters", state.chapter)}${selected.chapters.map((_, i) => option(i + 1, i + 1, state.chapter)).join("")}</select></label><div><button class="page-button" data-chapter="${state.chapter - 1}" ${state.chapter <= 1 ? "disabled" : ""} aria-label="Previous chapter">←</button><button class="page-button" data-chapter="${state.chapter + 1}" ${!state.chapter || state.chapter >= selected.chapters.length ? "disabled" : ""} aria-label="Next chapter">→</button></div></div>` : ""}<div class="reader-font" role="group" aria-label="Text size"><button class="text-button" id="font-dec" aria-label="Decrease text size">A−</button><span id="font-val" aria-live="off">${Math.round(fontScale * 100)}%</span><button class="text-button" id="font-inc" aria-label="Increase text size">A+</button><button class="text-button" id="random-passage">Random</button></div></div>
  ${showPassages ? `<div class="reader-scroll"><div class="reader-document"><div class="results-summary" id="results-start" tabindex="-1" role="status"><h2>${selected ? esc(selected.title) : "Search results"}${state.chapter ? ` · Chapter ${state.chapter}` : ""}</h2><p>${fmt(found.length)} ${found.length === 1 ? "passage" : "passages"}${state.text ? ` matching <bdi lang="he">${esc(state.text)}</bdi>` : ""}</p>${selected && state.text.trim() ? chapterHistHTML(selected, passages) : ""}</div>${found.slice(state.page * 20, (state.page + 1) * 20).map(passage => passageHTML(passage, state.text)).join("") || emptyState("No passages found", "Try another Hebrew spelling or change the library selection.", "Clear search", "clear-query")}${pagination(found.length)}</div></div>` : `<div class="reader-start"><h2>Choose a tractate to read.</h2><p>Browse the library, or search for a Hebrew word or phrase above.</p><div class="reading-directory">${orders.filter(order => !state.order || order === state.order).map(order => `<section><h3>${order}<span lang="he" dir="rtl">${heOrders[orders.indexOf(order)]}</span></h3>${books.filter(book => book.order === order).map(book => urlLink(`<span>${esc(book.title)}</span><span lang="he" dir="rtl">${esc(book.heTitle)}</span>`, {tractate: book.title, order, chapter: 1, text: "", entry: ""})).join("")}</section>`).join("")}</div></div>`}`;
}
function chapterHistHTML(selected, passages) {
  const rows = chapterHits(passages, state.text);
  if (!rows.some(r => r.matched)) return "";
  const max = Math.max(1, ...rows.map(r => r.matched));
  return `<div class="chap-hist" aria-label="Matches by chapter">${rows.map(r => `<button data-goto-chapter="${r.chapter}" class="${state.chapter === r.chapter ? "selected" : ""}" ${!r.matched ? "disabled" : ""} title="Chapter ${r.chapter}: ${fmt(r.matched)} of ${fmt(r.total)} passages" aria-label="Chapter ${r.chapter}, ${fmt(r.matched)} matches"><i style="height:${Math.max(8, Math.round(r.matched / max * 100))}%"></i><span>${r.chapter}</span></button>`).join("")}</div>`;
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
function notify(message) {
  clearTimeout(toastTimer);
  $("#notice").textContent = message;
  $("#notice").classList.add("visible");
  toastTimer = setTimeout(() => $("#notice").classList.remove("visible"), 4000);
}
function exportWords() {
  const rows = currentWords();
  const url = URL.createObjectURL(
    new Blob(["\uFEFFword,count,share_pct\n" + rows.map(([w, n]) => `${w},${n},${(n / Math.max(1, stats.total) * 100).toFixed(3)}`).join("\n")], {
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
function bindGotoWords() {
  document.querySelectorAll("[data-goto-word]").forEach(button => {
    if (button.dataset.bound) return;
    button.dataset.bound = "1";
    button.onclick = () => jumpToWord(button.dataset.gotoWord);
  });
  document.querySelectorAll("[data-goto-chapter]").forEach(button => {
    if (button.dataset.bound) return;
    button.dataset.bound = "1";
    button.onclick = () => go({ chapter: Number(button.dataset.gotoChapter), page: 0 }, { focus: "results-start" });
  });
}
function bindResults() {
  document.querySelectorAll("[data-word]").forEach(button => button.onclick = () => {
    state.entry = button.dataset.word;
    document.querySelectorAll("[data-word]").forEach(row => {
      const selected = row.dataset.word === state.entry;
      row.classList.toggle("selected", selected);
      row.setAttribute("aria-pressed", String(selected));
    });
    $(".entry-panel").innerHTML = entryDetail(state.entry);
    $(".entry-panel").scrollTop = 0;
    $(".word-workspace").classList.add("entry-open");
    storeURL();
    bindBack();
    bindGotoWords();
    if (matchMedia("(max-width: 760px)").matches) $(".entry-panel").focus();
  });
  const wordList = $(".word-list");
  if (wordList && !wordList.dataset.keys) {
    wordList.dataset.keys = "1";
    wordList.addEventListener("keydown", event => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const rows = [...wordList.querySelectorAll("[data-word]")];
      const current = rows.indexOf(document.activeElement);
      const next = event.key === "ArrowDown" ? Math.min(rows.length - 1, current + 1) : Math.max(0, current - 1);
      if (rows[next]) {
        event.preventDefault();
        rows[next].focus();
      }
    });
  }
  bindGotoWords();
  const copyWord = $("#copy-word");
  if (copyWord) copyWord.onclick = async () => {
    try { await navigator.clipboard.writeText(state.entry); notify("Word copied."); }
    catch { notify(state.entry); }
  };
  const random = $("#random-word");
  if (random) random.onclick = () => {
    const list = currentWords();
    if (!list.length) return;
    jumpToWord(list[Math.floor(Math.random() * list.length)][0]);
  };
  document.querySelectorAll("[data-page]").forEach(button => button.onclick = () => go({page: Number(button.dataset.page)}, {focus: "results-start"}));
  const form = $("#page-jump");
  if (form) form.onsubmit = event => {
    event.preventDefault();
    if (form.reportValidity()) go({page: $("#page-number").valueAsNumber - 1}, {focus: "results-start"});
  };
  const clear = $("#clear-query");
  if (clear) clear.onclick = () => go({[state.view === "reader" ? "text" : "word"]: "", page: 0}, {focus: state.view === "reader" ? "text-search" : "word-search"});
  const exportButton = $(".export");
  if (exportButton) exportButton.onclick = exportWords;
}
function bindBack() {
  const back = $("#back-to-list");
  if (back) back.onclick = () => {
    const entry = state.entry;
    state.entry = "";
    $(".word-workspace").classList.remove("entry-open");
    storeURL();
    [...document.querySelectorAll("[data-word]")].find(button => button.dataset.word === entry)?.focus();
  };
}
function bind() {
  bindResults();
  bindBack();
  document.querySelectorAll("[data-mode]").forEach(button => button.onclick = () => go({mode: button.dataset.mode, page: 0}, {focus: button.id}));
  const hide = $("#hide");
  if (hide) hide.onchange = () => go({hide: hide.checked, page: 0}, {focus: "hide"});
  const search = $("#word-search");
  if (search) {
    search.oninput = () => {
      state.word = search.value;
      state.page = 0;
      state.entry = "";
      $("#word-results").innerHTML = wordResults();
      $(".entry-panel").innerHTML = entryDetail(currentWords()[0]?.[0] || "");
      $(".entry-panel").scrollTop = 0;
      $(".word-workspace").classList.remove("entry-open");
      $("#clear-word").hidden = !state.word;
      storeURL(true);
      bindResults();
      bindBack();
    };
    $("#clear-word").onclick = () => go({word: "", page: 0}, {focus: "word-search"});
  }
  const readerForm = $("#reader-form");
  if (readerForm) readerForm.onsubmit = event => {
    event.preventDefault();
    go({text: $("#text-search").value.trim(), page: 0}, {focus: "results-start"});
  };
  const clearText = $("#clear-text");
  if (clearText) clearText.onclick = () => go({text: "", page: 0}, {focus: "text-search"});
  const chapter = $("#chapter");
  if (chapter) chapter.onchange = () => go({chapter: Number(chapter.value), page: 0}, {focus: "chapter"});
  document.querySelectorAll("[data-chapter]").forEach(button => button.onclick = () => go({chapter: Number(button.dataset.chapter), page: 0}, {focus: "chapter"}));
  const sort = $("#sort");
  if (sort) sort.onchange = () => go({sort: sort.value}, {focus: "sort"});
  document.querySelectorAll("[data-sort]").forEach(button => button.onclick = () => go({sort: button.dataset.sort}, {focus: null}));
  const exportCompareButton = $("#export-compare");
  if (exportCompareButton) exportCompareButton.onclick = exportCompare;
  const fontInc = $("#font-inc");
  if (fontInc) fontInc.onclick = () => setFont(fontScale + 0.05);
  const fontDec = $("#font-dec");
  if (fontDec) fontDec.onclick = () => setFont(fontScale - 0.05);
  const randomPassage = $("#random-passage");
  if (randomPassage) randomPassage.onclick = () => {
    const pool = state.text.trim() ? stats.passages.filter(p => (!state.chapter || p.chapter === state.chapter) && contains(p.tokens, state.text)) : stats.passages.filter(p => !state.chapter || p.chapter === state.chapter);
    if (!pool.length) { notify("No passages in this selection."); return; }
    const passage = pool[Math.floor(Math.random() * pool.length)];
    modal(passage.ref, `${passageHTML(passage, state.text)}<p class="modal-link">${urlLink("Open in reader →", {view: "reader", order: passage.order || state.order, tractate: passage.tract || state.tractate, chapter: passage.chapter, text: state.text, entry: ""})}</p>`);
  };
}
function method() {
  modal(
    "How the text is counted",
    `<div class="method-copy"><p>These counts cover 63 Hebrew tractates of the Mishnah from Sefaria’s public export, without commentaries. The edition includes a few chapters the source supplies beyond the printed Mishnah, such as Avot 6 and Bikkurim 4, and the totals reflect that.</p><h3>Counting</h3><p>Vowel and cantillation marks are stripped before counting. A word is any run of Hebrew letters; punctuation and hyphens split words. Prefixes stay attached, so this counts written forms rather than roots or meanings. Phrases are adjacent word pairs inside one mishnah.</p><p>“Exclude common words” removes the particles and reporting words listed below from word lists and exports. The totals always describe the full selection.</p><details><summary>Excluded words</summary><p lang="he" dir="rtl">${[...stopWords].join(" · ")}</p></details><h3>Sources</h3><p>Source export ${new Date(corpus.exportDate).toLocaleDateString("en-GB")}, merged ${new Date(corpus.downloadedAt).toLocaleDateString("en-GB")}. <a href="/data/mishnah.json" download>Full JSON with attribution</a> · <a href="/data/mishnah.txt" download>Plain Hebrew text</a></p></div>`,
  );
}
init();
