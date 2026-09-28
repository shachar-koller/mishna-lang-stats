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
  bookStats;
let lastFocus, toastTimer;

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
  $("#scope-stats").innerHTML = `<dl>${[["Tractates", scope.length], ["Chapters", stats.chapters], ["Passages", stats.passages.length], ["Words", stats.total], ["Distinct forms", stats.unique], ["Forms used once", stats.hapax]].map(([name, count]) => `<div><dt>${name}</dt><dd>${fmt(count)}</dd></div>`).join("")}</dl><p>Written forms, with prefixes attached.</p><button class="text-button" id="longest">Read the longest passage</button>`;
  $("#longest").onclick = () => {
    const passage = stats.passages.reduce((a, b) => a.tokens.length > b.tokens.length ? a : b);
    modal(passage.ref, passageHTML(passage));
  };
  updateNavigation();
  $("#content").className = wordView ? "word-view" : state.view === "reader" ? "reading-view" : "comparison-view";
  $("#content").innerHTML = wordView ? wordWorkspace() : state.view === "reader" ? reader() : tractates();
  bind();
}
function wordWorkspace() {
  const list = currentWords();
  state.page = Math.min(state.page, Math.max(0, Math.ceil(list.length / 20) - 1));
  const entry = state.entry || list[state.page * 20]?.[0] || "";
  return `<div class="word-tools">
    <div class="word-search"><label for="word-search">${state.mode === "phrases" ? "Find a word pair" : "Find a word"}</label><div class="search-field"><svg class="search-icon" aria-hidden="true" width="15" height="15" viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="m13 13 4 4" stroke="currentColor" stroke-width="1.5"/></svg><input id="word-search" type="search" dir="auto" placeholder="${state.mode === "phrases" ? "Two Hebrew words, e.g. רבי יהודה" : "Search Hebrew, e.g. שבת"}" value="${esc(state.word)}" autocomplete="off"><button id="clear-word" class="text-button" ${!state.word ? "hidden" : ""}>Clear</button></div></div>
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
  return `<div class="list-heading" id="results-start" tabindex="-1"><h2>${fmt(list.length)} ${state.mode === "phrases" ? "word pairs" : "word forms"}</h2><button class="text-button export">Export CSV</button></div><div class="column-head"><span>Word</span><span>Occurrences</span></div>
  <div class="word-list" tabindex="0" aria-label="Word frequency results">${shown.map(([word, count], index) => `<button class="word-row ${entry === word ? "selected" : ""}" data-word="${esc(word)}" aria-pressed="${entry === word}" aria-controls="entry-panel" aria-label="${esc(word)}, ${fmt(count)} occurrences; show passages"><span class="rank">${state.page * 20 + index + 1}</span><span class="he-word" dir="rtl" lang="he">${esc(word)}</span><span class="word-measure"><span class="frequency-count">${fmt(count)}</span><span class="frequency-bar" aria-hidden="true"><i style="width:${count / max * 100}%"></i></span></span><span class="row-arrow" aria-hidden="true">›</span></button>`).join("") || emptyState("No matching forms", "Try a shorter Hebrew spelling or choose a wider selection in the library.", "Clear search", "clear-query")}</div>${pagination(list.length, "words")}`;
}
function entryDetail(word) {
  if (!word) return `<div class="entry-empty"><h2>No word selected</h2><p>Matching words and their source passages will appear here.</p></div>`;
  const found = stats.passages.filter(passage => contains(passage.tokens, word));
  const query = tokenize(word);
  const count = found.reduce((sum, passage) => sum + passage.tokens.reduce((n, _, i) => n + Number(query.every((token, j) => passage.tokens[i + j] === token)), 0), 0);
  return `<div class="entry-heading"><button class="text-button back-to-list" id="back-to-list">← Word list</button><div class="entry-title"><h2 lang="he" dir="rtl">${esc(word)}</h2><span>${fmt(count)} occurrences in ${fmt(found.length)} passages</span></div><div class="entry-actions"><span>In ${esc(scopeLabel().replace(/^The /, "the "))}</span>${urlLink("Open in reader ↗", {view: "reader", text: word, chapter: 0}, "text-link")}</div></div>
  <div class="entry-passages">${found.slice(0, 8).map(passage => passageHTML(passage, word)).join("") || `<p class="empty">This form is not in the selected text. Choose another word from the list.</p>`}${found.length > 8 ? `<div class="more-passages"><p>Showing 8 of ${fmt(found.length)} passages</p>${urlLink("Read all matching passages →", {view: "reader", text: word, chapter: 0}, "button")}</div>` : ""}</div>`;
}
function emptyState(title, description, label, id) {
  return `<div class="empty"><h3>${title}</h3><p>${description}</p><button class="button" id="${id}">${label}</button></div>`;
}
function pagination(total, kind = "reader") {
  const pages = Math.max(1, Math.ceil(total / 20));
  return `<div class="pagination"><span>${total ? fmt(state.page * 20 + 1) : 0}–${fmt(Math.min((state.page + 1) * 20, total))} of ${fmt(total)}</span><div><button class="page-button" data-page="${state.page - 1}" ${state.page === 0 ? "disabled" : ""} aria-label="Previous ${kind} page">←</button><form id="page-jump"><label class="sr-only" for="page-number">Page number</label><input id="page-number" type="number" min="1" max="${pages}" value="${state.page + 1}" required aria-describedby="page-total"><span id="page-total">/ ${fmt(pages)}</span><button class="text-button">Go</button></form><button class="page-button" data-page="${state.page + 1}" ${state.page + 1 >= pages ? "disabled" : ""} aria-label="Next ${kind} page">→</button></div></div>`;
}
function tractates() {
  const rows = scope.map(t => ({t, s: bookStats.get(t.title)})).sort((a, b) => state.sort === "name" ? a.t.title.localeCompare(b.t.title) : state.sort === "average" ? b.s.total / b.s.passages.length - a.s.total / a.s.passages.length : b.s[state.sort] - a.s[state.sort]);
  const max = Math.max(...rows.map(row => row.s.total));
  return `<div class="view-heading"><div><h2>Compare tractates</h2><p>Length and vocabulary in ${esc(scopeLabel().replace(/^The /, "the "))}.</p></div><label class="inline-label" for="sort">Sort by<select id="sort">${[["total", "Word count"], ["unique", "Distinct forms"], ["average", "Average passage length"], ["name", "Name A–Z"]].map(([value, label]) => option(value, label, state.sort)).join("")}</select></label></div>
  <div class="table-scroll" tabindex="0" aria-label="Tractate comparison"><table class="comparison"><thead><tr><th scope="col">Tractate</th><th scope="col">Words</th><th scope="col">Distinct forms</th><th scope="col">Passages</th><th scope="col">Words / passage</th><th scope="col"><span class="sr-only">Explore</span></th></tr></thead><tbody>${rows.map(({t, s}) => `<tr><th scope="row">${urlLink(esc(t.title), {view: "reader", order: t.order, tractate: t.title, chapter: 0, text: "", entry: ""})}<span lang="he" dir="rtl">${esc(t.heTitle)}</span><small>${esc(t.order)}</small></th><td>${fmt(s.total)}<i style="width:${s.total / max * 100}%"></i></td><td>${fmt(s.unique)}</td><td>${fmt(s.passages.length)}</td><td>${(s.total / s.passages.length).toFixed(1)}</td><td>${urlLink("Words →", {view: "overview", order: t.order, tractate: t.title, chapter: 0, word: "", entry: ""})}</td></tr>`).join("")}</tbody></table></div>`;
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
  return `<div class="reader-toolbar"><form id="reader-form"><label for="text-search">Search passages</label><div class="search-field"><input id="text-search" type="search" dir="auto" placeholder="Hebrew word or exact phrase…" value="${esc(state.text)}" autocomplete="off"><button class="button primary">Search</button>${state.text ? '<button type="button" class="text-button" id="clear-text">Clear</button>' : ""}</div></form>${selected ? `<div class="chapter-tools"><label for="chapter">Chapter<select id="chapter">${option(0, "All chapters", state.chapter)}${selected.chapters.map((_, i) => option(i + 1, i + 1, state.chapter)).join("")}</select></label><div><button class="page-button" data-chapter="${state.chapter - 1}" ${state.chapter <= 1 ? "disabled" : ""} aria-label="Previous chapter">←</button><button class="page-button" data-chapter="${state.chapter + 1}" ${!state.chapter || state.chapter >= selected.chapters.length ? "disabled" : ""} aria-label="Next chapter">→</button></div></div>` : ""}</div>
  ${showPassages ? `<div class="reader-scroll"><div class="reader-document"><div class="results-summary" id="results-start" tabindex="-1" role="status"><h2>${selected ? esc(selected.title) : "Search results"}${state.chapter ? ` · Chapter ${state.chapter}` : ""}</h2><p>${fmt(found.length)} ${found.length === 1 ? "passage" : "passages"}${state.text ? ` matching <bdi lang="he">${esc(state.text)}</bdi>` : ""}</p></div>${found.slice(state.page * 20, (state.page + 1) * 20).map(passage => passageHTML(passage, state.text)).join("") || emptyState("No passages found", "Try another Hebrew spelling or change the library selection.", "Clear search", "clear-query")}${pagination(found.length)}</div></div>` : `<div class="reader-start"><h2>Choose a tractate to read.</h2><p>Browse the library, or search for a Hebrew word or phrase above.</p><div class="reading-directory">${orders.filter(order => !state.order || order === state.order).map(order => `<section><h3>${order}<span lang="he" dir="rtl">${heOrders[orders.indexOf(order)]}</span></h3>${books.filter(book => book.order === order).map(book => urlLink(`<span>${esc(book.title)}</span><span lang="he" dir="rtl">${esc(book.heTitle)}</span>`, {tractate: book.title, order, chapter: 1, text: "", entry: ""})).join("")}</section>`).join("")}</div></div>`}`;
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
    if (matchMedia("(max-width: 760px)").matches) $(".entry-panel").focus();
  });
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
}
function method() {
  modal(
    "How the text is counted",
    `<div class="method-copy"><p>These counts cover 63 Hebrew tractates of the Mishnah from Sefaria’s public export, without commentaries. The edition includes a few chapters the source supplies beyond the printed Mishnah, such as Avot 6 and Bikkurim 4, and the totals reflect that.</p><h3>Counting</h3><p>Vowel and cantillation marks are stripped before counting. A word is any run of Hebrew letters; punctuation and hyphens split words. Prefixes stay attached, so this counts written forms rather than roots or meanings. Phrases are adjacent word pairs inside one mishnah.</p><p>“Exclude common words” removes the particles and reporting words listed below from word lists and exports. The totals always describe the full selection.</p><details><summary>Excluded words</summary><p lang="he" dir="rtl">${[...stopWords].join(" · ")}</p></details><h3>Sources</h3><p>Source export ${new Date(corpus.exportDate).toLocaleDateString("en-GB")}, merged ${new Date(corpus.downloadedAt).toLocaleDateString("en-GB")}. <a href="/data/mishnah.json" download>Full JSON with attribution</a> · <a href="/data/mishnah.txt" download>Plain Hebrew text</a></p></div>`,
  );
}
init();
