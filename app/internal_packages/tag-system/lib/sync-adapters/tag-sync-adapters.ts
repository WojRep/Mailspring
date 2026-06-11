/**
 * Tag sync adapters — bilet #117.
 *
 * UI rozmawia tylko z TagStore; TagStore deleguje transport do adaptera
 * wybranego per KONTO. UI/UX identyczne wszędzie — różni się tylko mechanizm
 * natywny serwera:
 *
 *   - GmailLabelAdapter     (provider gmail)            → etykiety Gmail
 *     `Tag/<nazwa>` przez istniejący ChangeLabelsTask / X-GM-LABELS.
 *   - ExchangeCategoryAdapter (provider office365/outlook) → keywordy IMAP;
 *     Exchange/Exchange Online mapuje je server-side na kategorie Outlooka.
 *   - KeywordAdapter        (pozostałe IMAP)            → keywordy IMAP
 *     (ten sam mechanizm, którego Thunderbird używa na tagi). Silnik C++ ma
 *     cichy fallback (bramka allowsNewPermanentFlags(), jak `$Pinned`).
 *   - LocalAdapter          (capability zgłoszona false) → bez transportu;
 *     tagi zostają lokalne (banner w Preferences → Tagi).
 *
 * Detekcja jest optymistyczna dla generycznego IMAP: keywordy wysyłamy zawsze,
 * a C++ pomija serwery bez `\*` w PERMANENTFLAGS. LocalAdapter włącza się
 * dopiero, gdy capability zostanie jawnie zgłoszona jako false
 * (setKeywordCapability — zasilane statusem konta z silnika).
 */

const CAPABILITY_KEY = 'actuna.tags.keyword-capability';

export type TagSyncAdapterKind = 'gmail-label' | 'exchange-category' | 'imap-keyword' | 'local';

export interface TagSyncAdapter {
  readonly kind: TagSyncAdapterKind;
  applyTag(thread: { id: string; accountId: string }, tag: { id: string; name: string }): void;
  removeTag(thread: { id: string; accountId: string }, tag: { id: string; name: string }): void;
}

/** Konfigurowalny prefiks etykiet Gmail (zagnieżdżenie `Tag/...` w Gmail web). */
export const GMAIL_TAG_PREFIX = 'Tag/';

let _capability: Map<string, boolean> | null = null;

function exps() {
  // Lazy require — unika cykli przy ładowaniu pakietu.
  return require('actunamail-exports');
}

function capabilityMap(): Map<string, boolean> {
  if (_capability) return _capability;
  _capability = new Map();
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(CAPABILITY_KEY);
      if (raw) {
        for (const [id, ok] of Object.entries(JSON.parse(raw) as Record<string, boolean>)) {
          _capability.set(id, ok);
        }
      }
    }
  } catch (e) {
    /* node env / corrupted — start fresh */
  }
  return _capability;
}

/**
 * Zgłoszenie możliwości serwera (z silnika C++ / sondy): false = serwer nie
 * wspiera własnych keywordów IMAP → konto przechodzi na LocalAdapter + banner.
 */
export function setKeywordCapability(accountId: string, supported: boolean): void {
  if (!accountId) return;
  capabilityMap().set(accountId, supported);
  try {
    if (typeof localStorage !== 'undefined') {
      const obj: Record<string, boolean> = {};
      for (const [id, ok] of capabilityMap()) obj[id] = ok;
      localStorage.setItem(CAPABILITY_KEY, JSON.stringify(obj));
    }
  } catch (e) {
    /* node env */
  }
}

export function keywordCapability(accountId: string): boolean | undefined {
  return capabilityMap().get(accountId);
}

/**
 * Sanitizacja nazwy tagu do atomu IMAP (RFC 9051): transliteracja diakrytyków
 * (w tym ł/Ł, których NFD nie rozkłada), spacje → `_`, tylko [A-Za-z0-9_.-].
 * Ten sam keyword czyta Thunderbird jako nazwę tagu.
 */
export function keywordForTagName(name: string): string {
  return String(name || '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[+\s]+/g, '_')
    .replace(/[^A-Za-z0-9_.-]/g, '');
}

class KeywordAdapterImpl implements TagSyncAdapter {
  readonly kind: TagSyncAdapterKind;

  constructor(kind: TagSyncAdapterKind = 'imap-keyword') {
    this.kind = kind;
  }

  applyTag(thread: { id: string; accountId: string }, tag: { id: string; name: string }): void {
    this._queue(thread, [keywordForTagName(tag.name)], []);
  }

  removeTag(thread: { id: string; accountId: string }, tag: { id: string; name: string }): void {
    this._queue(thread, [], [keywordForTagName(tag.name)]);
  }

  private _queue(thread: any, keywordsToAdd: string[], keywordsToRemove: string[]): void {
    try {
      const { Actions, ChangeKeywordsTask } = exps();
      if (!Actions || !ChangeKeywordsTask) return;
      Actions.queueTask(new ChangeKeywordsTask({ threads: [thread], keywordsToAdd, keywordsToRemove }));
    } catch (e) {
      /* exports unavailable (node-only context) */
    }
  }
}

class GmailLabelAdapterImpl implements TagSyncAdapter {
  readonly kind: TagSyncAdapterKind = 'gmail-label';

  applyTag(thread: { id: string; accountId: string }, tag: { id: string; name: string }): void {
    try {
      const { Actions, ChangeLabelsTask, SyncbackCategoryTask, CategoryStore } = exps();
      if (!Actions) return;
      const label = this._findLabel(CategoryStore, thread.accountId, tag.name);
      if (label) {
        Actions.queueTask(
          new ChangeLabelsTask({ threads: [thread], labelsToAdd: [label], labelsToRemove: [] })
        );
      } else if (SyncbackCategoryTask) {
        // Etykieta jeszcze nie istnieje — utwórz; przypisanie dośle inbound
        // reconcile po powstaniu etykiety (ponowny apply z pickera/migracji).
        Actions.queueTask(
          SyncbackCategoryTask.forCreating({
            name: `${GMAIL_TAG_PREFIX}${tag.name}`,
            accountId: thread.accountId,
          })
        );
      }
    } catch (e) {
      /* exports unavailable */
    }
  }

  removeTag(thread: { id: string; accountId: string }, tag: { id: string; name: string }): void {
    try {
      const { Actions, ChangeLabelsTask, CategoryStore } = exps();
      if (!Actions || !ChangeLabelsTask) return;
      const label = this._findLabel(CategoryStore, thread.accountId, tag.name);
      if (!label) return;
      Actions.queueTask(
        new ChangeLabelsTask({ threads: [thread], labelsToAdd: [], labelsToRemove: [label] })
      );
    } catch (e) {
      /* exports unavailable */
    }
  }

  private _findLabel(CategoryStore: any, accountId: string, tagName: string): any {
    if (!CategoryStore || typeof CategoryStore.categories !== 'function') return null;
    const wanted = `${GMAIL_TAG_PREFIX}${tagName}`;
    const cats = CategoryStore.categories(accountId) || [];
    return cats.find((c: any) => (c.displayName || c.path || c.name) === wanted) || null;
  }
}

class LocalAdapterImpl implements TagSyncAdapter {
  readonly kind: TagSyncAdapterKind = 'local';

  applyTag(): void {
    /* tagi lokalne — brak transportu (banner informuje usera) */
  }

  removeTag(): void {
    /* tagi lokalne — brak transportu */
  }
}

const _gmail = new GmailLabelAdapterImpl();
const _exchange = new KeywordAdapterImpl('exchange-category');
const _keyword = new KeywordAdapterImpl('imap-keyword');
const _local = new LocalAdapterImpl();

/** Wybór adaptera per konto (multi-account: każde konto niezależnie). */
export function adapterForAccount(account: { id: string; provider: string }): TagSyncAdapter {
  if (!account) return _local;
  if (capabilityMap().get(account.id) === false) return _local;
  if (account.provider === 'gmail') return _gmail;
  if (account.provider === 'office365' || account.provider === 'outlook') return _exchange;
  return _keyword;
}

/** Test helper — czyści cache capability (jak TagStore._reset). */
export function _resetAdapters(): void {
  _capability = null;
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(CAPABILITY_KEY);
  } catch (e) {
    /* node env */
  }
}
