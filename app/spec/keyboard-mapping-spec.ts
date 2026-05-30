/**
 * Bilet MVP #109 — Keyboard Mapping Store unit tests.
 */

import {
  KeyboardMappingStore,
} from '../internal_packages/keyboard-mapping/lib/keyboard-mapping-store';
import {
  PRESET_BINDINGS,
  KeymapPreset,
} from '../internal_packages/keyboard-mapping/lib/keymap-presets';

describe('Keyboard Mapping — bilet MVP #109', () => {

  beforeEach(() => {
    KeyboardMappingStore._reset();
    KeyboardMappingStore.init();
  });

  describe('preset bindings — 4 mappings dostępne', () => {
    it('PRESET_BINDINGS ma default/apple_mail/gmail/outlook', () => {
      expect(PRESET_BINDINGS.default).toBeTruthy();
      expect(PRESET_BINDINGS.apple_mail).toBeTruthy();
      expect(PRESET_BINDINGS.gmail).toBeTruthy();
      expect(PRESET_BINDINGS.outlook).toBeTruthy();
    });

    it('każdy preset ma core commands (reply, archive, new-message)', () => {
      const presets: KeymapPreset[] = ['default', 'apple_mail', 'gmail', 'outlook'];
      for (const p of presets) {
        const cmds = PRESET_BINDINGS[p].map(b => b.command);
        expect(cmds).toContain('core:reply');
        expect(cmds).toContain('core:archive');
        expect(cmds).toContain('core:new-message');
      }
    });

    it('Gmail preset używa single-letter shortcuts (j/k/r/e)', () => {
      const gmailBindings = PRESET_BINDINGS.gmail;
      expect(gmailBindings.find(b => b.command === 'core:next-item')?.shortcut).toBe('j');
      expect(gmailBindings.find(b => b.command === 'core:prev-item')?.shortcut).toBe('k');
      expect(gmailBindings.find(b => b.command === 'core:reply')?.shortcut).toBe('r');
      expect(gmailBindings.find(b => b.command === 'core:archive')?.shortcut).toBe('e');
    });

    it('Outlook preset używa mod-heavy shortcuts', () => {
      const outlookBindings = PRESET_BINDINGS.outlook;
      expect(outlookBindings.find(b => b.command === 'core:reply')?.shortcut).toBe('mod-r');
      expect(outlookBindings.find(b => b.command === 'core:new-message')?.shortcut).toBe('mod-n');
    });
  });

  describe('Settings CRUD', () => {
    it('default global preset = default', () => {
      expect(KeyboardMappingStore.getSettings().globalPreset).toBe('default');
    });

    it('setGlobalPreset zmienia + persists', () => {
      KeyboardMappingStore.setGlobalPreset('gmail');
      expect(KeyboardMappingStore.getSettings().globalPreset).toBe('gmail');
    });

    it('setGlobalPreset unknown → throws', () => {
      { let _err; try { KeyboardMappingStore.setGlobalPreset('hyperion' as any); } catch (e) { _err = e; } expect(_err && _err.message).toMatch(/unknown preset/); }
    });

    it('setAccountOverride dodaje + remove (null)', () => {
      KeyboardMappingStore.setAccountOverride('acc-1', 'gmail');
      expect(KeyboardMappingStore.getSettings().accountOverrides['acc-1']).toBe('gmail');
      KeyboardMappingStore.setAccountOverride('acc-1', null);
      expect(KeyboardMappingStore.getSettings().accountOverrides['acc-1']).toBeUndefined();
    });

    it('setAccountOverride wymaga accountId', () => {
      { let _err; try { KeyboardMappingStore.setAccountOverride('', 'gmail'); } catch (e) { _err = e; } expect(_err && _err.message).toMatch(/accountId required/); }
    });

    it('cheatSheetShortcutEnabled default true (WCAG 2.1.4 togglable)', () => {
      expect(KeyboardMappingStore.getSettings().cheatSheetShortcutEnabled).toBe(true);
    });

    it('setCheatSheetShortcutEnabled', () => {
      KeyboardMappingStore.setCheatSheetShortcutEnabled(false);
      expect(KeyboardMappingStore.getSettings().cheatSheetShortcutEnabled).toBe(false);
    });
  });

  describe('activePresetFor + activeBindings (per-account override)', () => {
    it('global gdy brak override', () => {
      KeyboardMappingStore.setGlobalPreset('outlook');
      expect(KeyboardMappingStore.activePresetFor('any')).toBe('outlook');
    });

    it('override wygrywa nad global', () => {
      KeyboardMappingStore.setGlobalPreset('outlook');
      KeyboardMappingStore.setAccountOverride('acc-gmail', 'gmail');
      expect(KeyboardMappingStore.activePresetFor('acc-gmail')).toBe('gmail');
      expect(KeyboardMappingStore.activePresetFor('acc-other')).toBe('outlook');
    });

    it('bez accountId → global', () => {
      KeyboardMappingStore.setGlobalPreset('gmail');
      expect(KeyboardMappingStore.activePresetFor()).toBe('gmail');
    });

    it('activeBindings odzwierciedla active preset', () => {
      KeyboardMappingStore.setGlobalPreset('gmail');
      const bindings = KeyboardMappingStore.activeBindings();
      expect(bindings.find(b => b.command === 'core:next-item')?.shortcut).toBe('j');
    });
  });

  describe('groupedByCategory (cheat sheet UI data)', () => {
    it('grupuje bindings po category', () => {
      const groups = KeyboardMappingStore.groupedByCategory();
      expect(groups.mail.length).toBeGreaterThan(0);
      expect(groups.navigation.length).toBeGreaterThan(0);
      expect(groups.compose.length).toBeGreaterThan(0);
      expect(groups.help.length).toBeGreaterThan(0);
    });
  });

  describe('search (cheat sheet fuzzy filter)', () => {
    it('empty query → wszystkie bindings', () => {
      expect(KeyboardMappingStore.search('').length).toBe(KeyboardMappingStore.activeBindings().length);
    });

    it('match po command', () => {
      const r = KeyboardMappingStore.search('archive');
      expect(r.some(b => b.command === 'core:archive')).toBe(true);
    });

    it('match po label PL', () => {
      const r = KeyboardMappingStore.search('odpowiedz');
      expect(r.some(b => b.command === 'core:reply')).toBe(true);
    });

    it('match po shortcut', () => {
      KeyboardMappingStore.setGlobalPreset('gmail');
      const r = KeyboardMappingStore.search('j');
      expect(r.some(b => b.shortcut === 'j')).toBe(true);
    });
  });

  describe('labels + listPresets', () => {
    it('getPresetLabel PL + EN', () => {
      expect(KeyboardMappingStore.getPresetLabel('gmail', 'pl')).toContain('Gmail');
      expect(KeyboardMappingStore.getPresetLabel('default', 'pl')).toContain('Domyślne');
      expect(KeyboardMappingStore.getPresetLabel('default', 'en')).toContain('Default');
    });

    it('listPresets zwraca 4', () => {
      const list = KeyboardMappingStore.listPresets();
      expect(list.length).toBe(4);
      expect(list).toContain('default');
      expect(list).toContain('apple_mail');
      expect(list).toContain('gmail');
      expect(list).toContain('outlook');
    });
  });

  describe('persistence', () => {
    it('persists do localStorage', () => {
      KeyboardMappingStore.setGlobalPreset('gmail');
      KeyboardMappingStore.setAccountOverride('acc-1', 'outlook');
      expect(localStorage.getItem('actuna.keyboard-mapping')).toContain('gmail');
      expect(localStorage.getItem('actuna.keyboard-mapping')).toContain('outlook');
    });

    it('load valid', () => {
      KeyboardMappingStore.setGlobalPreset('gmail');
      const raw = localStorage.getItem('actuna.keyboard-mapping')!;
      KeyboardMappingStore._reset();
      localStorage.setItem('actuna.keyboard-mapping', raw);
      KeyboardMappingStore.init();
      expect(KeyboardMappingStore.getSettings().globalPreset).toBe('gmail');
    });

    it('load skip invalid preset name', () => {
      localStorage.setItem('actuna.keyboard-mapping', JSON.stringify({
        globalPreset: 'invalid_preset',
        accountOverrides: { 'a': 'gmail', 'b': 'invalid' },
      }));
      KeyboardMappingStore._reset();
      KeyboardMappingStore.init();
      // globalPreset fallback do default
      expect(KeyboardMappingStore.getSettings().globalPreset).toBe('default');
      // valid override załadowany, invalid pominięty
      expect(KeyboardMappingStore.getSettings().accountOverrides['a']).toBe('gmail');
      expect(KeyboardMappingStore.getSettings().accountOverrides['b']).toBeUndefined();
    });
  });

  describe('listen', () => {
    it('emit na setGlobalPreset/setAccountOverride/setCheatSheetShortcutEnabled', () => {
      let n = 0;
      const unsub = KeyboardMappingStore.listen(() => n++);
      KeyboardMappingStore.setGlobalPreset('gmail');
      KeyboardMappingStore.setAccountOverride('a', 'outlook');
      KeyboardMappingStore.setCheatSheetShortcutEnabled(false);
      expect(n).toBe(3);
      unsub();
    });
  });
});
