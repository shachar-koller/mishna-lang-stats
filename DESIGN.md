# Mishnah Atlas interface

A dense, minimal reference site. The central task is finding a Hebrew form and reading its source passages without losing the word list.

## Structure

- Three views: Words, Reader, Compare. Existing Overview and Words URLs both open the word workspace.
- A searchable library groups all 63 tractates by order. Text selection stays consistent across views. Whole Mishnah and Clear selection reset scope.
- Words has a search field, frequency modes, and a common-word exclusion toggle. A compact list and a source pane scroll independently; pagination remains visible.
- Selecting a word updates the source pane and URL. Eight passages are previewed; the reader provides all results with pagination.
- On narrow screens, the library is toggleable and selecting a word opens a passage view with a Word list back button. The full reader keeps search and chapter controls above the text.
- Reader starts with a tractate directory. Selecting a tractate opens its text; Hebrew searches also work across the full corpus.
- Compare is an actual table with sortable metrics and direct links to reading or word analysis.
- Corpus statistics and downloads live in the library. Methodology stays accessible from the header.

## Visual rules

White and neutral gray, dark text, a restrained blue selection color. System sans-serif for navigation and counts; local Hebrew serif fallbacks for source text. Small corner radii only on controls. Compact rows, tabular numerals, visible column labels, minimal borders. No hero, decorative stat strip, card grid, large marketing headings, or decorative imagery.

## Interaction and accessibility

Use real links for navigation, labeled search fields, buttons for actions, visible keyboard focus, native disclosure controls, and a skip link. Preserve Hebrew direction, vowels, and exact-match highlighting. Empty searches explain how to recover. Source attribution, downloads, copyable URLs, and browser history remain available.

Earlier anti-generic design research: [Anti-AI-Slop skill](https://github.com/Krirox/anti-ai-slop-skills/blob/main/SKILL.md). The user's explicit preference for a dense, minimal reference site takes precedence over the earlier editorial direction.
