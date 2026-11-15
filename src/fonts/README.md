# The typefaces

Six font files, carried in the repo so the board asks the network for nothing
(gt#94). `../fonts.ts` declares them; `../tokens` says which stack uses which.

| File | Family | Weight | Used for | Licence |
| --- | --- | --- | --- | --- |
| `permanent-marker-400.woff2` | Permanent Marker | 400 | tape labels | Apache 2.0 — `licenses/LICENSE-permanent-marker.txt` |
| `public-sans-variable.woff2` | Public Sans | 400, 600 (one variable file) | hover tips, captions | SIL OFL 1.1 — `licenses/OFL-public-sans.txt` |
| `saira-condensed-600.woff2` | Saira Condensed | 600 | module and box names | SIL OFL 1.1 — `licenses/OFL-saira-condensed.txt` |
| `saira-condensed-700.woff2` | Saira Condensed | 700 | module and box names | SIL OFL 1.1 — `licenses/OFL-saira-condensed.txt` |
| `stardos-stencil-400.woff2` | Stardos Stencil | 400 | zone names | SIL OFL 1.1 — `licenses/OFL-stardos-stencil.txt` |
| `stardos-stencil-700.woff2` | Stardos Stencil | 700 | zone names | SIL OFL 1.1 — `licenses/OFL-stardos-stencil.txt` |

Each file is the **latin** range of its face as Google Fonts serves it —
`FONTS.range` in `../fonts.ts` is that range, and the only character the board
draws outside plain ASCII is an em dash, which is in it. Fetched 2026-11-14 from
`fonts.gstatic.com`; the licence texts are from the `google/fonts` repository.

Permanent Marker is copyright Font Diner, Inc. The other three name their
authors at the top of their licence files.

To add a face or a weight: put the file here, add its row to `typefaces` in
`../tokens` and to `FONTS.files` in `../fonts.ts`, and add its licence. The
suite fails on a row in one table that is missing from the other.
