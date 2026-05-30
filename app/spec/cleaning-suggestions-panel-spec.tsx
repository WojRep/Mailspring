/**
 * RED test — CleaningSuggestionsPanel (#116 UI).
 */
import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

let CleaningSuggestionsPanel: any = null;
try {
  CleaningSuggestionsPanel = require('../internal_packages/cleaning-suggestions/lib/cleaning-suggestions-panel').default;
} catch (e) { /* RED */ }

describe('CleaningSuggestionsPanel — #116 plan v1.0', () => {
  afterEach(() => { cleanup(); });

  it('component exists', () => {
    expect(CleaningSuggestionsPanel).not.toBeNull();
    expect(typeof CleaningSuggestionsPanel).toBe('function');
  });

  it('renderuje empty state gdy brak suggestions', () => {
    if (!CleaningSuggestionsPanel) return;
    const { container } = render(<CleaningSuggestionsPanel suggestions={[]} />);
    expect(container.querySelector('.cleaning-suggestions-empty')).not.toBeNull();
  });

  it('renderuje listę gdy są suggestions', () => {
    if (!CleaningSuggestionsPanel) return;
    const suggestions = [
      { id: 's1', scope: 'sender', scopeValue: 'spam@example.com', category: 'promo', count: 15, suggestedAction: 'archive' as const },
      { id: 's2', scope: 'domain', scopeValue: 'newsletter.com', category: 'newsletters', count: 30, suggestedAction: 'archive' as const },
    ];
    const { container } = render(<CleaningSuggestionsPanel suggestions={suggestions} />);
    const items = container.querySelectorAll('.cleaning-suggestion-item');
    expect(items.length).toBe(2);
  });

  it('role=region + aria-label', () => {
    if (!CleaningSuggestionsPanel) return;
    const { container } = render(<CleaningSuggestionsPanel suggestions={[]} />);
    const r = container.querySelector('.cleaning-suggestions-panel[role="region"]') as HTMLElement;
    expect(r).not.toBeNull();
    expect(r.getAttribute('aria-label')).toMatch(/cleaning|sprzątani|suggest|sugesti/i);
  });

  it('click "Dismiss" wywołuje onDismiss', () => {
    if (!CleaningSuggestionsPanel) return;
    let dismissed: any = null;
    const onDismiss = (s: any) => { dismissed = s; };
    const suggestions = [{ id: 's3', scope: 'sender', scopeValue: 'x@y.com', category: 'promo', count: 12, suggestedAction: 'archive' as const }];
    const { container } = render(<CleaningSuggestionsPanel suggestions={suggestions} onDismiss={onDismiss} />);
    const btn = container.querySelector('.cleaning-dismiss-btn') as HTMLButtonElement;
    fireEvent.click(btn);
    expect(dismissed && dismissed.id).toBe('s3');
  });
});
