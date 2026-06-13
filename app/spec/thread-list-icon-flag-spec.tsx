/**
 * RED test (TDD) — ikona wiersza: kolorowa flaga Apple.
 * Gdy wątek ma flagę z bitami koloru → render flagi w kolorze (1:1 Apple).
 * Czysta gwiazdka (starred bez bitów) → zwykła gwiazdka (status quo).
 */

import React from 'react';
import { render, cleanup } from '@testing-library/react';
import ThreadListIcon from '../internal_packages/thread-list/lib/thread-list-icon';

describe('ThreadListIcon — kolor flagi Apple', () => {
  afterEach(() => cleanup());

  it('flagged + bity → kolorowa flaga w kolorze flagi', () => {
    const thread = { starred: true, customKeywords: ['$MailFlagBit2'] } as any; // blue
    const { container } = render(<ThreadListIcon thread={thread} />);
    expect(container.querySelector('.thread-icon-flagcolor')).toBeTruthy();
    expect(container.innerHTML).toMatch(/--flag-blue/);
  });

  it('gwiazdka bez bitów → CZERWONA flaga (1:1 Apple)', () => {
    const thread = { starred: true, customKeywords: [] } as any;
    const { container } = render(<ThreadListIcon thread={thread} />);
    expect(container.querySelector('.thread-icon-flagcolor')).toBeTruthy();
    expect(container.innerHTML).toMatch(/--flag-red/);
  });

  it('nie starred → zwykła ikona (bez flagi)', () => {
    const thread = { starred: false, customKeywords: [], __messages: [] } as any;
    const { container } = render(<ThreadListIcon thread={thread} />);
    expect(container.querySelector('.thread-icon-flagcolor')).toBeFalsy();
  });
});
