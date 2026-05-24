# Test layers

ActunaMail has three test layers. Pick the layer that matches what you're testing.

| Layer | Command | Where it runs | When to use |
|---|---|---|---|
| **Unit** (Jasmine, main-mode) | `npm test` | Electron main process | Pure logic, store handlers, schema, parsers, helpers. Fast (~30 s, 1600+ specs). |
| **Integration** (Jasmine, window-mode) | `npm run test-window` | Electron `BrowserWindow` (renderer) | Components that need real DOM mounting, real timers, `@floating-ui` micro-tasks, `AppEnv` globals at runtime. |
| **E2E** (Playwright) | `npm run test:e2e` | Full packaged-source launch | Multi-window IPC, application menu, sheet navigation, native dialogs, full app boot path. |

Pick the **lowest** layer that still covers the contract. A schema/state assertion stays in unit (`describe` in `app/spec/`). A `<Tooltip>` placement test that depends on `requestAnimationFrame` belongs in window-mode. A "open Preferences → Plugins → click Remove" flow belongs in Playwright.

## When unit-mode is enough

- `describe(...)` blocks where the assertion is `expect(node.type).toBe('string')` (`config-schema-defaults-spec.ts`).
- Store handlers tested via `spyOn(store, '_method')` with mocked deps (`stores/attachment-store-save-target-spec.ts`).
- Pure utility functions (`models/utils-spec.ts`, `flux/tasks/*-spec.ts`).
- React render assertions that don't depend on layout, animation, or real timers (`components/outline-view-item-a11y-spec.tsx`).

Unit-mode runs in main-process Electron — no `window.document`, but `@testing-library/react` works through `jsdom`-style harness. If a test needs `window.requestAnimationFrame` or real CSS layout, escalate to window-mode.

## When window-mode adds value

Use `npm run test-window` (drops `--test=window` flag → spec window is a real `BrowserWindow`) when:

- Test mounts a component that uses `@floating-ui/react` (Tooltip, popovers) — needs real `requestAnimationFrame` orchestration. The xdescribed `app/spec/components/tooltip-spec.tsx` was migrated to Playwright (`playwright/tests/tooltip.spec.ts`) for this reason; window-mode is the cheaper middle ground.
- Test needs the lazy `window.$m` (actunamail-exports) facade resolved against real renderer state.
- Test exercises a path that goes through `AppEnv.config.onDidChange` subscriptions (real `EventEmitter` not stubbed).

A spec is identical to unit-mode shape (`describe` / `it`) — only the runner harness changes.

## When Playwright is the right tool

- The path under test crosses **main ↔ renderer IPC** (menu commands, `ipcRenderer.on('open-preferences', …)`).
- Sheet navigation (`pushSheet` / `popSheet`) and DOM assertions on what the new sheet rendered.
- Real packaged-app boot — preferences package activation, plugin registry, lazy `componentClassFn` invocation.
- Visual diffing / screenshots.
- Native menus, dialogs, taskbar interactions.

Playwright tests live in `playwright/tests/*.spec.ts`. Run a single file with `npx playwright test playwright/tests/foo.spec.ts --reporter=list`.

## Playwright patterns

### Bypassing `window.eval` (renderer security guard)

ActunaMail blocks `window.eval()` (`app/static/index.js:1`) so `mainWindow.evaluate(() => ...)` throws. Use `executeInRenderer` helper which goes through `webContents.executeJavaScript` (the **only** allowed path into the renderer for tests).

```ts
import { executeInRenderer } from '../helpers';

const result = await executeInRenderer(
  electronApp,
  `(function(){
     return { unread: window.$m.WorkspaceStore.unread() };
   })()`
);
```

`window.$m` is the actunamail-exports facade — every store, every action, every model is reachable through it. It is set on `window` directly (`app/src/global/actunamail-exports.js:7`), with lazy property getters that resolve on first access.

### Opening Preferences deterministically

`Menu.getApplicationMenu().items.find(...).click()` and `webContents.send('open-preferences')` are both flaky in fresh-launch state (the latter requires `PreferencesUIStore.setupListeners` to have already run; the former is timing-dependent on platform menus).

Use the `openPreferences` helper instead — it calls `Actions.pushSheet(Sheet.Preferences)` directly through `$m`, which mutates the sheet stack synchronously.

```ts
import { openPreferences, switchPreferencesTab, closePreferences } from '../helpers';

await openPreferences(electronApp, mainWindow);
await switchPreferencesTab(electronApp, mainWindow, 'Plugins');
// assert against the Plugins tab DOM
await closePreferences(electronApp);
```

Wait selector inside the helper: `.preferences-wrap, .container-preference-tabs` — the wrapper that mounts when `PreferencesRoot` becomes the rendered sheet root.

### Action / store smoke without UI

When a Playwright test only needs to assert that an `Actions.foo` is wired or a store handler exists — no DOM — use `executeInRenderer` with a runtime-introspection function. Faster than opening Preferences for an action presence check.

```ts
const result = await executeInRenderer(
  electronApp,
  `(function(){
     return {
       hasFetchAndSaveFileTo: typeof window.$m.Actions.fetchAndSaveFileTo === 'function',
       hasResolver: typeof window.$m.AttachmentStore._resolvedTargetSaveDir === 'function',
     };
   })()`
);
```

(See `playwright/tests/attachment-quick-save-actions.spec.ts` for a full example.)

### State inspection scaffold

`playwright/tests/_example-state-inspection.spec.ts` is a non-shipping template for debugging when a test fails and you need to inspect what `$m` / DOM look like at a given point. Copy and adapt — don't ship `_example-*` specs to CI.

## Fixture dir caveat

`prepareTestConfigDir()` in `helpers.ts` references a hard-coded `/Users/bengotow/Library/Application Support/ActunaMail-dev-building-for-playwright` fixture. If the path is missing on your machine the helper falls back to a synthetic default config — most tests still work. The Yahoo account credentials baked into the golden fixture are only required by sync-engine paths (search, real-IMAP flows); pure UI / state tests don't need them.

## Picking a layer — decision tree

```
Does the test reach across windows or trigger IPC ?
└── yes → Playwright (e2e)
└── no
    └── Does the test depend on layout / animation / real rAF ?
        └── yes → window-mode jasmine (test-window)
        └── no  → main-mode jasmine (test)
```
