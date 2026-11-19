# Security & Reliability Audit — chessed

> Aspect 8 of the menu.

Act as a Senior Application Security Engineer.

Run an in-depth security audit of the whole application.

Analyse:

- npm dependencies.
- Known vulnerabilities.
- Import and parsing of PGN files.
- Input validation.
- XSS.
- Injection.
- API security.
- Secret handling.
- Browser permissions.
- Local storage.
- Service Workers.
- Web Workers.
- Handling of personal data.
- Security of the backend proxy (`proxy/`).
- Rate limiting.
- Risks from open-source dependencies.

Also check the licences of the components used, particularly Stockfish and the
projects derived from it (see `THIRD_PARTY_NOTICES.md`).

Write suitable security tests.

Fix the confirmed vulnerabilities.

Do not break existing features.

Produce a risk report with each risk's severity and the corrective measures.
