# Współpraca przy Actuna Mail

[English](CONTRIBUTING.md) · **Polski**

Actuna Mail to fork Mailspring 1.21.0 utwardzony pod kątem zgodności, obecnie na etapie pre-alpha.

## Pull requesty

Na etapie pre-alpha **nie przyjmujemy zewnętrznych pull requestów**. Kod zmienia się szybko, a każda zmiana jest powiązana z ticketem audytowym.

## Niezależna weryfikacja

Weryfikowalność jest sednem tego projektu. Chętnie przyjmujemy:

- **Odtworzenie audytu.** [AUDYT-MAILSPRING.md](AUDYT-MAILSPRING.md) dokumentuje każdy kanał egress usunięty z upstreamowego Mailspring; metoda jest odtwarzalna.
- **Sprawdzenie egress w czasie działania.** Samodzielne potwierdzenie, że build nie wysyła ruchu do hostów stron trzecich — zobacz [SECURITY.md](SECURITY.md).
- **Zgłoszenia błędów i ustalenia bezpieczeństwa.** Pisz na `tech@actuna.pl`. W sprawie podatności bezpieczeństwa stosuj proces odpowiedzialnego ujawniania opisany w [SECURITY.md](SECURITY.md).

Prosimy **nie** zakładać zgłoszeń (issues) na GitHubie na etapie pre-alpha — kanałem kontaktu jest e-mail.

## Budowanie ze źródeł

Instrukcje budowania znajdują się w dokumentacji deweloperskiej repozytorium (`CLAUDE.md` oraz skrypty budujące w `app/build/`). W skrócie: `npm install`, następnie `npm start` dla trybu deweloperskiego lub `npm run build` dla buildu produkcyjnego.

## Kodeks postępowania

Projekt jest wydany z Kodeksem postępowania dla kontrybutorów ([Code of Conduct](CODE_OF_CONDUCT.md)). Uczestnicząc, zobowiązujesz się go przestrzegać.

## Kontakt

`tech@actuna.pl`
