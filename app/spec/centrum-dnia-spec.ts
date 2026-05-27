/**
 * Bilet MVP #95 — Centrum dnia unit tests.
 */

import { CentrumDniaStore } from '../internal_packages/centrum-dnia/lib/centrum-dnia-store';

describe('Centrum dnia — bilet MVP #95', () => {

  beforeEach(() => {
    CentrumDniaStore._reset();
  });

  describe('pane state', () => {
    it('isPaneOpen default false', () => {
      expect(CentrumDniaStore.isPaneOpen()).toBe(false);
    });

    it('openPane sets state', () => {
      CentrumDniaStore.openPane();
      expect(CentrumDniaStore.isPaneOpen()).toBe(true);
    });

    it('openPane is idempotent', () => {
      let count = 0;
      const unsub = CentrumDniaStore.listen(() => count++);
      CentrumDniaStore.openPane();
      CentrumDniaStore.openPane();
      CentrumDniaStore.openPane();
      expect(count).toBe(1);
      unsub();
    });

    it('closePane sets state', () => {
      CentrumDniaStore.openPane();
      CentrumDniaStore.closePane();
      expect(CentrumDniaStore.isPaneOpen()).toBe(false);
    });

    it('togglePane flips state', () => {
      expect(CentrumDniaStore.isPaneOpen()).toBe(false);
      CentrumDniaStore.togglePane();
      expect(CentrumDniaStore.isPaneOpen()).toBe(true);
      CentrumDniaStore.togglePane();
      expect(CentrumDniaStore.isPaneOpen()).toBe(false);
    });
  });

  describe('section collapse state', () => {
    it('sections start expanded (NOT in collapsed set)', () => {
      expect(CentrumDniaStore.isSectionCollapsed('calendar')).toBe(false);
      expect(CentrumDniaStore.isSectionCollapsed('tasks')).toBe(false);
      expect(CentrumDniaStore.isSectionCollapsed('mails')).toBe(false);
    });

    it('toggleSection collapses then expands', () => {
      CentrumDniaStore.toggleSection('calendar');
      expect(CentrumDniaStore.isSectionCollapsed('calendar')).toBe(true);
      CentrumDniaStore.toggleSection('calendar');
      expect(CentrumDniaStore.isSectionCollapsed('calendar')).toBe(false);
    });

    it('collapseSection idempotent', () => {
      let count = 0;
      const unsub = CentrumDniaStore.listen(() => count++);
      CentrumDniaStore.collapseSection('tasks');
      CentrumDniaStore.collapseSection('tasks');
      expect(count).toBe(1);
      unsub();
    });

    it('expandSection only emits when actually collapsed', () => {
      let count = 0;
      const unsub = CentrumDniaStore.listen(() => count++);
      CentrumDniaStore.expandSection('mails');
      expect(count).toBe(0); // już expanded, no-op
      CentrumDniaStore.collapseSection('mails');
      CentrumDniaStore.expandSection('mails');
      expect(count).toBe(2);
      unsub();
    });

    it('each section independent', () => {
      CentrumDniaStore.collapseSection('calendar');
      CentrumDniaStore.collapseSection('mails');
      expect(CentrumDniaStore.isSectionCollapsed('calendar')).toBe(true);
      expect(CentrumDniaStore.isSectionCollapsed('tasks')).toBe(false);
      expect(CentrumDniaStore.isSectionCollapsed('mails')).toBe(true);
    });
  });

  describe('refresh', () => {
    it('refresh updates lastRefresh timestamp', () => {
      const before = CentrumDniaStore.getLastRefresh();
      CentrumDniaStore.refresh();
      expect(CentrumDniaStore.getLastRefresh()).toBeGreaterThanOrEqual(before);
    });

    it('refresh emits to listeners', () => {
      let count = 0;
      const unsub = CentrumDniaStore.listen(() => count++);
      CentrumDniaStore.refresh();
      CentrumDniaStore.refresh();
      expect(count).toBe(2);
      unsub();
    });
  });

  describe('todayLabel', () => {
    it('returns non-empty string', () => {
      expect(CentrumDniaStore.todayLabel().length).toBeGreaterThan(0);
    });
  });

  describe('persistence', () => {
    it('persists pane open state to localStorage', () => {
      CentrumDniaStore.openPane();
      expect(localStorage.getItem('actuna.centrum-dnia.pane-open')).toBe('true');
    });

    it('persists collapsed sections to localStorage', () => {
      CentrumDniaStore.collapseSection('tasks');
      CentrumDniaStore.collapseSection('mails');
      const raw = localStorage.getItem('actuna.centrum-dnia.collapsed');
      expect(raw).toContain('tasks');
      expect(raw).toContain('mails');
    });
  });
});
