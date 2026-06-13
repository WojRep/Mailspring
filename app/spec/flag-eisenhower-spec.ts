/**
 * RED test (TDD) — mapowanie koloru flagi → kwadrant Eisenhowera (#120).
 * Domyślnie ON (core.flags.mapToPriority), tylko gdy aktywny preset 'eisenhower'.
 */

import { flagColorToQuadrant } from '../src/flag-colors';
import { TagStore } from '../internal_packages/tag-system/lib/tag-store';
import { PriorityPresetStore } from '../internal_packages/tag-system/lib/priority-preset-store';

describe('flag → Eisenhower — czyste mapowanie', () => {
  it('domyślne value → kwadrant (wg wytycznych ISO 3864/Eisenhower)', () => {
    expect(flagColorToQuadrant(0)).toBe('prio_q1'); // red = Zrób teraz
    expect(flagColorToQuadrant(4)).toBe('prio_q2'); // blue = Zaplanuj
    expect(flagColorToQuadrant(2)).toBe('prio_q3'); // yellow = Deleguj
    expect(flagColorToQuadrant(1)).toBe('prio_q3'); // orange = Deleguj
    expect(flagColorToQuadrant(3)).toBe('prio_q4'); // green = Odłóż
    expect(flagColorToQuadrant(6)).toBe('prio_q4'); // grey = Odłóż
    expect(flagColorToQuadrant(5)).toBe('prio_q2'); // purple = Zaplanuj (konwencja)
  });
});

describe('flag → Eisenhower — ingest stosuje kwadrant', () => {
  beforeEach(() => {
    TagStore._reset();
    TagStore.init();
    PriorityPresetStore._reset();
  });
  afterEach(() => {
    PriorityPresetStore._reset();
    TagStore._reset();
    AppEnv.config.set('core.flags.mapToPriority', true);
  });

  it('orange flag + config ON + preset eisenhower → prio_q3', () => {
    AppEnv.config.set('core.flags.mapToPriority', true);
    PriorityPresetStore.activatePreset('eisenhower');
    TagStore.syncFlagColorFromThread({
      id: 't1',
      customKeywords: ['$MailFlagBit0'],
      starred: true,
    }); // orange=1
    expect(TagStore.hasTag('t1', 'prio_q3')).toBe(true);
  });

  it('config OFF → brak przypisania priorytetu', () => {
    AppEnv.config.set('core.flags.mapToPriority', false);
    PriorityPresetStore.activatePreset('eisenhower');
    TagStore.syncFlagColorFromThread({
      id: 't2',
      customKeywords: ['$MailFlagBit0'],
      starred: true,
    });
    expect(TagStore.hasTag('t2', 'prio_q3')).toBe(false);
  });

  it('green flag → Q4 (Odłóż); red (gwiazdka) → Q1 (Zrób teraz)', () => {
    AppEnv.config.set('core.flags.mapToPriority', true);
    PriorityPresetStore.activatePreset('eisenhower');
    // green = 3 = Bit0+Bit1
    TagStore.syncFlagColorFromThread({
      id: 't3',
      customKeywords: ['$MailFlagBit0', '$MailFlagBit1'],
      starred: true,
    });
    expect(TagStore.hasTag('t3', 'flag_3')).toBe(true);
    expect(TagStore.hasTag('t3', 'prio_q4')).toBe(true);
    // czerwona = gwiazdka bez bitów → flag_0 + Q1
    TagStore.syncFlagColorFromThread({ id: 't5', customKeywords: [], starred: true });
    expect(TagStore.hasTag('t5', 'flag_0')).toBe(true);
    expect(TagStore.hasTag('t5', 'prio_q1')).toBe(true);
  });

  it('ponowny sync TEGO SAMEGO koloru NIE nadpisuje ręcznie zmienionego priorytetu', () => {
    AppEnv.config.set('core.flags.mapToPriority', true);
    PriorityPresetStore.activatePreset('eisenhower');
    TagStore.syncFlagColorFromThread({ id: 't', customKeywords: ['$MailFlagBit0'], starred: true }); // orange → q3
    expect(TagStore.hasTag('t', 'prio_q3')).toBe(true);
    // user ręcznie zmienia priorytet na q1
    PriorityPresetStore.setPriority('t', 'prio_q1');
    expect(TagStore.hasTag('t', 'prio_q1')).toBe(true);
    // ponowny sync tego samego koloru (delta bez zmiany) — priorytet zostaje q1
    TagStore.syncFlagColorFromThread({ id: 't', customKeywords: ['$MailFlagBit0'], starred: true });
    expect(TagStore.hasTag('t', 'prio_q1')).toBe(true);
    expect(TagStore.hasTag('t', 'prio_q3')).toBe(false);
  });
});
