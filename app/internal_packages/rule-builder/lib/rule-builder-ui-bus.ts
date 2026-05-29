/**
 * RuleBuilderUIBus — singleton bus dla RuleBuilder + RunRulesNow open/close state.
 *
 * Bilet MVP #100 (UI implementation). Wzór: SmartFolderUIBus / SnoozeUIBus.
 *
 * Dwa pickery w jednym bus:
 *  - builder open + editingRuleId (null = create new, string = edit existing)
 *  - runNow open (simple modal: pick rule → preview → execute)
 */

type Listener = () => void;

class RuleBuilderUIBusImpl {
  private _builderOpen = false;
  private _editingRuleId: string | null = null;
  private _runNowOpen = false;
  private _listeners: Set<Listener> = new Set();

  // === Builder modal ===

  isBuilderOpen(): boolean {
    return this._builderOpen;
  }

  getEditingRuleId(): string | null {
    return this._editingRuleId;
  }

  openBuilder(ruleId: string | null = null): void {
    this._builderOpen = true;
    this._editingRuleId = ruleId;
    this._emit();
  }

  closeBuilder(): void {
    if (!this._builderOpen) return;
    this._builderOpen = false;
    this._editingRuleId = null;
    this._emit();
  }

  // === Run Now modal ===

  isRunNowOpen(): boolean {
    return this._runNowOpen;
  }

  openRunNow(): void {
    this._runNowOpen = true;
    this._emit();
  }

  closeRunNow(): void {
    if (!this._runNowOpen) return;
    this._runNowOpen = false;
    this._emit();
  }

  // === Subscriber ===

  listen(fn: Listener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  private _emit(): void {
    for (const fn of this._listeners) {
      try { fn(); } catch (e) { /* swallow */ }
    }
  }

  /** Test helper. */
  _reset(): void {
    this._builderOpen = false;
    this._editingRuleId = null;
    this._runNowOpen = false;
    this._listeners.clear();
  }
}

export const RuleBuilderUIBus = new RuleBuilderUIBusImpl();
