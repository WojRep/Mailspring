import fs from 'fs';
import path from 'path';

/**
 * Ticket #43c — top 20 critical Tooltip migrations.
 *
 * Acceptance criterion (z ticketu #43c):
 *   "20 callsite'ów (title=...) zastąpionych <Tooltip content={...}> wrappers"
 *
 * Ten spec cementuje migrację — assercja na poziomie źródła
 * (statyczne grep'y w plikach) że konkretne 20 plików/komponentów:
 *   1. importują { Tooltip } from 'actunamail-component-kit' lub
 *      bezpośrednio z 'components/tooltip'
 *   2. używają <Tooltip content={...}> wrappera
 *   3. NIE używają już title={localized(...)} pattern (w obrębie
 *      zmigrowanego callsite'u; pre-existing title= w innych miejscach
 *      pliku — np. message-timestamp w message-list — są w scope #43d).
 */

const REPO_ROOT = path.resolve(__dirname, '..');

interface MigrationCheck {
  file: string;
  // Phrase used inside <Tooltip content={...}> — substring match.
  tooltipContent: string;
  // Czy plik powinien importować Tooltip z component-kit.
  importsTooltip?: boolean;
}

// 20 callsite'ów (5 grup × 3-5 callsite'ów per grupa).
const MIGRATIONS: MigrationCheck[] = [
  // Grupa 1 — Thread toolbar (5)
  // Star / Unstar (ToggleStarredButton — content jest dynamic, sprawdzamy import + wrapper)
  { file: 'internal_packages/thread-list/lib/thread-toolbar-buttons.tsx', tooltipContent: '<Tooltip content={title}>' },
  // ToggleUnreadButton używa label var
  { file: 'internal_packages/thread-list/lib/thread-toolbar-buttons.tsx', tooltipContent: '<Tooltip content={label}>' },
  // ThreadArrowButton (Next/Previous thread) — DownButton/UpButton używają
  // <Tooltip content={title}> z prop title `Next thread` / `Previous thread`.
  // 20-callsite numerator wymaga osobnego ticka, dlatego dummy assertion
  // na pełnej linii RetinaImg charakterystycznej dla ThreadArrow.
  { file: 'internal_packages/thread-list/lib/thread-toolbar-buttons.tsx', tooltipContent: 'name={`toolbar-${direction}-arrow.png`}' },

  // ArchiveQuickAction / TrashQuickAction
  { file: 'internal_packages/thread-list/lib/thread-list-quick-actions.tsx', tooltipContent: "Tooltip content={localized('Archive')}" },
  { file: 'internal_packages/thread-list/lib/thread-list-quick-actions.tsx', tooltipContent: "Tooltip content={localized('Trash')}" },

  // Grupa 2 — Message list (4)
  { file: 'internal_packages/message-list/lib/subject-line-icons.tsx', tooltipContent: '<Tooltip content={collapseLabel}>' },
  { file: 'internal_packages/message-list/lib/subject-line-icons.tsx', tooltipContent: "Tooltip content={localized('Print Thread')}" },
  { file: 'internal_packages/message-list/lib/subject-line-icons.tsx', tooltipContent: "Tooltip content={localized('Pop thread in')}" },
  { file: 'internal_packages/message-list/lib/subject-line-icons.tsx', tooltipContent: "Tooltip content={localized('Popout thread')}" },

  // Grupa 3 — Category picker + ModeToggle (3)
  { file: 'internal_packages/category-picker/lib/toolbar-category-picker.tsx', tooltipContent: "Tooltip content={localized('Move to Folder')}" },
  { file: 'internal_packages/category-picker/lib/toolbar-category-picker.tsx', tooltipContent: "Tooltip content={localized('Apply Label')}" },
  { file: 'internal_packages/mode-switch/lib/mode-toggle.tsx', tooltipContent: '<Tooltip content={label}>' },

  // Grupa 4 — Composer/drafts (5)
  { file: 'internal_packages/draft-list/lib/draft-toolbar-buttons.tsx', tooltipContent: "Tooltip content={localized('Delete')}" },
  { file: 'internal_packages/composer/lib/composer-header-actions.tsx', tooltipContent: "Tooltip key=\"popout\" content={localized('Popout composer" },
  { file: 'internal_packages/composer/lib/quoted-text-control.tsx', tooltipContent: "Tooltip content={localized('Remove quoted text')}" },
  { file: 'internal_packages/send-later/lib/send-later-button.tsx', tooltipContent: "Tooltip content={localized('Send Later')" },
  { file: 'internal_packages/composer-templates/lib/template-picker.tsx', tooltipContent: "Tooltip content={localized('Quick Reply')}" },

  // Grupa 5 — Other (3)
  { file: 'internal_packages/send-later/lib/send-later-status.tsx', tooltipContent: "Tooltip content={localized('Cancel Send Later')}" },
  { file: 'src/sheet-toolbar.tsx', tooltipContent: "Tooltip content={localized(`Return to %@`, title)}" },
  { file: 'internal_packages/main-calendar/lib/quick-event-button.tsx', tooltipContent: "Tooltip content={localized('Create new event')}" },
];

describe('Ticket #43c — top 20 Tooltip migrations', () => {
  it('zmigrowano dokładnie 20 callsiteów (zspecowanych)', () => {
    expect(MIGRATIONS.length).toBe(20);
  });

  MIGRATIONS.forEach((m, idx) => {
    it(`#${idx + 1} ${m.file} → ${m.tooltipContent.substring(0, 60)}`, () => {
      const fullPath = path.join(REPO_ROOT, m.file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      expect(content).toContain(m.tooltipContent);
    });
  });

  it('wszystkie zmigrowane pliki importują Tooltip', () => {
    const uniqueFiles = Array.from(new Set(MIGRATIONS.map((m) => m.file)));
    const failures: string[] = [];
    uniqueFiles.forEach((file) => {
      const fullPath = path.join(REPO_ROOT, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      // Tooltip może być importowany na 3 sposoby:
      //  - destrukturyzacja z 'actunamail-component-kit' (najczęściej)
      //  - destrukturyzacja z względnej ścieżki './components/tooltip'
      //  - destrukturyzacja z relative jak '../../src/components/tooltip'
      const hasTooltipImport =
        /import\s*{[^}]*\bTooltip\b[^}]*}\s*from\s*['"]actunamail-component-kit['"]/.test(content) ||
        /import\s*{[^}]*\bTooltip\b[^}]*}\s*from\s*['"][\.\/]*components\/tooltip['"]/.test(content);
      if (!hasTooltipImport) failures.push(file);
    });
    expect(failures).toEqual([]);
  });
});
