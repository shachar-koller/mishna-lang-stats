import { orders } from "./analytics.js";
export const defaults = {
  view: "overview",
  order: "",
  tractate: "",
  mode: "common",
  hide: false,
  word: "",
  entry: "",
  text: "",
  chapter: 0,
  sort: "total",
  page: 0,
};
export function readState(search, books) {
  const p = new URLSearchParams(search);
  const state = { ...defaults };
  for (const key of ["word", "text", "entry"]) state[key] = p.get(key) || "";
  for (const [key, values] of Object.entries({
    view: ["overview", "words", "tractates", "reader"],
    mode: ["common", "rare", "phrases"],
    sort: ["total", "unique", "average", "name"],
  })) {
    if (values.includes(p.get(key))) state[key] = p.get(key);
  }
  state.order = orders.includes(p.get("order")) ? p.get("order") : "";
  const book = books.find(
    (b) =>
      b.title === p.get("tractate") &&
      (!state.order || b.order === state.order),
  );
  state.tractate = book?.title || "";
  state.hide = p.get("hide") === "1";
  state.page = Math.max(
    0,
    Math.min(100000, Math.floor(Number(p.get("page"))) || 0),
  );
  const chapter = Number(p.get("chapter"));
  state.chapter =
    book &&
    Number.isInteger(chapter) &&
    chapter > 0 &&
    chapter <= book.chapters.length
      ? chapter
      : 0;
  return state;
}
export function stateURL(state) {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) {
    if (key in defaults && value !== defaults[key])
      p.set(key, key === "hide" ? "1" : String(value));
  }
  return p.size ? `?${p}` : "/";
}
