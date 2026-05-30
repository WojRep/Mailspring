/**
 * RED test — AuditLogViewer (#114 UI).
 */
import React from 'react';
import { render, cleanup } from '@testing-library/react';

let AuditLogViewer: any = null;
try {
  AuditLogViewer = require('../internal_packages/audit-log/lib/audit-log-viewer').default;
} catch (e) { /* RED */ }

const { AuditLogStore } = require('../internal_packages/audit-log/lib/audit-log-store');

describe('AuditLogViewer — #114 plan v1.0', () => {
  beforeEach(() => {
    if (AuditLogStore._reset) { AuditLogStore._reset(); AuditLogStore.init(); }
  });
  afterEach(() => { cleanup(); });

  it('component exists', () => {
    expect(AuditLogViewer).not.toBeNull();
    expect(typeof AuditLogViewer).toBe('function');
  });

  it('renderuje empty state gdy brak entries', () => {
    if (!AuditLogViewer) return;
    const { container } = render(<AuditLogViewer />);
    expect(container.querySelector('.audit-log-empty')).not.toBeNull();
  });

  it('renderuje entries table gdy są wpisy', () => {
    if (!AuditLogViewer) return;
    AuditLogStore.log({ actor: 'user', subsystem: 'tag-system', eventType: 'tag-created', detail: 'Pricing' });
    AuditLogStore.log({ actor: 'system', subsystem: 'snooze', eventType: 'thread-snoozed', detail: 't1' });
    const { container } = render(<AuditLogViewer />);
    const rows = container.querySelectorAll('.audit-log-row');
    expect(rows.length).toBeGreaterThan(0);
    const html = container.innerHTML;
    expect(html).toContain('tag-created');
  });

  it('renderuje role=table + aria-label PL+EN', () => {
    if (!AuditLogViewer) return;
    const { container } = render(<AuditLogViewer />);
    const table = container.querySelector('.audit-log-viewer[role="region"]') as HTMLElement;
    expect(table).not.toBeNull();
    expect(table.getAttribute('aria-label')).toMatch(/audit|log|dziennik/i);
  });
});
