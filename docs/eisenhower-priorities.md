# Priorytety w ActunaMail — macierz Eisenhowera + kolory ISO 3864

Krótki przewodnik: jak działają priorytety, jak kolory flag mapują na ćwiartki
i skąd biorą się kolory. Wersja użytkowa tego dokumentu jest też **w aplikacji**:
Preferencje → Tagi → „Jak działa macierz Eisenhowera?".

## Macierz Eisenhowera (Q1–Q4)

Zadania ocenia się na dwóch osiach: **ważność** i **pilność**. Daje to cztery
ćwiartki, każda z zalecaną akcją:

| Ćwiartka | Oś | Akcja (PL / EN) | Kolor ISO 3864 |
|---|---|---|---|
| **Q1** | Pilne **i** ważne | **Zrób teraz / Do now** | Czerwony (Signal Red, RAL 3001, `#9B2423`) |
| **Q2** | Ważne, niepilne | **Zaplanuj / Schedule** | Niebieski (Signal Blue, RAL 5005, `#005387`) |
| **Q3** | Pilne, nieważne | **Deleguj / Delegate** | Żółty (Signal Yellow, RAL 1003, `#F9A900`) |
| **Q4** | Niepilne i nieważne | **Odłóż / Defer** | Zielony (Signal Green, RAL 6032, `#237F52`) |

> **Q4 = „Odłóż", nie „Usuń".** Nic nie kasujemy automatycznie — zadania z Q4
> z czasem migrują do innych ćwiartek, a kasacja gubiłaby je z obserwacji.

## Jak używać

1. Oflaguj wiadomość kolorem (pasek narzędzi → flaga). Kolor flagi Apple
   automatycznie wpada do właściwej ćwiartki (mapowanie domyślnie włączone).
2. W panelu bocznym sekcja **Priorytety** pokazuje ćwiartki w kolorach ISO —
   klik filtruje wiadomości danej ćwiartki.
3. Mapowanie flaga → ćwiartka:
   - Czerwona (= gwiazdka) → **Q1 Zrób teraz**
   - Niebieska → **Q2 Zaplanuj**
   - Żółta / Pomarańczowa → **Q3 Deleguj**
   - Zielona / Szara → **Q4 Odłóż**
   - Purpurowa → **Q2** (konwencja — fiolet nie ma standardu ISO)
4. Wyłączenie auto‑mapowania: ustawienie `core.flags.mapToPriority = false`
   (wtedy panel pokazuje osobną sekcję „Flags" do filtrowania po samym kolorze).

## Skąd kolory? (ISO 3864 / RAG)

Znaczenie kolorów nie jest naszym wymysłem — opiera się na standardach koloru:

- **ISO 3864 / ANSI Z535** (kolory bezpieczeństwa, prawo międzynarodowe):
  czerwony = niebezpieczeństwo/krytyczny, żółty = ostrzeżenie/uwaga,
  zielony = bezpieczny/OK, niebieski = informacja/nakaz.
- **RAG (Red‑Amber‑Green)** i **sygnalizacja świetlna**: czerwony = krytyczny,
  żółty = uwaga, zielony = OK.
- **Ważne:** standard IMAP kolorowych flag (IETF draft‑eggert‑mailflagcolors)
  definiuje tylko bity→kolor, **nie** znaczenie. Żaden klient poczty nie nadaje
  kolorom znaczenia — oparcie o ISO 3864 jest wyróżnikiem ActunaMail.
- **Dostępność (WCAG 1.4.1):** kolor nigdy nie jest jedynym nośnikiem — przy
  każdej fladze pokazujemy też tekst akcji (np. „Czerwona — Zrób teraz").

## Materiały (wolne / open, CC BY‑SA)

- Wikipedia — *Time management → Eisenhower method*:
  <https://en.wikipedia.org/wiki/Time_management#Eisenhower_method>
- Wikipedia — *ISO 3864* (kolory bezpieczeństwa):
  <https://en.wikipedia.org/wiki/ISO_3864>

(Cytat przypisywany D. Eisenhowerowi, 1954: „I have two kinds of problems, the
urgent and the important. The urgent are not important, and the important are
never urgent.")
