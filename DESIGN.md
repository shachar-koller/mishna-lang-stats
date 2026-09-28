# Mishnah Atlas interface

This is a Hebrew concordance and corpus reader. Put words and passages ahead of summary statistics.

Design guidance: [Anti-AI-Slop skill](https://github.com/Krirox/anti-ai-slop-skills/blob/main/SKILL.md), consulted September 28, 2026. Applied its documentary/data-dense direction, clear hierarchy, concrete copy, and restrained controls.

- Use a broad word-list column with a narrow supporting column for corpus counts and orders. On mobile, put the supporting material after the list.
- Use serif headings and Hebrew entries, system sans-serif controls, and tabular numbers. Keep fonts local/system-provided.
- Use warm white, dark ink, and a single rust accent for selection and actions. Frequency bars are neutral; their length conveys quantity.
- Use rules and spacing to group content. Avoid stat cards, decorative illustrations, gradients, and promotional hero sections.
- Keep filters labeled, selected tabs visibly underlined, and keyboard focus visible. Preserve Hebrew direction and exact search highlighting.
- State what counts mean. Keep source attribution, counting methodology, empty states, and downloads accessible.

Validation: production build, existing analytics/state tests, and browser checks of desktop/mobile layout, filters, word details, reader search, empty results, and the tractate table.
