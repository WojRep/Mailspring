# Audyt — Mailspring 1.21.0

[English](AUDYT-MAILSPRING.md) · **Polski**

Ten dokument stanowi zapis przeprowadzonego linijka po linijce audytu bezpieczeństwa
[Foundry376/Mailspring](https://github.com/Foundry376/Mailspring) 1.21.0, który
stał się powodem powstania forka Actuna Mail. Streszczenie znajdziesz w projektowym
pliku [README.md](README.md); szczegóły opisano tutaj.

## Rozbieżność między SECURITY.md a kodem

Mailspring to szybki, dopracowany wizualnie klient poczty o otwartym kodzie. Sami
go używamy. Szanujemy pracę, jaką włożyło w niego Foundry 376. Istnieje jednak
rozbieżność między tym, co obiecuje jego
[SECURITY.md](https://github.com/Foundry376/Mailspring/blob/master/SECURITY.md),
a tym, co faktycznie robi jego kod.

SECURITY.md Mailspringa stwierdza w trzech zdaniach:

1. *"your email credentials are stored securely in your system keychain"*
2. *"Mailspring does not transmit, store or process your mail in the cloud"*
3. *"choosing to skip Mailspring ID prevents your data from being transmitted off your machine entirely"*

Przeprowadziliśmy audyt Mailspringa 1.21.0 linijka po linijce. Stwierdzenie nr 1
jest prawdziwe. Stwierdzenia nr 2 i nr 3 — nie; przynajmniej nie w takim sensie,
w jakim odczyta je użytkownik. Domyślna instalacja Mailspringa nawiązuje połączenie
z co najmniej:

- **Sentry (USA)** — każdy raport o błędzie, wraz ze śladami stosu, identyfikatorami pluginów oraz wartością SHA-256 adresu MAC pełniącą rolę odcisku urządzenia. Zaszyty na stałe DSN, brak możliwości rezygnacji, brak zgody, brak umowy powierzenia.
- **Natywny reporter awarii (USA)** — minidumpy pamięci procesu wysyłane przy każdej awarii pod `id.getmailspring.com/report-crash`. Pamięć może zawierać hasła, tokeny i wersje robocze wiadomości.
- **`id.getmailspring.com/onboarding`** — webview ładowany przy pierwszym uruchomieniu, **zanim** użytkownik kliknie "Skip".
- **Zapis do newslettera** — `componentDidMount` wykonuje `POST /newsletter`. Brak pola zgody (opt-in).
- **Gravatar (Automattic, USA)** — `https://www.gravatar.com/avatar/<sha256(email)>` dla każdego renderowanego kontaktu. Każde zapytanie ujawnia stronie trzeciej adres e-mail odpowiedniego kontaktu.
- **`logo.getmailspring.com`** — logotypy firm w stopkach, wyszukiwane na podstawie domeny adresu e-mail użytkownika.
- **Synchronizacja metadanych pluginów** — `id.getmailspring.com/metadata/...` oraz długo utrzymywany strumień HTTP `/deltas/.../streaming?ih=<your-imap-host>`. Na potrzeby funkcji Pro (drzemka, wysyłka z opóźnieniem, śledzenie, udostępnianie). Obejmuje adresy IP odbiorców (śledzenie otwarć/kliknięć) oraz Twój host IMAP przekazywany jako parametr URL.
- **Odpytywanie tożsamości** — `/api/me` co 10 minut przez cały czas działania aplikacji.
- **Send Feature Usage Event** — każde użycie funkcji Pro, nawet w planie Basic.

Do tego dwa kolejne kanały, które wyszły na jaw podczas głębszego audytu kodu C++:

- **`/api/resolve-dav-hosts`** — wysyła `{ domain, imapHost }` przy dodawaniu kont z CardDAV/CalDAV, **nawet bez Mailspring ID**.
- **`/ping`** w trybie sprawdzania instalacji.

Daje to **dziesięć odrębnych kanałów wycieku danych** do serwerów w Stanach
Zjednoczonych. Kilka z nich przenosi dane osób trzecich (Twoich kontaktów, Twoich
odbiorców), które nigdy nie wyraziły na to zgody. W świetle art. 6 GDPR — a w
Polsce w świetle ustawy o ochronie danych osobowych i stanowiska Urzędu Ochrony
Danych Osobowych (UODO) — jest to co najmniej naruszenie obowiązku przejrzystości
(art. 13, 25), a miejscami także brak podstawy prawnej przetwarzania (art. 6, 7,
28, 32, 44 i nast.).

Nie sądzimy, by Foundry 376 zamierzało kogokolwiek wprowadzać w błąd. Wycieki
narastały w sposób naturalny przez lata rozwoju kolejnych funkcji — Sentry dodano
do diagnozowania awarii, Gravatar dla wizualnego dopracowania, synchronizację
metadanych pluginów na potrzeby planu Pro. Każdy z tych elementów z osobna miał
sens. Powstała z nich całość przestała jednak odpowiadać treści SECURITY.md.
Stworzyliśmy fork, by dostarczyć doświadczenie opisane w SECURITY.md — dla
użytkowników, którzy muszą się na nim oprzeć.

## Co zmieniamy względem oryginalnego Mailspringa

W jednym zdaniu: **wycinamy każdy domyślny kanał, który wysyła Twoje dane, Twoje
metadane lub dane Twoich kontaktów do strony trzeciej.** Szczegóły w
[COMPLIANCE.md](COMPLIANCE.md).

| Kanał | Stan w Mailspring 1.21.0 | Stan w Actuna Mail |
|---|---|---|
| Raportowanie błędów do Sentry | Zaszyte na stałe, bez możliwości rezygnacji | Usunięte |
| Natywny reporter awarii (`id.getmailspring.com/report-crash`) | Zawsze aktywny | Usunięty |
| Automatyczny zapis do newslettera | Automatyczna subskrypcja w `componentDidMount` | Usunięty |
| Zapytania do Gravatara dla każdego kontaktu | Zawsze aktywne | Usunięte (lokalny fallback) |
| Logo firmy z `logo.getmailspring.com` | Zawsze aktywne w stopkach | Usunięte |
| Synchronizacja metadanych pluginów (funkcje Pro) | Zawsze aktywna przy Mailspring ID | Usunięta (brak koncepcji Mailspring ID) |
| Odpytywanie tożsamości `/api/me` co 10 min | Zawsze aktywne przy ID | Usunięte |
| `SendFeatureUsageEventTask` przy każdym użyciu funkcji | Zawsze aktywne | Usunięte |
| `/api/resolve-dav-hosts` (mailsync C++) | Automatyczne przy konfiguracji CardDAV/CalDAV | Usunięte (konfiguracja ręczna) |
| `/ping` — sprawdzanie instalacji (mailsync C++) | Po kliknięciu przycisku Test | Usunięte |
| Konto Mailspring ID i webview onboardingu | Domyślny przepływ | Całkowicie usunięte |
| Kanał automatycznych aktualizacji `updates.getmailspring.com` | Domyślny | Wyłączony do czasu uruchomienia własnego kanału |
| 8 pluginów wymagających Mailspring ID | Domyślnie dostępne | Usunięte (activity, link/open-tracking, participant-profile, send-reminders, thread-sharing, thread-snooze, translation) |
| `composer-grammar-check` (wysyła wersje robocze do LanguageTool przez Foundry) | Domyślnie wyłączone, opt-in | Usunięte |

Stan wycieków danych jest empirycznie weryfikowany ponownie po każdym wydaniu —
zobacz raporty regresyjne z testów ruchu wychodzącego w katalogu `verification/`.
