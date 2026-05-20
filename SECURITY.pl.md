# Bezpieczeństwo

[English](SECURITY.md) · **Polski**

## Założenia

Actuna Mail opiera się na jednej zasadzie: **zainstalowany przez Ciebie program nie może przesyłać Twoich danych, Twoich metadanych ani danych Twoich kontaktów do żadnej osoby trzeciej, której świadomie nie wybrałeś.**

Co to oznacza w praktyce:

1. **Dane uwierzytelniające poczty** (hasła IMAP/SMTP, tokeny odświeżające OAuth) przechowywane są w bezpiecznym magazynie poświadczeń systemu operacyjnego — w macOS Keychain za pośrednictwem `safeStorage` z Electron, w Windows Credential Manager albo w Linux Secret Service / GNOME Keyring / KWallet. Nigdy nie opuszczają magazynu poświadczeń, poza przekazaniem w pamięci do lokalnego podprocesu `mailsync`, który łączy się z Twoim dostawcą poczty.

2. **Treść poczty** (treści wiadomości, indeks wyszukiwania pełnotekstowego, kontakty, kalendarze) przechowywana jest lokalnie w bazie SQLite w katalogu danych aplikacji użytkownika: `~/Library/Application Support/ActunaMail/edgehill.db` (macOS) lub w odpowiedniku właściwym dla danej platformy. Baza ta jest **szyfrowana w spoczynku za pomocą SQLCipher** (AES-256-CBC + HMAC) — Poziom A: losowy 32-bajtowy klucz generowany przy pierwszym uruchomieniu i chroniony przez systemowy keychain za pośrednictwem `safeStorage` z Electron (macOS Keychain / Windows DPAPI / Linux GNOME Keyring lub KWallet). Szyfrowanie jest domyślnie włączone przy nowych instalacjach; zarówno renderer, jak i silnik `mailsync` napisany w C++ otwierają tę samą zaszyfrowaną bazę. Poziom B (opcjonalne hasło główne, Argon2id) jest odnotowany jako pozycja w backlogu.

3. **Załączniki** przechowywane jako pliki w katalogu `files/` są **szyfrowane w spoczynku** — AES-256-GCM osobno dla każdego pliku, z kluczem wyprowadzanym przez HKDF-SHA256 z tego samego klucza SQLCipher DBKey (brak osobnego sekretu do zarządzania). Zarówno renderer, jak i silnik `mailsync` w C++ odczytują i zapisują wspólny format dyskowy `AENC`, a obrazy osadzone w treści / podglądy / otwieranie / przeciąganie na zewnątrz są odszyfrowywane w sposób przezroczysty. Szyfrowanie w spoczynku na poziomie aplikacji obejmuje bazę danych oraz pliki załączników.

4. **Brak raportowania błędów do osób trzecich.** Bez Sentry. Bez natywnego mechanizmu zgłaszania awarii na zdalne serwery. Awarie są zapisywane wyłącznie lokalnie na dysku. Electron Crashpad i Breakpad są wyłączone na trzech poziomach (kod renderera, flagi procesu głównego, zmienne środowiskowe C++ mailsync).

5. **Brak wyszukiwań wizualnych ani behawioralnych w usługach zewnętrznych.** Bez Gravatara. Bez `logo.getmailspring.com`. Bez Plugin Metadata Sync. Bez odpytywania o tożsamość. Warstwa Mailspring identity/Foundry została całkowicie usunięta (magazyn `Identity` jest wypatroszony i zwraca `null`; zmienna środowiskowa `IDENTITY_SERVER` przekazywana do mailsync jest pusta).

6. **Brak kanału automatycznych aktualizacji.** To użytkownik decyduje, kiedy aktualizacja zostanie zastosowana. Gdy powstanie własny kanał aktualizacji Actuny, będzie on dobrowolny (opt-in) i podpisany cyfrowo.

7. **Brak telemetrii.** Ani teraz, ani po wydaniu opcjonalnego Actuna Engine. Jeśli telemetria kiedykolwiek powstanie, będzie dobrowolna (opt-in), domyślnie wyłączona, udokumentowana w tym pliku i ograniczona do metryk wydajności niezawierających danych osobowych.

8. **Niestandardowe schematy URL mają charakter wewnętrzny.** Renderer używa schematu `actunamail://` do wczytywania zasobów oraz pokrewnego schematu `actuna-attachment://`, który strumieniuje odszyfrowane obrazy osadzone w treści do ramki iframe wiadomości. Przestrzeń nazw `actunamail://ai/...` jest zarezerwowana na przyszłe, dobrowolne odnośniki głębokie do funkcji AI, działające w granicach wyznaczonych przez art. 5/52 AI Act.

Pełny dziennik sterylizacji — każdy usunięty endpoint, każdy zmieniony plik, każda załatana linia kodu — jest udokumentowany w [`COMPLIANCE.md`](COMPLIANCE.md); historia poszczególnych wydań znajduje się w [`CHANGELOG.md`](CHANGELOG.md).

## Kopie zapasowe i przywracanie

Katalog danych aplikacji (`~/Library/Application Support/ActunaMail/` na macOS, odpowiedniki na innych systemach) zawiera zaszyfrowaną bazę `edgehill.db`, zaszyfrowane załączniki w `files/` oraz `db-key.enc` — klucz bazy SQLCipher opakowany przez magazyn poświadczeń systemu za pośrednictwem Electron `safeStorage`.

**Tworzenie kopii zapasowej tego katalogu jest bezpieczne.** Choć kopia obejmuje `db-key.enc`, klucza w środku nie da się odczytać bez systemowego magazynu poświadczeń, a ten jest związany z maszyną/profilem i nie synchronizuje się z chmurą:

- **macOS** — `os_crypt` Chromium (z którego korzysta `safeStorage`) zapisuje klucz „Safe Storage" przez `crypto::AppleKeychain`, czyli starsze API generic-password `SecKeychain*`. Wpisy starszego pęku kluczy strukturalnie **nie** podlegają synchronizacji z iCloud — `kSecAttrSynchronizable` to atrybut wyłącznie nowoczesnego API `SecItem*` (data-protection keychain) i nie da się go ustawić na wpisach starszego typu. Klucz Safe Storage nigdy nie trafia do iCloud Keychain.
- **Windows** — DPAPI (`CryptProtectData`), w zasięgu profilu użytkownika Windows.
- **Linux** — Secret Service (GNOME Keyring / KWallet), lokalny dla maszyny.

Kopia `db-key.enc` w backupie chmurowym (Time Machine, iCloud Drive, Dropbox, OneDrive) jest więc na innej maszynie nieczytelnym szyfrogramem — przywrócenie katalogu gdzie indziej **nie** ujawnia treści poczty.

Wynikają z tego dwie konsekwencje:

1. **Przywrócenie profilu na innej maszynie nie otworzy bazy** — klucz opakowujący żyje w magazynie poświadczeń pierwotnej maszyny. To kompromis dostępności, nie wyciek poufności; poczta zsynchronizuje się ponownie z serwera IMAP. Dla przywracania niezależnego od maszyny należy włączyć **Tier B** (hasło główne): hasło główne odszyfrowuje klucz bazy na dowolnej maszynie, a kod odzyskiwania wydany przy konfiguracji jest ścieżką ratunkową.
2. **Dla poufności wobec atakującego z tego samego konta** (malware działające na koncie użytkownika może odczytać magazyn poświadczeń) Tier A nie wystarcza — należy włączyć **Tier B**.

`db-key.enc` jest celowo trzymany razem z `edgehill.db` w katalogu profilu: przeniesienie go poza typowy zasięg backupu zepsułoby atomowość kopii/przywracania profilu, nie dając korzyści w zakresie poufności (sam szyfrogram bez magazynu poświadczeń maszyny jest bezużyteczny). Zob. ticket #46 (Tier B) — ścieżka hasła głównego.

## Logi i dziennik audytowy at-rest

W odróżnieniu od bazy danych i załączników, log diagnostyczny (`<logs>/<data>.log`) oraz opcjonalny dziennik audytowy (`<config>/audit/<data>.audit.log`) zapisywane są jako pliki **tekstowe**. Po redakcji nie niosą już poświadczeń, ale nadal zawierają dane osobowe w rozumieniu RODO — identyfikatory kont, nazwy dostawców, zahaszowany adres e-mail i tekst wiadomości w polu `msg`. To jedyny artefakt PII at-rest poza szyfrowaniem SQLCipher / AES-GCM.

- **Ochrona at-rest** — logi należy chronić włączając szyfrowanie całego wolumenu (FileVault na macOS, BitLocker na Windows, LUKS na Linux). ActunaMail nie szyfruje plików logów osobno; szyfrowanie wolumenu jest oczekiwanym środkiem. Wdrożenia regulowane powinny objąć katalog logów i audytu swoimi środkami ochrony danych.
- **Bypass redakcji tylko w buildzie dev** — warstwę redakcji można wyłączyć przez `ACTUNA_LOG_LEVEL=debug` na potrzeby debugowania, ale wyłącznie w niespakowanym buildzie **dev**. Spakowany build produkcyjny zawsze redaguje, nawet gdy ta zmienna środowiskowa jest ustawiona — sama zmienna nie ujawni poświadczeń w wydanej aplikacji.
- **Retencja dziennika audytowego** — pliki audytu rotują się dziennie; pliki starsze niż 90 dni są automatycznie usuwane. Ten lokalny domyślny limit ogranicza zużycie dysku; podmiot wdrażający ustala własny prawny okres retencji i — gdy potrzebuje dłuższej retencji lub tamper-evidence — powinien przekazywać pliki audytu do swojego SIEM / systemu archiwizacji. Lokalny dziennik jest append-only z konwencji, ale **nie** jest kryptograficznie odporny na manipulację (tamper-evident).
- **Kanał IPC `actuna-log`** — linie logu renderera są przekazywane do procesu głównego kanałem IPC `actuna-log`, który dopisuje je do współdzielonego pliku logu. Skompromitowany renderer mógłby wpisać do logu dowolny string. To ryzyko niskiej wagi: renderer i tak wykonuje kod aplikacji, a log jest wyłącznie lokalny. Odnotowane tu dla kompletności modelu zagrożeń.

> **Nota dla zespołu** (nie-compliance): reguła `BASE64_VALUE` warstwy redakcji maskuje każdy samodzielny string dłuższy niż 40 znaków base64. Może to maskować także długie *legalne* identyfikatory niebędące sekretami (np. fragment Message-ID czy granicę MIME). To celowy bias fail-safe — nadmiarowa redakcja nie-sekretu jest lepsza niż wyciek sekretu.

## Co domyślnie wychodzi do sieci

| Cel | Przeznaczenie | Kiedy |
|---|---|---|
| Twój serwer IMAP / SMTP | Podstawowy protokół poczty | Gdy aplikacja działa z aktywnymi kontami |
| Twój serwer CalDAV / CardDAV | Synchronizacja kalendarza i kontaktów | Gdy skonfigurowano |
| `accounts.google.com`, `oauth2.googleapis.com` | Odświeżanie OAuth dla Gmaila | Gdy token konta Gmail wygaśnie |
| `login.microsoftonline.com`, `graph.microsoft.com` | Odświeżanie OAuth dla Microsoft 365 / Outlook | Gdy token M365 wygaśnie |
| `lh3.googleusercontent.com`, `lh*.ggpht.com` | Adresy URL awatarów zwracane w odpowiedziach OAuth | Podczas renderowania awatarów Google przekazanych w treści |

To pełna lista. Nie ma żadnych innych połączeń domyślnych. Jeśli Twój monitor sieciowy zauważy, że Actuna Mail łączy się z czymkolwiek innym, jest to błąd — prosimy o jego zgłoszenie.

**Punkt odniesienia z testów empirycznych:** raporty z regresji ruchu wychodzącego w czasie działania, dostępne w katalogu [`verification/`](verification/) (procedura KROK 5 — przechwytywanie tcpdump podczas świeżego uruchomienia oraz dłuższe, z aktywnym kontem IMAP/SMTP/CardDAV), potwierdzają **zero połączeń** z hostami zabronionymi: `*.getmailspring.com`, `*.sentry.io`, `*.gravatar.com`, `*.wp.com`. Profil ruchu wychodzącego jest weryfikowany ponownie po każdym wydaniu.

## Jak to zweryfikować

Niezależna weryfikacja jest sednem tego projektu. Udostępniamy:

- Pełny pakiet audytowy — zobacz katalog nadrzędny projektu pod adresem `tech@actuna.pl`.
- Skrypty tcpdump działające w czasie pracy aplikacji (w projekcie audytowym), które możesz uruchomić, aby potwierdzić zerowy nieautoryzowany ruch wychodzący.
- Różnice (diff) względem oryginalnego Mailspring 1.21.0.
- Powtarzalne kompilacje: zobacz instrukcję budowania w dokumentacji deweloperskiej tego repozytorium.

Jeśli cokolwiek w tym dokumencie jest niezgodne z zainstalowanym przez Ciebie programem, to program jest błędny. Prosimy o informację na adres `tech@actuna.pl`, abyśmy mogli to naprawić.

## Odpowiedzialne ujawnianie podatności

Jeśli uważasz, że Actuna Mail ma lukę bezpieczeństwa, napisz na adres `tech@actuna.pl`, podając możliwie najwięcej szczegółów. Prosimy o pozostawienie nam rozsądnego czasu na usunięcie problemu przed publikacją szczegółów. Potwierdzimy zgłoszenie w ciągu 48 godzin w dni robocze.

Jeśli uważasz, że jakaś zewnętrzna witryna z plikami do pobrania udostępnia nieoficjalną kompilację Actuna Mail pod naszą nazwą, prosimy o zgłoszenie tego na ten sam adres. Oficjalne kompilacje są podpisane cyfrowo i dystrybuowane wyłącznie z `actuna.pl`.

## Różnice względem oryginalnego pliku SECURITY.md Mailspring

Oryginalny plik SECURITY.md Mailspring, w trzech zdaniach, twierdzi, że:

> 1. *"Twoje dane uwierzytelniające poczty są bezpiecznie przechowywane w systemowym keychainie"*
> 2. *"Mailspring nie przesyła, nie przechowuje ani nie przetwarza Twojej poczty w chmurze"*
> 3. *"rezygnacja z Mailspring ID całkowicie uniemożliwia przesłanie Twoich danych poza Twoją maszynę"*

Stwierdzenie nr 1 jest prawdziwe w Mailspring 1.21.0.

Stwierdzenia nr 2 i nr 3 nie są prawdziwe w domyślnej instalacji Mailspring 1.21.0. Pełny materiał dowodowy — ścieżka pliku i numer linii dla każdej sprzecznej z nimi ścieżki kodu — znajduje się w [`AUDYT-MAILSPRING.md`](AUDYT-MAILSPRING.md) oraz w pakiecie audytowym. Stworzyliśmy fork właśnie po to, by wszystkie trzy stwierdzenia stały się prawdziwe w Actuna Mail.

Nie jest to krytyka Foundry 376. Wycieki narastały przez lata rozwoju funkcji; każdy z nich z osobna miał swoje uzasadnienie. Zdecydowaliśmy się na fork, zamiast przenosić ten sam balast do produktu sprzedawanego organizacjom związanym obowiązkami wynikającymi z GDPR, KNF i NIS2.

## Historia wydań

Zmiany istotne dla bezpieczeństwa w poszczególnych wydaniach są odnotowane w [`CHANGELOG.md`](CHANGELOG.md).

---

*Przeglądane przy każdym wydaniu oraz zawsze, gdy zmienia się tabela endpointów lub warstwa sterylizacji.*
