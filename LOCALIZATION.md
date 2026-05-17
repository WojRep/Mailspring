# Localization / Internationalization

**English** · [Polski](LOCALIZATION.pl.md)

> Actuna Mail's localization system is inherited from Mailspring — Actuna Mail is a fork of Mailspring 1.21.0. This document describes how it works in Actuna Mail.

Actuna Mail supports localization — the app's menus, messages, buttons, and more are loaded from language files based on the user's locale. This makes the app accessible to people around the world and helps it blend in on your desktop.

Providing localization in many languages is a challenge, and automatic translation often does a poor job of technical text. The initial translation in ~90 languages was carried out by the upstream Mailspring project, using a database of human-translated email terms and technical phrases (e.g. "Archive", "Send message") supplemented with machine translation. If you use your computer in another language and also speak English, improving the translations is a great way to help.

## Contributing localizations

The localization files are in `app/lang`, named according to the BCP 47 / ISO 639 "language tag" standard. If you're not sure which language tag applies to your language, check the [ISO 639-1 lookup table](http://www.loc.gov/standards/iso639-2/php/English_list.php).

Each file is a JSON dictionary mapping an English string to a translated string. For example:

```
{
  "%@ of %@": "%1$@ de %2$@",
  "Accept": "Aceptar",
  "Account": "Cuenta",
  "Moved to %@": "Movido a %@"
}
```

The example shows variable substitution. Some strings display text the user provides, like a folder name; placeholders (`%@`) represent this text. If a string contains multiple placeholders, you can reference them by index with the `%2$@` syntax — `2` means the second placeholder in the English string. This lets you reorder variables, which matters for languages like Japanese.

Actuna Mail is not accepting external pull requests during pre-alpha (see [CONTRIBUTING.md](CONTRIBUTING.md)); localization improvements are welcome by email at `tech@actuna.pl`.

## Running Actuna Mail with a specific locale

To run the app with a specific locale, pass the `--lang` flag at launch:

```
/Applications/ActunaMail.app/Contents/MacOS/ActunaMail --lang=de
```

Or, when developing and running from a working copy:

```
npm start -- --lang=de
```

## The localization scripts

- **`format-localizations.js`** — `node scripts/format-localizations.js`

  Finds all uses of `localized()` in `.ts`, `.tsx`, `.js`, `.jsx` files and includes them in `en.json`. Also removes unused translations from all locales and sorts them alphabetically.

- **`improve-localization.js`** — `node scripts/improve-localization.js`

  Compares the translations in `en.json` against a chosen locale. It can either prompt for each missing translation, or set each missing translation to `null` for you to fill in directly in the corresponding JSON file.
