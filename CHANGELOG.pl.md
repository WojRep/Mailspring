# Dziennik zmian — Actuna Mail

[English](CHANGELOG.md) · **Polski**

Istotne zmiany w Actuna Mail — forku Mailspring 1.21.0 wzmocnionym pod kątem zgodności (compliance). Najnowsze na górze. Oryginalny dziennik zmian Mailspring zachowano osobno w pliku [CHANGELOG-MAILSPRING.md](CHANGELOG-MAILSPRING.md).

## v0.3 — Szyfrowanie danych w spoczynku

Szyfrowanie na poziomie aplikacji dla lokalnej bazy danych oraz plików załączników (dane w spoczynku).

- **v0.3.16–v0.3.20 — Szyfrowanie załączników (`AENC`).** Pliki załączników w katalogu `files/` są szyfrowane algorytmem AES-256-GCM, a klucz wyprowadzany jest przez HKDF-SHA256 z klucza bazy danych. Funkcję zaimplementowano zarówno w rendererze (TypeScript), jak i w silniku `mailsync` napisanym w C++ — oba korzystają z tego samego formatu zapisu na dysku. Obrazy osadzone w wiadomościach są dostarczane przez dedykowany protokół `actuna-attachment://`, który odszyfrowuje je w pamięci; operacje Otwórz / Zapisz / przeciągnięcie na zewnątrz / Quick Look odszyfrowują plik do lokalizacji tymczasowej poza synchronizowanym profilem. Starsze, niezaszyfrowane załączniki pozostają czytelne (płynna obsługa wstecznej zgodności). (ticket 49 w backlogu)
- **v0.3.0–v0.3.15 — Szyfrowanie bazy danych (SQLCipher, Tier A).** Lokalna baza `edgehill.db` jest szyfrowana przy użyciu SQLCipher (AES-256-CBC + HMAC). Przy pierwszym uruchomieniu generowany jest losowy 32-bajtowy klucz, chroniony przez pęk kluczy systemu operacyjnego za pośrednictwem mechanizmu `safeStorage` z Electrona; renderer i `mailsync` współdzielą ten klucz (zmienna środowiskowa `ACTUNA_DB_KEY`). Szyfrowanie jest domyślnie włączone dla nowych instalacji i weryfikowane automatycznym testem dymnym. Zaszyfrowany zakres obejmuje treści wiadomości, indeks wyszukiwania pełnotekstowego, kontakty oraz kalendarze. W onboardingu pojawił się slajd „Prywatność domyślnie". (ticket 45 w backlogu)

## v0.2 — Zakończenie sterylizacji i wzmocnienie

- Aktualizacje zależności zamykające ~42 alerty Dependabota — Electron 39 → 41 (Chrome 146), DOMPurify, `@xmldom/xmldom`, lodash, postcss, minimatch i inne (poprawki dotyczące XSS, wstrzykiwania XML, ReDoS oraz wstrzykiwania kodu).
- Przegląd marki: 16 wewnętrznych modułów przemianowano z `mailspring-*` na `actunamail-*` (zaktualizowano 481 ścieżek importu); własny schemat URL zmieniono z `mailspring://` na `actunamail://`; usunięto pozostałości brandingu Mailspring z układu pakietu i metadanych.
- Usunięto z C++ silnika `mailsync` zabezpieczenie blokujące fork; uproszczono układ pakietu.
- i18n: narzędzia wymuszające parzystość PL + EN; poprawki braków w tłumaczeniach.
- UX / dostępność: lepsza wykrywalność elementów po najechaniu (kursor i rozmiary obszarów dotykowych), bazowy komponent `<Tooltip>` (WCAG 1.4.13), refaktoryzacja paska bocznego i edytora reguł pod kątem dostępności semantycznej.
- Ustawienia domyślne: zegar 24-godzinny, pełne nagłówki widoczne.
- Pliki SECURITY.md i COMPLIANCE.md przepisano tak, aby odpowiadały rzeczywistej zawartości binarnej aplikacji.

## v0.1 — Pierwszy fork

- Fork Mailspring 1.21.0. Usunięto wszystkie dziesięć domyślnych kanałów wysyłania danych do podmiotów trzecich — Sentry, natywny raporter awarii, Gravatar, `logo.getmailspring.com`, synchronizację metadanych wtyczek, odpytywanie tożsamości, zdarzenia użycia funkcji, `/api/resolve-dav-hosts`, `/ping` oraz zapis do newslettera. Warstwę tożsamości Mailspring ID / Foundry usunięto w całości. Pełny audyt znajduje się w pliku [AUDYT-MAILSPRING.md](AUDYT-MAILSPRING.md).
- Aplikację przemianowano z Mailspring na ActunaMail (branding widoczny dla użytkownika); dodano zasoby marki Actuna (ikona aplikacji, ikony zasobnika systemowego, grafika powitalna).
- Wyłączono GitHub Actions i zneutralizowano przepływy CI.
- Wstępna dokumentacja zgodności (SECURITY.md, COMPLIANCE.md).
- Poprawki wizualne / UX.

---

*Numery wersji to wersje aplikacji (`app/package.json`). Każdy wpis `[v0.x.y]` odpowiada atomowemu, niezależnie weryfikowalnemu commitowi.*
