# Actuna Mail

> Klient poczty dla UE. Obietnice prywatności, które wytrzymują audyt.

**Actuna Mail** to desktopowy klient poczty dla macOS, Windows i Linux, stworzony dla osób i organizacji działających pod europejskim prawem ochrony danych. Jest forkiem [Foundry376/Mailspring](https://github.com/Foundry376/Mailspring) w wersji 1.21.0.

[![Licencja: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-blue.svg)](LICENSE.md)
[![Status: pre-alpha](https://img.shields.io/badge/Status-pre--alpha-orange.svg)](#status)
[![Zgodność: GDPR · AI Act · KNF · NIS2](https://img.shields.io/badge/Compliance-GDPR%20·%20AI%20Act%20·%20KNF%20·%20NIS2-green.svg)](COMPLIANCE.md)

[English](README.md) · **Polski**

---

## Cel

**Actuna Mail** to fork Mailspring 1.21.0 utwardzony pod kątem zgodności (compliance). Przeprowadziliśmy audyt Mailspring linijka po linijce, wycięliśmy każdy domyślny kanał wysyłający Twoje dane, metadane lub dane Twoich kontaktów do stron trzecich, i dodaliśmy szyfrowanie at-rest dla bazy danych oraz załączników.

Celem jest klient poczty, którego postawa wobec prywatności faktycznie odpowiada temu, co deklaruje jego dokumentacja — i który wytrzyma audyt kancelarii prawnej, biura rachunkowego czy oficera compliance z sektora finansowego.

Pełny audyt tego, co Mailspring 1.21.0 faktycznie robi — dziesięć kanałów wycieku, rozbieżność względem własnego SECURITY.md Mailspring oraz porównanie kanał po kanale — znajduje się w **[AUDYT-MAILSPRING.md](AUDYT-MAILSPRING.md)**.

## Dla kogo to jest

- Kancelarie prawne, biura rachunkowe, doradztwo podatkowe w Polsce i UE działające pod RODO.
- Pracownicy sektora finansowego objęci **Rekomendacją D / Rekomendacją Z KNF**.
- Operatorzy podmiotów kluczowych i ważnych w rozumieniu **NIS2** (Krajowy System Cyberbezpieczeństwa 2.0).
- Organizacje, które chcą używać AI w obiegu poczty bez nieświadomego wejścia w zakres art. 6 / Załącznika III **AI Act**.
- Osoby dbające o prywatność, które chcą działającego klienta poczty o weryfikowalnej postawie wobec prywatności.

## Bezpieczeństwo w skrócie

| Obszar bezpieczeństwa | Mailspring 1.21.0 | Actuna Mail |
|---|---|---|
| Domyślny egress do stron trzecich | 10 kanałów do serwerów w USA (Sentry, crash reporter, Gravatar, metadata sync, odpytywanie tożsamości…) | Brak — każdy kanał usunięty |
| Szyfrowanie bazy at-rest | Brak — jawny SQLite | SQLCipher (AES-256-CBC + HMAC), domyślnie włączone |
| Szyfrowanie załączników at-rest | Brak — pliki jawne | AES-256-GCM per plik |
| Konto w chmurze / Mailspring ID | Domyślny proces rejestracji | Usunięte całkowicie — brak konta w chmurze |
| Raporty awarii i telemetria | Domyślnie włączone, bez zgody | Usunięte |

Pełne zestawienie kanał po kanale: **[AUDYT-MAILSPRING.md](AUDYT-MAILSPRING.md)**.

## Co zachowujemy

- Pełną funkcjonalność poczty: IMAP, SMTP, CalDAV, CardDAV.
- Obsługę Gmail, Microsoft 365, iCloud, Outlook, Yahoo oraz generycznego IMAP.
- Logowanie OAuth (`accounts.google.com`, `login.microsoftonline.com`, `graph.microsoft.com`).
- Lokalną bazę SQLite, wyszukiwanie pełnotekstowe, wątkowanie, widok konwersacji.
- Interfejs Mailspring, motywy, wspólną skrzynkę, drzemkę (lokalnie), szablony (lokalnie), sprawdzanie pisowni (lokalnie).
- SDK wtyczek dla użytkowników, którzy chcą rozszerzać aplikację — o ile wtyczki respektują politykę egress Actuny.

Binarka Actuna Mail jest na licencji GPL-3.0, tej samej co Mailspring. Praca nad utwardzeniem pod compliance to niewielki ułamek całego kodu Mailspring — zasługa za sam klient poczty należy do [Foundry 376](https://github.com/Foundry376) i kontrybutorów Mailspring.

## Dokumentacja

- **[AUDYT-MAILSPRING.md](AUDYT-MAILSPRING.md)** — audyt bezpieczeństwa Mailspring 1.21.0 linijka po linijce oraz pełna lista usuniętych kanałów egress.
- **[COMPLIANCE.md](COMPLIANCE.md)** — mapowanie każdej zmiany na artykuły RODO / AI Act / KNF / NIS2.
- **[SECURITY.md](SECURITY.md)** — własna postawa bezpieczeństwa Actuna Mail i kontakt do odpowiedzialnego ujawniania podatności.
- **`verification/`** — raporty regresji egress w czasie działania; postawa egress jest weryfikowana empirycznie po każdym wydaniu.

## Architektura

Actuna Mail ma architekturę trójwarstwową:

```
┌─────────────────────────────────────────────────┐
│  Actuna Mail (to repozytorium)         GPL-3.0  │
│  - Wysterylizowany fork Mailspring 1.21.0       │
│  - Brak egress do stron trzecich domyślnie      │
│  - Zachowane SDK wtyczek                        │
└──────────────────┬──────────────────────────────┘
                   │ HTTP/IPC
                   ▼
┌─────────────────────────────────────────────────┐
│  Actuna Mail Engine                  zamknięty  │
│  - Lokalny router AI (Claude / Codex CLI)       │
│  - Polska biblioteka promptów                   │
│  - Walidacja licencji                           │
│  - Opcjonalna telemetria (tylko za zgodą)       │
└──────────────────┬──────────────────────────────┘
                   │ podproces
                   ▼
       claude / codex CLI na maszynie użytkownika
       (własna subskrypcja użytkownika, nie klucz API)
```

Warstwa Engine **nie jest** częścią tego repozytorium i **nie importuje** z niego niczego. Komunikuje się przez stabilny interfejs HTTP/IPC, co utrzymuje czystą granicę GPL.

## Postawa zgodności

Szczegóły w [COMPLIANCE.md](COMPLIANCE.md). Podsumowanie:

| Ramy prawne | Zakres |
|---|---|
| **RODO / GDPR** (UE 2016/679 + pol. ust. o ochr. dan. osob.) | Art. 5 (minimalizacja danych), art. 6 (podstawa prawna), art. 7 (zgoda), art. 13/14 (przejrzystość), art. 25 (privacy by design i by default), art. 32 (bezpieczeństwo), art. 44+ (przekazywanie do państw trzecich — Schrems II) |
| **AI Act** (UE 2024/1689) | Art. 50 (przejrzystość treści generowanych przez AI) — obowiązuje po wdrożeniu warstwy Engine |
| **Rekomendacja D i Z KNF** | Rekomendacja D (zarządzanie obszarem IT), Rekomendacja Z (ryzyko outsourcingu) |
| **NIS2** (UE 2022/2555 + pol. Krajowy System Cyberbezpieczeństwa 2.0) | Art. 21 (środki zarządzania ryzykiem, łańcuch dostaw), art. 23 (podstawa zgłaszania incydentów) |

Szyfrowanie magazynu jest wdrożone: lokalna baza danych szyfrowana SQLCipher (AES-256-CBC + HMAC), a pliki załączników — AES-256-GCM. Szyfrowanie na warstwie aplikacji, at-rest, domyślnie włączone dla nowych instalacji. Zobacz [SECURITY.md](SECURITY.md).

## Status

Pre-alpha. Repozytorium zawiera pakiety audytowe, które wymusiły każdą zmianę; sam audyt mieszka w projekcie nadrzędnym — zobacz notatki audytowe wskazane w [SECURITY.md](SECURITY.md) oraz [AUDYT-MAILSPRING.md](AUDYT-MAILSPRING.md).

## Współpraca

Na etapie pre-alpha nie przyjmujemy zewnętrznych pull requestów. Prace audytowe są odtwarzalne z dokumentacji wskazanej w [SECURITY.md](SECURITY.md) — niezależna weryfikacja jest mile widziana pod adresem `tech@actuna.pl`.

## Podziękowania i licencja

- To jest fork [Foundry376/Mailspring](https://github.com/Foundry376/Mailspring), © Foundry 376 LLC, GPL-3.0. Bazowy klient poczty jest fundamentem tej pracy.
- Silnik synchronizacji poczty [Foundry376/Mailspring-Sync](https://github.com/Foundry376/Mailspring-Sync) (dołączony jako submoduł) również © Foundry 376, GPL-3.0.
- Wszystkie modyfikacje Actuny są licencjonowane na GPL-3.0.
- Pełny tekst GPL-3.0 znajduje się w [LICENSE.md](LICENSE.md).
- „Mailspring" jest znakiem towarowym Foundry 376 LLC. Nie używamy nazwy ani logo Mailspring na buildach Actuna Mail. Odniesienia w tym pliku mają charakter opisowy, w ramach dozwolonego użytku nominatywnego.

## Kontakt

- Audyt i zgodność: `tech@actuna.pl`
- Odpowiedzialne ujawnianie podatności: zobacz [SECURITY.md](SECURITY.md)

---

*Mailspring to świetny klient poczty. Actuna Mail to ta wersja Mailspring, którą — według jego SECURITY.md — już mieliśmy.*
