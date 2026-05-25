import fs from 'fs';
import path from 'path';

/**
 * Ticket #43d — long-tail Tooltip migrations.
 *
 * Sub-faza d ticketu #43. Migruje mniej widoczne callsite'y `title=`
 * na `<Tooltip>` wrapper (po Grupie 5 z #43c).
 *
 * Pierwotne estymowanie ~70 callsiteów okazało się przeszacowane
 * (dokładna inwentaryzacja 2026-05-25: większość pozostałych `title=`
 * to **semantic attributes**, NIE button tooltips:
 *   - Notification.title prop (semantic title komponentu)
 *   - calendar header text (semantic)
 *   - file-name title= dla truncated names (native browser hint)
 *   - FormField title prop (label text)
 *   - signature templates (HTML content w emailu, nie UI app)
 *   - iframe semantic title (a11y attribute, nie tooltip)
 *
 * Realne button-tooltip migrations w #43d: 11 callsiteów.
 */

const REPO_ROOT = path.resolve(__dirname, '..');

interface MigrationCheck {
  file: string;
  tooltipContent: string;
}

const MIGRATIONS: MigrationCheck[] = [
  // Batch 1 — Components (3)
  { file: 'src/components/editable-list.tsx', tooltipContent: "Tooltip content={localized('Edit Item')}" },
  { file: 'src/components/metadata-composer-toggle-button.tsx', tooltipContent: '<Tooltip content={tooltipLabel}>' },
  { file: 'src/components/mail-important-icon.tsx', tooltipContent: '<Tooltip content={title}>' },

  // Batch 2 — Contacts (5)
  { file: 'internal_packages/contacts/lib/ContactDetailToolbar.tsx', tooltipContent: "Tooltip content={localized('Remove from Group')}" },
  { file: 'internal_packages/contacts/lib/ContactDetailToolbar.tsx', tooltipContent: "Tooltip content={localized('Delete')}" },
  { file: 'internal_packages/contacts/lib/ContactDetailToolbar.tsx', tooltipContent: "Tooltip content={localized('Export vCard')}" },
  { file: 'internal_packages/contacts/lib/ContactDetailToolbar.tsx', tooltipContent: "Tooltip content={localized('Edit')}" },
  { file: 'internal_packages/contacts/lib/AddContactToolbar.tsx', tooltipContent: 'localized(\'New contact in %@\', acct.label)' },

  // Batch 3 — Calendar + ButtonDropdown (3 — calendar=1 + ButtonDropdown=2)
  { file: 'internal_packages/main-calendar/lib/core/location-video-input.tsx', tooltipContent: "Tooltip content={localized('Add Video Call')}" },
  // ButtonDropdown — primary-item path + only-item path (2 callsite'y w
  // jednym pliku obsługujące Reply/Reply All/Forward dropdown z message-controls.tsx).
  { file: 'src/components/button-dropdown.tsx', tooltipContent: '<Tooltip content={this.props.primaryTitle}>' },
];

describe('Ticket #43d — long-tail Tooltip migrations', () => {
  it('zmigrowano dokładnie 10 callsiteów (zspecowanych)', () => {
    expect(MIGRATIONS.length).toBe(10);
  });

  MIGRATIONS.forEach((m, idx) => {
    it(`#${idx + 1} ${m.file} → ${m.tooltipContent.substring(0, 60)}`, () => {
      const fullPath = path.join(REPO_ROOT, m.file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      expect(content).toContain(m.tooltipContent);
    });
  });

  it('button-dropdown.tsx ma DWA wystąpienia <Tooltip content={this.props.primaryTitle}>', () => {
    const fullPath = path.join(REPO_ROOT, 'src/components/button-dropdown.tsx');
    const content = fs.readFileSync(fullPath, 'utf-8');
    const matches = content.match(/<Tooltip content={this\.props\.primaryTitle}>/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(2);
  });

  it('wszystkie zmigrowane pliki importują Tooltip', () => {
    const uniqueFiles = Array.from(new Set(MIGRATIONS.map((m) => m.file)));
    const failures: string[] = [];
    uniqueFiles.forEach((file) => {
      const fullPath = path.join(REPO_ROOT, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const hasTooltipImport =
        /import\s*{[^}]*\bTooltip\b[^}]*}\s*from\s*['"]actunamail-component-kit['"]/.test(content) ||
        /import\s*{[^}]*\bTooltip\b[^}]*}\s*from\s*['"][\.\/]*components\/tooltip['"]/.test(content) ||
        /import\s*{[^}]*\bTooltip\b[^}]*}\s*from\s*['"]\.\/tooltip['"]/.test(content);
      if (!hasTooltipImport) failures.push(file);
    });
    expect(failures).toEqual([]);
  });
});
