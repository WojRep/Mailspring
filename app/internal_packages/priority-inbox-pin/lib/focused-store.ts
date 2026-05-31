/**
 * FocusedStore — "Focused" = automatically-detected important threads.
 *
 * Decyzja plan_to_version_1.0/46 + user 2026-05-31: Focused ma wykrywać ważne
 * maile regułami biznesowymi ORAZ AI, w INBOX i wśród nowych. Pinned jest
 * podzbiorem Focused.
 *
 * Podział źródeł:
 *   - `pinned` / `starred` — trwałe sygnały, odpytywane bezpośrednio z bazy w
 *     FocusedMailboxPerspective (queryable kolumny).
 *   - `report()` — wynik DETERMINISTYCZNEGO klasyfikatora (reguły biznesowe:
 *     VIP / ważne tagi / korespondenci którym odpisujesz) liczonego nad
 *     załadowanymi wątkami.
 *   - `registerProvider()` — hook dla OPT-IN pluginu AI (`actunamail-ai`).
 *     Compliance: rdzeń nie robi AI ani egressu; AI dokłada się tylko gdy
 *     użytkownik świadomie włączy plugin, który rejestruje provider.
 *
 * `extraIds()` to deduplikowana suma reportów + providerów; FocusedMailboxPerspective
 * robi: `pinned = true OR starred = true OR id IN extraIds()`.
 */
type Provider = () => string[];

class FocusedStoreImpl {
  private _reported: Set<string> = new Set();
  private _providers: Set<Provider> = new Set();
  private _listeners: Set<() => void> = new Set();

  /** Reguły biznesowe (klasyfikator) raportują czy wątek jest "focused". */
  report(threadId: string, isFocused: boolean): void {
    if (!threadId) return;
    const had = this._reported.has(threadId);
    if (isFocused && !had) {
      this._reported.add(threadId);
      this._emit();
    } else if (!isFocused && had) {
      this._reported.delete(threadId);
      this._emit();
    }
  }

  /** Opt-in AI plugin (lub inne źródło) rejestruje funkcję zwracającą thread-id. */
  registerProvider(fn: Provider): () => void {
    this._providers.add(fn);
    this._emit();
    return () => {
      this._providers.delete(fn);
      this._emit();
    };
  }

  /** Deduplikowana suma reportów + wszystkich providerów (poza pinned/starred). */
  extraIds(): string[] {
    const out = new Set<string>(this._reported);
    for (const p of this._providers) {
      try {
        const ids = p() || [];
        for (const id of ids) if (id) out.add(id);
      } catch (e) {
        console.error('[FocusedStore] provider error', e);
      }
    }
    return Array.from(out);
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._reported.clear();
    this._providers.clear();
    this._listeners.clear();
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try {
        cb();
      } catch (e) {
        console.error('[FocusedStore] listener error', e);
      }
    }
  }
}

export const FocusedStore = new FocusedStoreImpl();
