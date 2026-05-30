/**
 * Bilet MVP #89 — Cmd+K Command Palette unit tests (jasmine).
 *
 * Tests:
 *   1. fuzzy-match scoring — exact / starts-with / word-boundary / substring / keywords
 *   2. CommandPaletteStore — register/unregister/registerAll/execute
 *   3. CommandPaletteStore — open/close/toggle, query, selectedIndex
 *   4. Built-in commands — 30+ commands loaded z poprawnymi id/label
 *   5. Plugin API — public surface (register, unregister, open, close, toggle)
 */

import { fuzzyScore, fuzzyFilter } from '../internal_packages/command-palette/lib/fuzzy-match';
import { CommandPaletteStore, CommandPalette } from '../internal_packages/command-palette/lib/command-palette-store';
import { getBuiltInCommands } from '../internal_packages/command-palette/lib/built-in-commands';

describe('Command Palette — bilet MVP #89', () => {

  describe('fuzzy-match', () => {
    it('empty query returns score 1 (all match)', () => {
      expect(fuzzyScore('', 'Anything')).toBe(1);
    });

    it('exact match returns 1000', () => {
      expect(fuzzyScore('archive', 'archive')).toBe(1000);
    });

    it('case-insensitive exact match returns 1000', () => {
      expect(fuzzyScore('ARCHIVE', 'archive')).toBe(1000);
    });

    it('starts-with match returns 500+', () => {
      const score = fuzzyScore('arch', 'archive');
      expect((score) >= (500)).toBe(true);
      expect(score).toBeLessThan(1000);
    });

    it('word boundary match (e.g. "ms" → "Mark As") returns 300+', () => {
      const score = fuzzyScore('ma', 'Mark Archive');
      expect((score) >= (300)).toBe(true);
    });

    it('substring match returns 100+', () => {
      const score = fuzzyScore('chi', 'archive');
      expect((score) >= (100)).toBe(true);
    });

    it('keyword match falls back when label has no match', () => {
      const score = fuzzyScore('odpowiedz', 'Reply', ['odpowiedz', 'r']);
      expect(score).toBeGreaterThan(0);
    });

    it('no match returns 0', () => {
      expect(fuzzyScore('xyz', 'archive')).toBe(0);
    });

    it('fuzzyFilter sorts by score descending', () => {
      const items = [
        { label: 'archive item' },
        { label: 'archive' },
        { label: 'item with archive in middle' },
      ];
      const result = fuzzyFilter('archive', items);
      expect(result.length).toBe(3);
      // Exact match first
      expect(result[0].item.label).toBe('archive');
      // Starts-with second
      expect(result[1].item.label).toBe('archive item');
    });

    it('fuzzyFilter filters out 0-score items', () => {
      const items = [
        { label: 'archive' },
        { label: 'unrelated' },
        { label: 'archive thread' },
      ];
      const result = fuzzyFilter('archive', items);
      expect(result.length).toBe(2);
    });
  });

  describe('CommandPaletteStore', () => {
    beforeEach(() => {
      CommandPaletteStore._reset();
    });

    it('register adds command to registry', () => {
      CommandPaletteStore.register({
        id: 'test:foo',
        label: 'Test Foo',
        handler: () => {},
      });
      expect(CommandPaletteStore.getCommands().length).toBe(1);
      expect(CommandPaletteStore.getCommand('test:foo')?.label).toBe('Test Foo');
    });

    it('register with same id replaces (idempotent)', () => {
      CommandPaletteStore.register({ id: 'a', label: 'First', handler: () => {} });
      CommandPaletteStore.register({ id: 'a', label: 'Second', handler: () => {} });
      expect(CommandPaletteStore.getCommand('a')?.label).toBe('Second');
      expect(CommandPaletteStore.getCommands().length).toBe(1);
    });

    it('register ignores invalid (missing id/label)', () => {
      spyOn(console, 'warn');
      CommandPaletteStore.register({ id: '', label: 'No ID', handler: () => {} });
      CommandPaletteStore.register({ id: 'x', label: '', handler: () => {} });
      expect(CommandPaletteStore.getCommands().length).toBe(0);
    });

    it('unregister removes command', () => {
      CommandPaletteStore.register({ id: 'a', label: 'A', handler: () => {} });
      CommandPaletteStore.unregister('a');
      expect(CommandPaletteStore.getCommands().length).toBe(0);
    });

    it('registerAll bulk adds', () => {
      CommandPaletteStore.registerAll([
        { id: 'a', label: 'A', handler: () => {} },
        { id: 'b', label: 'B', handler: () => {} },
        { id: 'c', label: 'C', handler: () => {} },
      ]);
      expect(CommandPaletteStore.getCommands().length).toBe(3);
    });

    it('execute calls handler and closes palette', () => {
      let called = false;
      CommandPaletteStore.register({
        id: 'test',
        label: 'Test',
        handler: () => { called = true; },
      });
      CommandPaletteStore.open();
      expect(CommandPaletteStore.isOpen()).toBe(true);
      const result = CommandPaletteStore.execute('test');
      expect(called).toBe(true);
      expect(result).toBe(true);
      expect(CommandPaletteStore.isOpen()).toBe(false);
    });

    it('execute returns false for unknown command', () => {
      spyOn(console, 'warn');
      const result = CommandPaletteStore.execute('does-not-exist');
      expect(result).toBe(false);
    });

    it('toggle changes open state', () => {
      expect(CommandPaletteStore.isOpen()).toBe(false);
      CommandPaletteStore.toggle();
      expect(CommandPaletteStore.isOpen()).toBe(true);
      CommandPaletteStore.toggle();
      expect(CommandPaletteStore.isOpen()).toBe(false);
    });

    it('setQuery updates query + resets selectedIndex to 0', () => {
      CommandPaletteStore.setSelectedIndex(5);
      CommandPaletteStore.setQuery('foo');
      expect(CommandPaletteStore.getQuery()).toBe('foo');
      expect(CommandPaletteStore.getSelectedIndex()).toBe(0);
    });

    it('listen receives change notifications', () => {
      let count = 0;
      const unsub = CommandPaletteStore.listen(() => count++);
      CommandPaletteStore.register({ id: 'a', label: 'A', handler: () => {} });
      CommandPaletteStore.open();
      CommandPaletteStore.setQuery('foo');
      expect((count) >= (3)).toBe(true);
      unsub();
    });

    it('execute supports dispatchCommand fallback', () => {
      // ŚWIADOMY zakaz: NIE zamieniać window.AppEnv ani window.AppEnv.commands
      // referencji — kolejne specs renderują komponenty wymagające oryginalnego
      // CommandRegistry. Spy na metodę zamiast podmiany.
      const dispatchSpy = jasmine.createSpy('dispatch');
      const originalDispatch = (window as any).AppEnv?.commands?.dispatch;
      if ((window as any).AppEnv?.commands) {
        (window as any).AppEnv.commands.dispatch = dispatchSpy;
      } else {
        (window as any).AppEnv = (window as any).AppEnv || {};
        (window as any).AppEnv.commands = { dispatch: dispatchSpy };
      }
      try {
        CommandPaletteStore.register({
          id: 'd:test',
          label: 'Dispatch Test',
          dispatchCommand: 'core:foo',
        });
        CommandPaletteStore.execute('d:test');
        expect(dispatchSpy).toHaveBeenCalled();
        const callArgs = dispatchSpy.argsForCall[0];
        expect(callArgs[0]).toBe('core:foo');
      } finally {
        if ((window as any).AppEnv?.commands && originalDispatch !== undefined) {
          (window as any).AppEnv.commands.dispatch = originalDispatch;
        }
      }
    });
  });

  describe('built-in commands', () => {
    let commands: ReturnType<typeof getBuiltInCommands>;

    beforeEach(() => {
      commands = getBuiltInCommands();
    });

    it('returns 30+ commands (acceptance criterion)', () => {
      expect((commands.length) >= (30)).toBe(true);
    });

    it('all commands have unique id', () => {
      const ids = commands.map(c => c.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });

    it('all commands have label', () => {
      const missing = commands.filter(c => !c.label);
      expect(missing.length).toBe(0);
    });

    it('all commands have section', () => {
      const missing = commands.filter(c => !c.section);
      expect(missing.length).toBe(0);
    });

    it('contains core navigation commands', () => {
      const ids = commands.map(c => c.id);
      expect(ids).toContain('nav:inbox');
      expect(ids).toContain('nav:sent');
      expect(ids).toContain('nav:drafts');
      expect(ids).toContain('compose:new');
    });

    it('contains mail action commands', () => {
      const ids = commands.map(c => c.id);
      expect(ids).toContain('mail:reply');
      expect(ids).toContain('mail:archive');
      expect(ids).toContain('mail:snooze');
    });

    it('contains preferences command', () => {
      const ids = commands.map(c => c.id);
      expect(ids).toContain('app:preferences');
    });
  });

  describe('public CommandPalette API', () => {
    beforeEach(() => {
      CommandPaletteStore._reset();
    });

    it('exposes register / unregister / open / close / toggle', () => {
      expect(typeof CommandPalette.register).toBe('function');
      expect(typeof CommandPalette.unregister).toBe('function');
      expect(typeof CommandPalette.open).toBe('function');
      expect(typeof CommandPalette.close).toBe('function');
      expect(typeof CommandPalette.toggle).toBe('function');
    });

    it('CommandPalette.register works end-to-end', () => {
      CommandPalette.register({
        id: 'plugin:demo',
        label: 'Demo Command',
        handler: () => {},
      });
      expect(CommandPaletteStore.getCommand('plugin:demo')?.label).toBe('Demo Command');
    });

    it('CommandPalette.open then close changes state', () => {
      CommandPalette.open();
      expect(CommandPaletteStore.isOpen()).toBe(true);
      CommandPalette.close();
      expect(CommandPaletteStore.isOpen()).toBe(false);
    });
  });
});
