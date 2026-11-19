# Roadmap status

| Phase | Status |
| --- | --- |
| 0. Foundations | Done |
| 1. MVP: import, analysis, classification, explanations, retry | Done |
| 2. Complete review: Brilliant, motifs, deep profile, second pass, Lichess sources, clocks, summaries | Done |
| 3. Pedagogy: verified language-model coach, levels, hints, Maia-3, positional facts | Done (language-model coach not yet tried against the live API) |
| 4. Progress: dashboard, rates per opportunity, priorities, spaced training, backups | Done |
| 5. Future: batch analysis, offline app, repertoire, opening explorer | Partly done (below) |

## Phase 5

Done:

- **Batch analysis** from the command line (`npm run analyse`), with a native
  engine option, writing a backup the app imports. Replaces server-side
  analysis without hosting costs.
- **Offline, installable app** (web app manifest + service worker). Replaces a
  native mobile app for now.
- **Personal repertoire**: your earlier choices in the same position, and the
  positions where you vary.
- **Lichess Opening Explorer** (masters, and players around your rating), with
  a Lichess login (OAuth with PKCE, no scope).

Not done, and why:

- **Win % curve by rating band.** It needs fitting on a large set of rated games
  with evaluations (the Lichess open database); the current curve is the
  rating-independent Lichess one. Worth doing once enough of your own games are
  analysed to check the difference matters.
- **Encrypted sync between devices.** Needs a storage backend (for example
  Cloudflare KV behind the existing proxy). The JSON backup covers the need
  today.
- **Native mobile app (Capacitor).** The installable offline web app covers
  phones; a native shell adds little until features need native APIs.
