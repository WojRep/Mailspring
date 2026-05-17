# Zgodność

[English](COMPLIANCE.md) · **Polski**

Actuna Mail został zaprojektowany tak, by zapewnić możliwą do obrony zgodność z czterema nakładającymi się reżimami regulacyjnymi, które dotyczą organizacji działających w Polsce i Unii Europejskiej:

- **GDPR** — Rozporządzenie (UE) 2016/679, z polską implementacją w *ustawie o ochronie danych osobowych* (10 maja 2018 r.) oraz nadzorczą rolą Urzędu Ochrony Danych Osobowych (UODO).
- **AI Act** — Rozporządzenie (UE) 2024/1689.
- **KNF** — wytyczne Komisji Nadzoru Finansowego, w szczególności Rekomendacja D (zarządzanie obszarem IT), Rekomendacja Z (ryzyko związane z outsourcingiem) oraz *Komunikat dotyczący przetwarzania przez podmioty nadzorowane informacji w chmurze obliczeniowej* z 23 stycznia 2020 r.
- **NIS2** — Dyrektywa (UE) 2022/2555, z polską implementacją w ramach *Krajowego Systemu Cyberbezpieczeństwa 2.0*.

Niniejszy dokument stanowi roboczą mapę zgodności pomiędzy **faktycznym kodem w tym repozytorium** a **konkretnymi przepisami czterech reżimów**. Nie jest opinią prawną i nie zastępuje oceny skutków dla ochrony danych (DPIA), oceny skutków transferu (TIA) ani porady wykwalifikowanego prawnika. Ma być na tyle precyzyjny, by audytor lub inspektor ochrony danych (IOD) mógł zweryfikować każde z zawartych w nim twierdzeń.

## Jak zorganizowany jest ten dokument

Dla każdego reżimu wymieniamy przepisy, które mają zastosowanie do desktopowego klienta poczty tego rodzaju. Dla każdego przepisu podajemy:

- **Czego wymaga regulacja.** Krótkie, wierne streszczenie.
- **Co robi wyjściowy Mailspring 1.21.0.** Ze ścieżką pliku i numerem linii.
- **Co robi Actuna Mail.** Z odniesieniem do odpowiedniej zmiany (patcha).
- **Weryfikacja.** Jak audytor może to potwierdzić.

Każde twierdzenie z sekcji „co robi wyjściowy Mailspring" pochodzi z audytu przeprowadzonego w projekcie nadrzędnym tego forka. Sam audyt jest odtwarzalny — wystarczy sklonować Mailspring 1.21.0 na commicie `561a81a3` i uruchomić te same polecenia grep. Świadomie czynimy ten kontrast weryfikowalnym, a nie wyłącznie retorycznym.

---

## GDPR / RODO

### Art. 5 ust. 1 lit. a — Zgodne z prawem, rzetelne i przejrzyste przetwarzanie

**Wymóg.** Dane osobowe muszą być przetwarzane zgodnie z prawem, rzetelnie i w sposób przejrzysty dla osoby, której dane dotyczą.

**Mailspring 1.21.0.** Domyślna instalacja kontaktuje się z co najmniej dziesięcioma odrębnymi punktami końcowymi (zob. [SECURITY.md](SECURITY.md) oraz [AUDYT-MAILSPRING.md](AUDYT-MAILSPRING.md)) bez uprzedniego poinformowania użytkownika w ramach pierwszego uruchomienia aplikacji. Dokument SECURITY.md dystrybuowany ze źródłami obiecuje zachowanie, którego sam plik wykonywalny nie realizuje.

**Actuna Mail.** Wszystkie dziesięć kanałów wychodzących jest domyślnie usuniętych. Repozytorium zawiera atomowe commity — po jednym na każdy kanał — z których każdy wskazuje numery linii w kodzie wyjściowym, które zostały zmienione. Plik SECURITY.md jest wierny rzeczywistemu zachowaniu pliku wykonywalnego.

**Weryfikacja.** Uruchom skrypty tcpdump dostarczone z projektem audytowym, w trybie `post-patch`, na buildzie tego repozytorium. Oczekiwany wynik: zero żądań do `*.getmailspring.com`, `*.sentry.io`, `*.gravatar.com`, `*.wp.com` przez cały czas życia procesu.

### Art. 5 ust. 1 lit. c — Minimalizacja danych

**Wymóg.** Dane osobowe muszą być adekwatne, stosowne oraz ograniczone do tego, co niezbędne do celów, w których są przetwarzane.

**Mailspring 1.21.0.**
- `IdentityStore` odpytuje `/api/me` co 10 minut przez cały czas działania aplikacji, nawet jeśli tożsamość nie uległa zmianie.
- `SendFeatureUsageEventTask` jest kolejkowane za każdym razem, gdy używana jest funkcja Pro — nawet w planie Basic, gdzie po stronie serwera nie obowiązuje żaden limit do wyegzekwowania.
- Połączenie strumieniowe pod adresem `/deltas/<accountId>/streaming?ih=<imapHost>` przenosi adres serwera IMAP użytkownika jako parametr URL przez cały czas trwania sesji.

**Actuna Mail.** Odpytywanie tożsamości zostało usunięte. `SendFeatureUsageEventTask` zostało usunięte. Połączenie strumieniowe zostało usunięte (koncepcja Mailspring ID została usunięta w całości; zob. art. 7).

**Weryfikacja.** `grep -rn "fetchIdentity\|SendFeatureUsageEventTask\|MetadataWorker" app/ mailsync/MailSync/` nie zwraca nic istotnego.

### Art. 6 — Podstawa prawna

**Wymóg.** Każda operacja przetwarzania musi mieć podstawę prawną (zgoda, umowa, obowiązek prawny, żywotne interesy, zadanie realizowane w interesie publicznym lub prawnie uzasadnione interesy).

**Mailspring 1.21.0.** Sentry, Gravatar, `logo.getmailspring.com`, odpytywanie tożsamości, Plugin Metadata Sync, `/api/resolve-dav-hosts` oraz webview onboardingu działają domyślnie. Żadna z tych operacji nie ma jawnie ujawnionej w interfejsie aplikacji podstawy prawnej. Argument, że raportowanie błędów stanowi prawnie uzasadniony interes na podstawie art. 6 ust. 1 lit. f, nie przechodzi testu równowagi, gdy dane są wysyłane do Stanów Zjednoczonych bez umowy powierzenia (DPA), bez TIA i bez możliwości rezygnacji — tym bardziej w świetle obietnicy zawartej w SECURITY.md, która stanowi inaczej.

**Actuna Mail.** Operacje przetwarzania, których podstawa prawna budzi wątpliwości, zostały usunięte. Pozostaje:
- Ruch IMAP / SMTP / CalDAV / CardDAV do wybranego przez użytkownika dostawcy poczty (art. 6 ust. 1 lit. b — wykonanie umowy).
- Odświeżanie tokenów OAuth wobec Google / Microsoft (art. 6 ust. 1 lit. b).
- To cała lista.

**Weryfikacja.** Porównaj tabelę adresów sieciowych w SECURITY.md z wynikiem tcpdump uzyskanym w czasie działania aplikacji.

### Art. 7 ust. 2 — Warunki wyrażenia zgody

**Wymóg.** Zgoda musi być dobrowolna, konkretna, świadoma i jednoznaczna, a prośba o jej wyrażenie musi być wyraźnie odróżniona od pozostałych kwestii.

**Mailspring 1.21.0.** `app/internal_packages/onboarding/lib/newsletter-signup.tsx:67-72` wywołuje `POST /newsletter` z metody `componentDidMount`. Nie ma żadnego pola wyboru, żadnego okna dialogowego opt-in, żadnego rejestru zgód. Każdy użytkownik, który ukończy onboarding, zostaje zapisany.

**Actuna Mail.** Moduł zapisu do newslettera został usunięty w całości. Nie ma żadnego newslettera, do którego można by się zapisać.

**Weryfikacja.** `ls app/internal_packages/onboarding/lib/newsletter*` nie zwraca żadnych plików.

### Art. 13 / 14 — Informowanie osób, których dane dotyczą

**Wymóg.** Przy pozyskiwaniu danych osobowych administrator musi w momencie zbierania danych przekazać informacje o swojej tożsamości, celach, podstawie prawnej, odbiorcach, okresie przechowywania, prawach itd.

**Mailspring 1.21.0.** SECURITY.md jest najbliższym odpowiednikiem klauzuli informacyjnej w aplikacji, a nie odpowiada on kodowi. Polityka prywatności pod adresem `getmailspring.com/privacy-policy` jest dostępna wyłącznie po opuszczeniu aplikacji.

**Actuna Mail.** SECURITY.md został przeredagowany tak, by odpowiadać rzeczywistemu zachowaniu pliku wykonywalnego. Sam plik wykonywalny nie zbiera danych osobowych w żadnym celu innym niż połączenie użytkownika z jego własnym dostawcą poczty, dzięki czemu obciążenie wynikające z art. 13/14 jest drastycznie mniejsze niż w wyjściowym Mailspringu. Gdy zostanie wdrożony opcjonalny Actuna Engine, router AI wyświetli przy pierwszym użyciu własną klauzulę informacyjną.

### Art. 25 — Ochrona danych w fazie projektowania oraz domyślna ochrona danych

**Wymóg.** Należy domyślnie wdrożyć odpowiednie środki techniczne i organizacyjne, tak aby przetwarzane były wyłącznie dane osobowe niezbędne do osiągnięcia każdego konkretnego celu.

**Mailspring 1.21.0.** Stan domyślny to „wszystko włączone" — Sentry, raportowanie awarii, Gravatar, odpytywanie tożsamości, każdy załadowany plugin Pro. Użytkownik musi podjąć działanie, aby zrezygnować z kanałów, o których nie został poinformowany.

**Actuna Mail.** Stan domyślny to „nic nie jest włączone poza tym, co niezbędne do dostarczania poczty". To właśnie jest standard z art. 25.

### Art. 28 — Relacje z podmiotem przetwarzającym

**Wymóg.** Gdy administrator korzysta z podmiotu przetwarzającego, musi istnieć pisemna umowa (DPA) obejmująca kwestie wymienione w art. 28 ust. 3.

**Mailspring 1.21.0.** Każde zapytanie do Gravatara angażuje Automattic, Inc. jako stronę trzecią przetwarzającą dane osobowe *kontaktów użytkownika* (adres e-mail kontaktu jest haszowany i wysyłany). Bez umowy powierzenia (DPA) pomiędzy użytkownikiem Mailspringa (działającym jako administrator) a Automattic jest to przetwarzanie pozbawione podstawy. To samo dotyczy Sentry (Functional Software, Inc.) w odniesieniu do śladów stosu i odcisków urządzeń.

**Actuna Mail.** Oba podmioty przetwarzające zostały usunięte. W konfiguracji domyślnej nie występuje żaden zewnętrzny podmiot przetwarzający.

### Art. 32 — Bezpieczeństwo przetwarzania

**Wymóg.** Odpowiednie środki techniczne i organizacyjne, w tym — w stosownych przypadkach — pseudonimizacja i szyfrowanie danych osobowych.

**Mailspring 1.21.0.** Dane uwierzytelniające konta są prawidłowo umieszczane w pęku kluczy systemu operacyjnego. Treści wiadomości są przechowywane w jawnym SQLite (`MessageBody.value TEXT`), a indeks wyszukiwania pełnotekstowego (`ThreadSearch` fts5) przechowuje `subject, to_, from_, body` jako tekst jawny. Pliki załączników są przechowywane w postaci jawnej. Brak jest jakiegokolwiek szyfrowania w spoczynku na warstwie aplikacji.

**Actuna Mail.** Obsługa danych uwierzytelniających w pęku kluczy systemu operacyjnego została odziedziczona (dobrze). Lokalna baza danych `edgehill.db` jest **szyfrowana w spoczynku przy użyciu SQLCipher** (AES-256-CBC + HMAC) — Tier A: losowy 32-bajtowy klucz generowany przy pierwszym uruchomieniu, chroniony przez pęk kluczy systemu operacyjnego za pośrednictwem mechanizmu Electron `safeStorage`, domyślnie włączony dla nowych instalacji, wykorzystywany zarówno przez renderer, jak i przez silnik `mailsync` w C++. Obejmuje to treści wiadomości, indeks wyszukiwania FTS, kontakty i kalendarze. Tier B (opcjonalne hasło główne → funkcja KDF Argon2id, na potrzeby restrykcyjnej interpretacji wymogów KNF) jest śledzony jako pozycja w backlogu. **Pliki załączników** w katalogu `files/` są **również szyfrowane w spoczynku** (AES-256-GCM per plik, klucz wyprowadzany przez HKDF-SHA256 z tego samego DBKey), co zostało zaimplementowane zarówno w rendererze, jak i w silniku `mailsync` w C++. Szyfrowanie w spoczynku na warstwie aplikacji obejmuje bazę danych oraz pliki załączników; nie pozostaje żadna luka w zakresie danych w spoczynku. Raporter awarii, który wcześniej wysyłał pamięć procesu do Stanów Zjednoczonych, został usunięty.

### Art. 35 — DPIA (ocena skutków dla ochrony danych)

**Wymóg.** Jeżeli przetwarzanie może powodować wysokie ryzyko, przed jego rozpoczęciem wymagane jest przeprowadzenie oceny skutków dla ochrony danych (DPIA).

**Actuna Mail.** Treść poczty elektronicznej jest z definicji wrażliwa (rutynowo zawiera dane szczególnych kategorii oraz poufną korespondencję biznesową). Podmioty wdrażające Actuna Mail dla personelu obsługującego komunikację podlegającą regulacjom powinny przeprowadzić DPIA. W pakiecie zgodności udostępniamy szablon startowy obejmujący rzeczywiste przepływy danych w aplikacji.

### Art. 44 i nast. — Transfery do państw trzecich (Schrems II)

**Wymóg.** Transfery danych osobowych do państwa trzeciego są dopuszczalne wyłącznie na jednej z podstaw wskazanych w art. 45–49, przy zapewnieniu odpowiednich zabezpieczeń.

**Mailspring 1.21.0.** Każdy domyślny kanał poza własnym serwerem poczty użytkownika prowadzi do Stanów Zjednoczonych: Sentry (`o70907.ingest.us.sentry.io`), usługa tożsamości Foundry (`id.getmailspring.com`), Gravatar (Automattic), raporter awarii. Wyrok Schrems II wymaga przeprowadzenia oceny skutków transferu (TIA) przy oparciu się na standardowych klauzulach umownych; żadna taka ocena nie jest dostarczona.

**Actuna Mail.** Wszystkie domyślne transfery do Stanów Zjednoczonych zostały usunięte. Pozostałe miejsca docelowe to wybrany przez użytkownika dostawca poczty oraz wybrany przez użytkownika dostawca OAuth (Google lub Microsoft, gdzie transfery są regulowane odrębną relacją użytkownika z tym dostawcą).

---

## AI Act

### Art. 50 — Przejrzystość treści generowanych przez AI

**Wymóg.** Dostawcy generatywnych systemów AI muszą zapewnić, by tekst generowany przez AI — gdy jest publikowany w celu informowania opinii publicznej — był wykrywalny jako wygenerowany przez AI, a użytkownicy muszą być informowani, że wchodzą w interakcję z systemem AI.

**Actuna Mail.** W samym kliencie poczty nie ma żadnych funkcji AI.

**Actuna Engine (planowany).** Actuna Engine będzie kierował zapytania do własnej subskrypcji użytkownika w Claude lub Codex CLI. Wersje robocze tworzone lub edytowane z pomocą AI będą oznaczane w aplikacji jako takie. Oznaczenie będzie wysyłane na zasadzie opt-in (dosłownie pole wyboru „Oznacz jako napisane z pomocą AI" w edytorze wiadomości) i nigdy nie będzie dodawane w sposób ukryty.

### Art. 6 / Załącznik III — Klasyfikacja wysokiego ryzyka

**Mailspring 1.21.0 / Actuna Mail.** Żaden z systemów nie wykonuje którejkolwiek z czynności wymienionych w Załączniku III. Klasyfikacja wysokiego ryzyka na podstawie art. 6 nie ma zastosowania.

Gdy Actuna wdroży wsparcie AI, powrócimy do tej kwestii. Rutynowe wspomaganie redagowania poczty zasadniczo nie mieści się w Załączniku III, jednak podmioty działające w sektorach regulowanych (rekrutacja, kredyty, ubezpieczenia) powinny przeanalizować swój konkretny przypadek użycia.

---

## KNF

### Rekomendacja D — Obszary zarządzania IT

**Rekomendacja D**, w szczególności w częściach dotyczących klasyfikacji danych, łańcucha dostaw, zarządzania zmianą oraz zgłaszania incydentów, oczekuje od podmiotów nadzorowanych zarządzania systemami informatycznymi w oparciu o udokumentowane mechanizmy kontrolne.

**Actuna Mail — wkład.**
- Udokumentowana klasyfikacja danych: które pola stanowią dane osobowe (w `analysis/07-storage-static-analysis.md` projektu audytowego).
- Udokumentowany łańcuch dostaw: każdy zewnętrzny punkt końcowy znajduje się w [SECURITY.md](SECURITY.md), każda zależność npm w `package-lock.json`, każda zależność C++ w `mailsync/Vendor/` oraz `mailsync/vcpkg.json`.
- Zarządzanie zmianą: każda modyfikacja względem kodu wyjściowego to jeden atomowy, możliwy do osobnego przeglądu commit.
- Reagowanie na incydenty: udokumentowane w tym pliku w sekcji dotyczącej art. 23 NIS2.

### Rekomendacja Z — Ryzyko związane z outsourcingiem

**Rekomendacja Z** traktuje korzystanie z usług zewnętrznych do przetwarzania danych klientów jako relację outsourcingową, która wymaga oceny ryzyka, pisemnych umów, planów wyjścia oraz kontroli nad lokalizacją.

**Mailspring 1.21.0.** Domyślna instalacja nawiązuje relacje outsourcingowe z Sentry, Automattic (Gravatar) oraz Foundry 376 (Plugin Metadata Sync, tożsamość, raporty awarii), bez żadnej pisemnej umowy dostępnej dla podmiotu wdrażającego.

**Actuna Mail.** Wszystkie domyślne relacje outsourcingowe poza własnym dostawcą poczty użytkownika oraz wystawcą OAuth zostały usunięte.

### Komunikat KNF z 23 stycznia 2020 r. — Chmura jako istotny outsourcing

Komunikat z 2020 r. traktuje korzystanie z usług chmurowych jako istotny outsourcing dla nadzorowanych podmiotów finansowych. Wymaga on klasyfikacji ryzyka, planów wyjścia oraz — w niektórych przypadkach — powiadomienia KNF.

**Actuna Mail.** Brak jakiejkolwiek zależności od chmury dla domyślnych funkcji aplikacji. Dostawca poczty użytkownika oraz wystawca OAuth podlegają istniejącym uzgodnieniom podmiotu nadzorowanego z tymi dostawcami.

---

## NIS2

### Art. 21 — Środki zarządzania ryzykiem

**Wymóg.** Podmioty kluczowe i ważne muszą wdrożyć odpowiednie i proporcjonalne środki techniczne, operacyjne i organizacyjne, obejmujące m.in. (a) polityki analizy ryzyka, (b) obsługę incydentów, (c) bezpieczeństwo łańcucha dostaw, (d) bezpieczeństwo sieci, (e) kryptografię, (f) kontrolę dostępu, (g) zasoby ludzkie, (h) podstawową cyberhigienę i szkolenia, (i) polityki dotyczące stosowania kryptografii, (j) zero trust, (k) ciągłość działania, (l) bezpieczeństwo dostawców, (m) obsługę podatności, (n) ocenę skuteczności.

**Actuna Mail — wkład.**
- (c) Bezpieczeństwo łańcucha dostaw — pełna, udokumentowana i przefiltrowana lista zależności, brak telemetrii do dostawców z USA w konfiguracji domyślnej.
- (e), (i) Kryptografia — dane uwierzytelniające w pęku kluczy systemu operacyjnego (odziedziczone z Mailspringa, prawidłowo wykorzystane); lokalna baza danych szyfrowana przy użyciu SQLCipher, a pliki załączników przy użyciu AES-256-GCM (szyfrowanie w spoczynku na warstwie aplikacji, domyślnie włączone).
- (m) Obsługa podatności — proces odpowiedzialnego ujawniania udokumentowany w [SECURITY.md](SECURITY.md).

To samo w sobie nie spełnia wymogów art. 21 — podmiot wdrażający musi dołożyć środki organizacyjne wokół aplikacji — usuwa jednak przeszkody techniczne, które wprowadziłby wyjściowy Mailspring.

### Art. 23 — Zgłaszanie incydentów

**Wymóg.** Istotne incydenty muszą zostać zgłoszone do CSIRT lub właściwego organu w ciągu 24 godzin od powzięcia wiedzy (wczesne ostrzeżenie), wraz z pełniejszym zgłoszeniem w ciągu 72 godzin.

**Actuna Mail.** Aplikacja nie generuje własnych incydentów, jednak może zostać objęta incydentem w środowisku podmiotu wdrażającego. Udostępniamy:
- Szablon reagowania na incydenty w pakiecie zgodności.
- Gwarancję, że żadne informacje wewnętrzne nie są w sposób ukryty przekazywane do zewnętrznej usługi śledzenia błędów, nad którą podmiot nie ma kontroli.
- Lokalne logi awarii, do których własny proces forensyczny podmiotu ma dostęp bez angażowania Foundry, Sentry ani żadnej innej strony trzeciej.

### Art. 32 — Odpowiedzialność organów zarządzających

**Wymóg.** Organy zarządzające podmiotów kluczowych i ważnych muszą zatwierdzać środki zarządzania ryzykiem cyberbezpieczeństwa i nadzorować ich wdrażanie. Członkowie tych organów ponoszą osobistą odpowiedzialność.

**Komentarz.** Wdrożenie klienta poczty jest decyzją operacyjną; wybór *konkretnego* klienta poczty angażuje art. 32 jedynie wtedy, gdy ten wybór jest istotnie gorszy od alternatyw. Wybór klienta poczty, który domyślnie i bez ujawnienia tego faktu uruchamia dziesięć odrębnych kanałów wychodzących do Stanów Zjednoczonych, to rodzaj decyzji, której zarząd nie chciałby bronić przed regulatorem po incydencie. Wybór klienta, który tego nie robi, jest istotnie bezpieczniejszy.

---

## Szyfrowanie danych w spoczynku

Aplikacja szyfruje dane poczty w spoczynku na warstwie aplikacji — niezależnie od i jako uzupełnienie ewentualnego szyfrowania na poziomie wolumenu.

**Baza danych w spoczynku — ZASZYFROWANA (SQLCipher, Tier A).** Lokalna baza danych poczty `edgehill.db` jest szyfrowana w spoczynku przy użyciu SQLCipher (AES-256-CBC + HMAC). Zaszyfrowany zakres obejmuje:
- Pełne treści wiadomości w formacie HTML (`MessageBody.value`).
- Indeks wyszukiwania pełnotekstowego po polach temat / do / od / treść (`ThreadSearch` fts5) — zaszyfrowany na poziomie stron pamięci, dzięki czemu wyszukiwanie nadal działa.
- Pełną książkę kontaktów (`Contact` oraz `ContactSearch` fts5).
- Pełne wydarzenia kalendarza wraz z opisami (`Event` oraz `EventSearch` fts5).

Tier A: losowy 32-bajtowy klucz generowany przy pierwszym uruchomieniu, chroniony przez pęk kluczy systemu operacyjnego za pośrednictwem mechanizmu Electron `safeStorage`, domyślnie włączony dla nowych instalacji. Zweryfikowany kompleksowo (`scripts/test-tier-a-smoke.js`). Tier B (opcjonalne hasło główne → funkcja KDF Argon2id, na potrzeby restrykcyjnej interpretacji wymogów KNF) jest śledzony jako pozycja w backlogu.

**Załączniki na dysku — ZASZYFROWANE (format `AENC`).** `~/Library/Application Support/ActunaMail/files/<id>/<filename>` (ścieżka dla macOS; odpowiednia na innych systemach operacyjnych). Każdy plik załącznika jest szyfrowany przy użyciu AES-256-GCM (dyskowy format `AENC`: magiczna sygnatura + wersja + 96-bitowy nonce + szyfrogram + znacznik GCM). Klucz jest jednorazowo wyprowadzany przez HKDF-SHA256 z DBKey SQLCiphera — ten sam model zaufania co dla bazy danych, bez osobnego sekretu. Silnik `mailsync` w C++ szyfruje przy odbiorze przez IMAP i odszyfrowuje przy wysyłce; renderer szyfruje załączniki wersji roboczych i odszyfrowuje je na potrzeby zapisu / otwarcia / przeciągnięcia na zewnątrz / obrazów osadzonych / podglądów. Starsze, jawne załączniki sprzed wdrożenia tej funkcji nadal pozostają odczytywalne (płynna obsługa wstecz); nie ma osobnego przebiegu migracji (polityka dla nowych instalacji).

**Szyfrowanie na poziomie wolumenu** (FileVault / BitLocker / LUKS) pozostaje dobrym elementem obrony w głąb, lecz nie jest wymagane do zamknięcia jakiejkolwiek luki w szyfrowaniu w spoczynku na warstwie aplikacji — zarówno baza danych, jak i pliki załączników są szyfrowane niezależnie od niego.

**Rekomendacja D KNF / art. 21 NIS2.** Luka w szyfrowaniu w spoczynku, która była największą pojedynczą pozycją pomiędzy wczesnym forkiem a wdrożeniem możliwym do obrony przy restrykcyjnej interpretacji przepisów, została obecnie ZAMKNIĘTA — szyfrowanie na warstwie aplikacji obejmuje bazę danych (SQLCipher Tier A) oraz pliki załączników (AES-256-GCM). Uzasadnienie projektowe: `analysis/13-sqlcipher-migration-design.md`; audyt zweryfikowany na poziomie kodu: `analysis/15-storage-audit-code-verified.md`.

---

## Pakiet zgodności

Artefakty zgodności dostarczane wraz z projektem:

- Niniejszy dokument oraz [SECURITY.md](SECURITY.md).
- [AUDYT-MAILSPRING.md](AUDYT-MAILSPRING.md) — audyt wyjściowego Mailspringa linia po linii.
- Atomowa historia commitów tego repozytorium, z osobnym commitem na każdą zmianę.
- Pakiet audytowy w projekcie nadrzędnym.
- Raporty z weryfikacji ruchu wychodzącego w czasie działania aplikacji, w katalogu `verification/` projektu audytowego.

Planowane / w toku:

- Szablon DPIA dostosowany do przepływów danych Actuna Mail.
- Szablon TIA obejmujący transfery rezydualne (dostawcy OAuth, własny serwer poczty użytkownika).
- Szablon DPA dla roli Actuny w momencie wdrożenia wariantu hostowanego.
- SBOM (CycloneDX) zarówno dla aplikacji Electron, jak i dla silnika synchronizacji poczty w C++.
- Publiczna polityka prywatności na `actuna.pl`.
- Pakiet zgodności dla klientów na potrzeby wdrożeń KNF / NIS2.
- Certyfikat Apple Developer ID Application + notaryzacja (wstrzymane zgodnie z decyzją użytkownika — najpierw działająca aplikacja).

---

*Niniejszy dokument jest częścią Actuna Mail i jest objęty tą samą licencją co pozostałe źródła: GPL-3.0.*
