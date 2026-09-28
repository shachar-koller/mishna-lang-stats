# Mishnah Atlas

A clean, responsive web app for exploring the complete Hebrew Mishnah. The corpus is included locally: **63 tractates, 525 chapters, 4,192 passages, 192,574 word tokens** in the downloaded edition.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:5173. `npm run build` creates a static site in `dist/`; `npm run preview` serves the production build. No API keys, account, or database required. Uses system fonts; the app makes no external requests to render or analyze the text.

## Explore

- Most common and least common words, including words occurring just once
- Common adjacent two-word phrases
- Filter by any of the six orders or 63 tractates
- Optional exclusion of a documented set of common particles / reporting words
- Search the tractate library and select an order or tractate without leaving the workspace
- Click a word to read highlighted source passages beside the frequency list; on phones, use the passage view and Word list back button
- Open all matches in the reader, or browse its tractate directory
- Sort tractates by word count, vocabulary, average passage length, or name
- Read the longest passage and compare the six orders using aligned bars
- Hebrew reader with highlighted exact word / phrase matches, chapter navigation, and direct page jumps in both the reader and word lists
- Bookmarkable filters and searches, browser Back/Forward support, and a copy-link button
- Download the full text, attributed JSON corpus, or filtered frequency CSV

## Data and attribution

Text source: [Sefaria-Export](https://github.com/Sefaria/Sefaria-Export), public Google Cloud Storage export. Only primary Hebrew Mishnah texts under the six `Seder` categories are downloaded. This uses Sefaria's merged versions; underlying version names and source URLs are preserved per tractate in `public/data/mishnah.json`. Unmodified exports are in `public/data/raw/`. No commentary collections are included.

The corpus preserves extra chapters included in the source edition (including Avot 6 and Bikkurim 4). Its chapter and passage totals therefore describe this edition, not a claim about a universal canonical count. Merged exports do not specify a single license. Consult each underlying edition and [Sefaria's terms](https://www.sefaria.org/terms) for reuse permissions; no new license is asserted over the source texts.

- `public/data/mishnah.txt`: full readable Hebrew corpus with passage references
- `public/data/mishnah.json`: full structured text, download date, and provenance
- `public/data/raw/`: 63 unmodified source JSON files
- `scripts/download_mishnah.py`: repeatable downloader with retries and completeness checks

Refresh from the source with Python 3.9+:

```sh
npm run data:download
```

The refresh validates the source contains exactly 63 tractates and has no empty chapters/passages before replacing the combined corpus. Requires internet access. Runtime analytics use the local snapshot and do not call Sefaria.

## Counting methodology

HTML and annotated footnotes are removed in the import. Tokenization removes Hebrew vowels/cantillation and extracts consecutive Hebrew letters (א–ת). Punctuation, maqaf, and other nonletters separate words. Prefixes, spelling variants, and final letter forms remain intact; this is word-form analysis, not root analysis. Phrases never span passage boundaries. Rare words are sorted by ascending frequency then Hebrew alphabetical order. Search matches whole words and contiguous phrases after the same normalization. Summary metrics always include all words; the particle toggle applies only to word lists and their exports.

## Validation

`npm test` checks token normalization, exact search, phrase boundaries, vocalized highlight ranges, URL-state round trips and validation, statistical totals, and all 63 tractates. `npm run build` checks the production bundle. Snapshot structural totals in the corpus test intentionally flag edition changes after a refresh.

Built with vanilla JavaScript and Vite. Analysis runs in the browser; no user data is sent to a server.
