# Continuous improvement

Chess Coach AI is developed in short improvement cycles with Claude Code. The
standing instruction for every session is the main prompt
([00-continuous-improvement.md](00-continuous-improvement.md)), loaded through
`CLAUDE.md`. Each cycle then follows one focused mission from this folder.

## The menu

When the user says "continue" without naming an aspect, Claude answers
"Sur quel aspect ?" with this list, and runs the chosen prompt in full.

| # | Aspect | Prompt |
| --- | --- | --- |
| 1 | General improvement cycle (audit, the 3 best improvements) | [00-continuous-improvement.md](00-continuous-improvement.md) |
| 2 | Chess intelligence: evaluations, classification, motifs | [01-chess-intelligence.md](01-chess-intelligence.md) |
| 3 | AI coach: explanations, levels, verification | [02-ai-coach.md](02-ai-coach.md) |
| 4 | Competitive intelligence: Chess.com, Lichess, new tools | [03-competitive-intelligence.md](03-competitive-intelligence.md) |
| 5 | Performance: load, engine, memory, bundle | [04-performance.md](04-performance.md) |
| 6 | Design and UX: workflows, mobile, accessibility | [05-product-design.md](05-product-design.md) |
| 7 | Personalised learning: profile, what to learn next | [06-personalized-learning.md](06-personalized-learning.md) |
| 8 | Security and reliability: dependencies, inputs, proxy, licences | [07-security-reliability.md](07-security-reliability.md) |
| 9 | Advanced features research: openings, tactics, endgames, Maia | [08-advanced-features-research.md](08-advanced-features-research.md) |
| 10 | Innovation and product discovery (proposals first, no code) | [09-innovation-discovery.md](09-innovation-discovery.md) |

## The cycle

1. **Audit**: find bugs, weaknesses and opportunities.
2. **Research**: study new technologies and competitors (web search, sources
   cited in the report).
3. **Prioritisation**: choose the best impact for the effort.
4. **Implementation**: on a dedicated branch.
5. **Validation**: tests, benchmarks, security, checks on desktop and mobile.
6. **Delivery**: commits, push, draft pull request, documentation and
   `docs/ROADMAP.md` updated.
7. **Next iteration**: start again with a new audit.

Run one mission at a time rather than several at once.

The measure of success is not the number of features added, but how much the
application helps the player improve at chess.
