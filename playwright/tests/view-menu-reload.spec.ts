import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { launchApp, closeApp } from '../helpers';

/**
 * Ticket #56 — Reload Window dostępne w menu View dla użytkownika
 * końcowego (Developer menu jest ukrywane poza inDevMode()).
 *
 * Test używa `electronApp.evaluate` do introspekcji rzeczywistego
 * application menu po stronie main procesu. Działa cross-platform
 * (macOS uses native menu bar; linux/win32 use BrowserWindow menu).
 */

let electronApp: ElectronApplication;
let mainWindow: Page;
let configDir: string;

test.beforeAll(async () => {
  ({ electronApp, mainWindow, configDir } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(electronApp, configDir);
});

type SerializedMenuItem = {
  label: string;
  role?: string;
  visible: boolean;
  enabled: boolean;
  commandId?: number;
  submenu?: SerializedMenuItem[];
};

async function getApplicationMenu(app: ElectronApplication): Promise<SerializedMenuItem[]> {
  return app.evaluate(async ({ Menu }) => {
    function serialize(item: Electron.MenuItem): SerializedMenuItem {
      return {
        label: item.label,
        role: item.role,
        visible: item.visible,
        enabled: item.enabled,
        submenu: item.submenu?.items?.map(serialize),
      };
    }
    const menu = Menu.getApplicationMenu();
    if (!menu) return [];
    return menu.items.map(serialize);
  });
}

function findByLabel(items: SerializedMenuItem[], substring: string): SerializedMenuItem | undefined {
  return items.find(item => item.label && item.label.toLowerCase().includes(substring.toLowerCase()));
}

test('View menu zawiera "Reload Window"', async () => {
  const menu = await getApplicationMenu(electronApp);
  const view = findByLabel(menu, 'View') || findByLabel(menu, 'Widok');
  expect(view, 'menu View / Widok musi istnieć').toBeDefined();
  expect(view!.submenu, 'View ma submenu').toBeDefined();

  const reload =
    findByLabel(view!.submenu!, 'Reload Window') || findByLabel(view!.submenu!, 'Przeładuj okno');
  expect(reload, 'View > Reload Window musi być dostępne dla użytkownika końcowego').toBeDefined();
  expect(reload!.visible).toBe(true);
});

test('Developer menu (jeżeli widoczne) nie zawiera duplikatu Reload', async () => {
  const menu = await getApplicationMenu(electronApp);
  const developer = findByLabel(menu, 'Developer') || findByLabel(menu, 'Deweloper');
  // W prod build (poza inDevMode) menu Developer może być całkowicie
  // ukryte — w takim przypadku brak duplikatu z definicji.
  if (!developer || !developer.submenu) return;

  const reloadInDeveloper =
    developer.submenu.find(item => item.label === 'Reload' || item.label === 'Reload Window') ||
    developer.submenu.find(item => item.label === 'Odśwież' || item.label === 'Przeładuj okno');

  expect(reloadInDeveloper, 'Reload nie może być duplikowany w Developer').toBeUndefined();
});
