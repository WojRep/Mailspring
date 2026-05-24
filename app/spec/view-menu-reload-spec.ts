/**
 * Ticket #56 — Pozycja "Reload Window" musi być widoczna w menu View
 * na wszystkich platformach (darwin / linux / win32) i nie może istnieć
 * duplikat w menu Developer (które jest ukrywane w prod build poza
 * inDevMode()).
 */

import path from 'path';

type MenuItem = {
  label?: string;
  command?: string;
  type?: string;
  id?: string;
  role?: string;
  submenu?: MenuItem[];
};

function loadMenu(platform: 'darwin' | 'linux' | 'win32'): MenuItem[] {
  const menuPath = path.join(__dirname, '..', 'menus', `${platform}.js`);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  delete require.cache[require.resolve(menuPath)];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(menuPath).menu as MenuItem[];
}

function findSubmenu(menu: MenuItem[], id: string): MenuItem[] | null {
  const entry = menu.find(item => item.id === id);
  return entry?.submenu ?? null;
}

function hasCommand(submenu: MenuItem[] | null, command: string): boolean {
  if (!submenu) return false;
  return submenu.some(item => item.command === command);
}

describe('Ticket #56 — Reload Window w menu View (nie w Developer)', () => {
  (['darwin', 'linux', 'win32'] as const).forEach(platform => {
    describe(`platforma ${platform}`, () => {
      let menu: MenuItem[];

      beforeEach(() => {
        menu = loadMenu(platform);
      });

      it('menu View zawiera item window:reload (Reload Window)', () => {
        const view = findSubmenu(menu, 'View');
        expect(view).not.toBeNull();
        expect(hasCommand(view, 'window:reload')).toBe(true);
      });

      it('menu Developer NIE zawiera duplikatu window:reload', () => {
        const developer = findSubmenu(menu, 'Developer');
        // linux/win32 nie mają sekcji "Developer" jako id w niektórych
        // configach — jeżeli brak, pomijamy assertion (brak duplikatu
        // z definicji); jeżeli istnieje, ma NIE zawierać window:reload.
        if (developer === null) return;
        expect(hasCommand(developer, 'window:reload')).toBe(false);
      });
    });
  });

  it('label "Reload Window" pasuje do istniejącego tłumaczenia PL', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const plDict = require('../lang/pl.json') as Record<string, string>;
    expect(plDict['Reload Window']).toBe('Przeładuj okno');
  });
});
