# Lokalizacja / Internacjonalizacja

[English](LOCALIZATION.md) · **Polski**

> System lokalizacji Actuna Mail jest odziedziczony z Mailspring — Actuna Mail to fork Mailspring 1.21.0. Ten dokument opisuje, jak działa on w Actuna Mail.

Actuna Mail obsługuje lokalizację — menu, komunikaty, przyciski i pozostałe elementy interfejsu są ładowane z plików językowych na podstawie ustawień regionalnych użytkownika. Dzięki temu aplikacja jest dostępna dla ludzi na całym świecie i naturalnie wpasowuje się w pulpit.

Lokalizacja w wielu językach to wyzwanie, a tłumaczenie automatyczne często słabo radzi sobie z tekstem technicznym. Pierwsze tłumaczenie na ~90 języków wykonał projekt upstreamowy Mailspring, korzystając z bazy przetłumaczonych przez ludzi terminów pocztowych i zwrotów technicznych (np. „Archive", „Send message") uzupełnionej tłumaczeniem maszynowym. Jeśli używasz komputera w innym języku i znasz angielski, poprawianie tłumaczeń to dobry sposób, by pomóc.

## Wkład w lokalizację

Pliki lokalizacji znajdują się w `app/lang`, nazwane zgodnie ze standardem znaczników języka BCP 47 / ISO 639. Jeśli nie masz pewności, który znacznik dotyczy Twojego języka, sprawdź [tabelę ISO 639-1](http://www.loc.gov/standards/iso639-2/php/English_list.php).

Każdy plik to słownik JSON mapujący ciąg angielski na ciąg przetłumaczony. Na przykład:

```
{
  "%@ of %@": "%1$@ de %2$@",
  "Accept": "Aceptar",
  "Account": "Cuenta",
  "Moved to %@": "Movido a %@"
}
```

Przykład pokazuje podstawianie zmiennych. Niektóre ciągi wyświetlają tekst podany przez użytkownika, np. nazwę folderu; symbole zastępcze (`%@`) reprezentują ten tekst. Jeśli ciąg zawiera wiele symboli zastępczych, można odwołać się do nich po indeksie składnią `%2$@` — `2` oznacza drugi symbol zastępczy z ciągu angielskiego. Pozwala to zmienić kolejność zmiennych, co ma znaczenie w językach takich jak japoński.

Na etapie pre-alpha Actuna Mail nie przyjmuje zewnętrznych pull requestów (zobacz [CONTRIBUTING.md](CONTRIBUTING.md)); poprawki lokalizacji są mile widziane e-mailem na `tech@actuna.pl`.

## Uruchamianie Actuna Mail z określoną lokalizacją

Aby uruchomić aplikację z konkretną lokalizacją, podaj flagę `--lang` przy starcie:

```
/Applications/ActunaMail.app/Contents/MacOS/ActunaMail --lang=de
```

Lub, podczas pracy nad aplikacją i uruchamiania jej z kopii roboczej:

```
npm start -- --lang=de
```

## Skrypty lokalizacji

- **`format-localizations.js`** — `node scripts/format-localizations.js`

  Znajduje wszystkie użycia `localized()` w plikach `.ts`, `.tsx`, `.js`, `.jsx` i dodaje je do `en.json`. Usuwa też nieużywane tłumaczenia ze wszystkich lokalizacji i sortuje je alfabetycznie.

- **`improve-localization.js`** — `node scripts/improve-localization.js`

  Porównuje tłumaczenia w `en.json` z wybraną lokalizacją. Może albo pytać o każde brakujące tłumaczenie, albo ustawić każde brakujące tłumaczenie na `null`, byś uzupełnił je bezpośrednio w odpowiednim pliku JSON.
