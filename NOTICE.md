# NOTICE — ActunaMail (modified fork of Mailspring)

Ten plik spełnia wymóg GPL-3.0 §5(a) ("The work must carry prominent notices
stating that you modified it, and giving a relevant date") na poziomie
całego dzieła.

This file satisfies the GPL-3.0 §5(a) requirement ("The work must carry
prominent notices stating that you modified it, and giving a relevant
date") at the level of the work as a whole.

---

## Polski

**ActunaMail** to zmodyfikowany fork programu **Mailspring 1.21.0**
autorstwa **Foundry 376, LLC**, opublikowanego na licencji GNU General
Public License v3.0 (lub, według wyboru otrzymującego, dowolnej późniejszej
wersji).

- **Modyfikujący:** Actuna — Wojciech Repiński (Polska).
- **Data rozpoczęcia modyfikacji:** 2026 (rok bieżący).
- **Repozytorium modyfikacji:** <https://github.com/WojRep/ActunaMail>.
- **Licencja dzieła:** GNU GPL v3.0 (te same warunki co upstream).

Zakres modyfikacji (lista wysokopoziomowa — pełen log w git):

1. **Usunięcie subskrypcji PRO** — gating funkcji premium oraz mechanizmu
   Mailspring ID wycofany.
2. **Usunięcie kanałów telemetrii** — Sentry, Gravatar, getmailspring.com.
3. **Wyłączenie auto-update channel** — `autoUpdater = null`.
4. **EU compliance posture** — mapowanie na RODO (UE 2016/679), AI Act
   (UE 2024/1689), NIS2 (UE 2022/2555), Rekomendacje KNF D oraz Z.
5. **Aktualizacje zależności** — zamknięcie 42 alertów Dependabot (Sprint 4).
6. **Zastąpienie `moment-round`** (CC-BY-SA-3.0) lokalnym helperem
   `app/src/utils/moment-round.ts` (2026-05-23).
7. **Integracja wtyczki AI** (`actunamail-ai/plugin-gpl`) jako oddzielne
   dzieło GPL-3.0 ładowane do renderera; szczegóły boundary w
   `analysis/21-gpl-boundary-memo.md`.
8. **Rebranding na ActunaMail** — productName, app metadata, brand assets
   (cleanup stringów Mailspring w trakcie).
9. **EU-aware logging policy** — `analysis/22-ticket-19-dpia-compliance-memo.md`.

Szczegółowy, plikowy log zmian: `git log` na branch `main` (od commitu
inicjalnego forka).

Per GPL-3.0 §5(a) niniejszy NOTICE jest "prominent notice" na poziomie
dzieła. Niniejsza forka **nie** dodaje per-plikowych nagłówków
modyfikacyjnych w każdym zmienionym pliku — zgodnie z analizą prawną w
`analysis/24-license-compliance-audit.md` §7 Strefa E, atrybucja na
poziomie dzieła (`appCopyright`, `all_licenses.html`, niniejszy NOTICE)
spełnia §5(a).

## English

**ActunaMail** is a modified fork of **Mailspring 1.21.0** by **Foundry
376, LLC**, distributed under the GNU General Public License v3.0 (or, at
the recipient's option, any later version).

- **Modifier:** Actuna — Wojciech Repiński (Poland).
- **Modifications started:** 2026.
- **Modifications repository:** <https://github.com/WojRep/ActunaMail>.
- **Licence of the work:** GNU GPL v3.0 (same terms as upstream).

High-level summary of modifications (full log in git):

1. **Removal of PRO subscription gating** — premium feature gating and
   Mailspring ID mechanism removed.
2. **Removal of telemetry channels** — Sentry, Gravatar, getmailspring.com.
3. **Disablement of auto-update channel** — `autoUpdater = null`.
4. **EU compliance posture** — mapped to GDPR (EU 2016/679), AI Act
   (EU 2024/1689), NIS2 (EU 2022/2555), KNF Recommendations D and Z.
5. **Dependency upgrades** — closing 42 Dependabot alerts (Sprint 4).
6. **Replacement of `moment-round`** (CC-BY-SA-3.0) with a local helper
   `app/src/utils/moment-round.ts` (2026-05-23).
7. **AI plugin integration** (`actunamail-ai/plugin-gpl`) as a separate
   GPL-3.0 work loaded into the renderer; boundary details in
   `analysis/21-gpl-boundary-memo.md`.
8. **Rebranding to ActunaMail** — productName, app metadata, brand assets
   (Mailspring-string cleanup ongoing).
9. **EU-aware logging policy** — `analysis/22-ticket-19-dpia-compliance-memo.md`.

Detailed per-file change log: `git log` on the `main` branch (from the
initial fork commit).

Per GPL-3.0 §5(a) this NOTICE serves as a "prominent notice" at the level
of the work. This fork does **not** add per-file modification headers in
every changed source file — per the legal analysis in
`analysis/24-license-compliance-audit.md` §7 Strefa E, modification
attribution at the level of the work (`appCopyright`, `all_licenses.html`,
this NOTICE) satisfies §5(a).
