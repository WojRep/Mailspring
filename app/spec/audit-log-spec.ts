/**
 * Bilet MVP #114 — Audit log infra unit tests.
 *
 * Pokrycie: log API z chain (prev_hash + hash), settings retention bounds,
 * paginated list, filter (subsystem/eventType/actor/range/targetIdLike),
 * retention purge, Art. 17 purgeByTargetId + bulk purgeBySubsystem, tamper chain
 * verification (valid + first invalid index), export JSON, persistence + load
 * clamp settings, listen notifications.
 */

import {
  AuditLogStore,
  RETENTION_OPTIONS_DAYS,
  RETENTION_DEFAULT_DAYS,
  RETENTION_MAX_DAYS,
  computeEntryHash,
} from '../internal_packages/audit-log/lib/audit-log-store';

describe('Audit log — bilet MVP #114', () => {

  beforeEach(() => {
    AuditLogStore._reset();
    AuditLogStore.init();
  });

  describe('settings + constants', () => {
    it('RETENTION_OPTIONS = [30, 90, 180, 365, 1825]', () => {
      expect(RETENTION_OPTIONS_DAYS).toEqual([30, 90, 180, 365, 1825]);
    });

    it('RETENTION_DEFAULT = 90', () => {
      expect(RETENTION_DEFAULT_DAYS).toBe(90);
    });

    it('RETENTION_MAX = 1825 (5 lat = KNF Rec. Z §43)', () => {
      expect(RETENTION_MAX_DAYS).toBe(1825);
    });

    it('default settings retentionDays = 90', () => {
      expect(AuditLogStore.getSettings().retentionDays).toBe(RETENTION_DEFAULT_DAYS);
    });

    it('setRetentionDays valid options OK', () => {
      AuditLogStore.setRetentionDays(180);
      expect(AuditLogStore.getSettings().retentionDays).toBe(180);
      AuditLogStore.setRetentionDays(1825);
      expect(AuditLogStore.getSettings().retentionDays).toBe(1825);
    });

    it('setRetentionDays invalid throws', () => {
      expect(() => AuditLogStore.setRetentionDays(7)).toThrowError(/30\/90\/180/);
      expect(() => AuditLogStore.setRetentionDays(2000)).toThrowError(/30\/90\/180/);
    });
  });

  describe('log API — entry creation + chain', () => {
    it('log() wymaga eventType + subsystem', () => {
      expect(() => (AuditLogStore as any).log({})).toThrowError(/required/);
      expect(() => AuditLogStore.log({ eventType: '', subsystem: 'tags' })).toThrowError(/required/);
    });

    it('log() tworzy entry z id + timestamp + actor=user default', () => {
      const e = AuditLogStore.log({ eventType: 'create', subsystem: 'tags', targetId: 'tag-1' });
      expect(e.id).toMatch(/^aud_/);
      expect(e.timestamp).toBeGreaterThan(0);
      expect(e.actor).toBe('user');
      expect(e.eventType).toBe('create');
      expect(e.subsystem).toBe('tags');
      expect(e.targetId).toBe('tag-1');
    });

    it('actor override (system/ai)', () => {
      const e = AuditLogStore.log({ actor: 'system', eventType: 'scheduled_run', subsystem: 'rules' });
      expect(e.actor).toBe('system');
    });

    it('zawiera before/after/metadata', () => {
      const e = AuditLogStore.log({
        eventType: 'update', subsystem: 'rules',
        before: { name: 'A' }, after: { name: 'B' }, metadata: { reason: 'test' },
      });
      expect(e.beforeJson).toEqual({ name: 'A' });
      expect(e.afterJson).toEqual({ name: 'B' });
      expect(e.metadataJson).toEqual({ reason: 'test' });
    });

    it('chain: pierwszy entry ma prevHash=genesis, kolejny ma prevHash poprzedniego', () => {
      const a = AuditLogStore.log({ eventType: 'a', subsystem: 'tags' });
      const b = AuditLogStore.log({ eventType: 'b', subsystem: 'tags' });
      expect(a.prevHash).toBe('0'.repeat(16));
      expect(b.prevHash).toBe(a.hash);
    });

    it('hash deterministic — computeEntryHash daje ten sam wynik', () => {
      const e = AuditLogStore.log({ eventType: 'a', subsystem: 'tags' });
      expect(computeEntryHash(e)).toBe(e.hash);
    });
  });

  describe('query (list + listPaginated + filter)', () => {
    beforeEach(() => {
      // Seed
      AuditLogStore.log({ eventType: 'create', subsystem: 'tags', targetId: 'tag-1' });
      AuditLogStore.log({ eventType: 'create', subsystem: 'rules', targetId: 'rule-1' });
      AuditLogStore.log({ eventType: 'delete', subsystem: 'tags', targetId: 'tag-1' });
      AuditLogStore.log({ actor: 'system', eventType: 'purge', subsystem: 'time' });
    });

    it('count', () => {
      expect(AuditLogStore.count()).toBe(4);
    });

    it('list zwraca array', () => {
      expect(AuditLogStore.list().length).toBe(4);
    });

    it('listPaginated newest first', () => {
      const p = AuditLogStore.listPaginated(0, 2);
      expect(p.entries.length).toBe(2);
      expect(p.totalPages).toBe(2);
    });

    it('filter po subsystem', () => {
      expect(AuditLogStore.filter({ subsystem: 'tags' }).length).toBe(2);
    });

    it('filter po eventType', () => {
      expect(AuditLogStore.filter({ eventType: 'create' }).length).toBe(2);
    });

    it('filter po actor', () => {
      expect(AuditLogStore.filter({ actor: 'system' }).length).toBe(1);
    });

    it('filter po targetIdLike', () => {
      expect(AuditLogStore.filter({ targetIdLike: 'tag' }).length).toBe(2);
    });

    it('filter po range (fromTs)', () => {
      const future = Date.now() + 100000;
      expect(AuditLogStore.filter({ fromTs: future }).length).toBe(0);
    });

    it('combined filter', () => {
      const r = AuditLogStore.filter({ subsystem: 'tags', eventType: 'delete' });
      expect(r.length).toBe(1);
      expect(r[0].targetId).toBe('tag-1');
    });
  });

  describe('retention purge', () => {
    it('purgeExpired usuwa entries starsze niż retention', () => {
      AuditLogStore.setRetentionDays(30);
      const oldEntry: any = {
        id: 'aud_old', timestamp: Date.now() - 60 * 24 * 60 * 60 * 1000,
        actor: 'user', eventType: 'old', subsystem: 'tags',
        prevHash: '0000', hash: '1111',
      };
      const freshEntry: any = {
        id: 'aud_fresh', timestamp: Date.now(),
        actor: 'user', eventType: 'fresh', subsystem: 'tags',
        prevHash: '1111', hash: '2222',
      };
      (AuditLogStore as any)._entries.push(oldEntry, freshEntry);
      const removed = AuditLogStore.purgeExpired();
      expect(removed).toBe(1);
      expect(AuditLogStore.count()).toBe(1);
      expect(AuditLogStore.list()[0].id).toBe('aud_fresh');
    });

    it('purgeAll', () => {
      AuditLogStore.log({ eventType: 'a', subsystem: 'tags' });
      AuditLogStore.log({ eventType: 'b', subsystem: 'tags' });
      const removed = AuditLogStore.purgeAll();
      expect(removed).toBe(2);
      expect(AuditLogStore.count()).toBe(0);
    });
  });

  describe('Art. 17 cascade purge', () => {
    beforeEach(() => {
      AuditLogStore.log({ eventType: 'create', subsystem: 'contacts', targetId: 'bob@x.com' });
      AuditLogStore.log({ eventType: 'update', subsystem: 'contacts', targetId: 'bob@x.com' });
      AuditLogStore.log({ eventType: 'create', subsystem: 'contacts', targetId: 'alice@x.com' });
    });

    it('purgeByTargetId usuwa wszystkie dla tego target', () => {
      const removed = AuditLogStore.purgeByTargetId('bob@x.com');
      expect(removed).toBe(2);
      expect(AuditLogStore.count()).toBe(1);
    });

    it('purgeByTargetId nieznany → 0', () => {
      expect(AuditLogStore.purgeByTargetId('unknown@x.com')).toBe(0);
    });

    it('purgeBySubsystem', () => {
      AuditLogStore.log({ eventType: 'x', subsystem: 'rules' });
      const removed = AuditLogStore.purgeBySubsystem('contacts');
      expect(removed).toBe(3);
      expect(AuditLogStore.count()).toBe(1);
    });
  });

  describe('verifyChain (tamper detection)', () => {
    it('clean chain → valid', () => {
      AuditLogStore.log({ eventType: 'a', subsystem: 'tags' });
      AuditLogStore.log({ eventType: 'b', subsystem: 'tags' });
      AuditLogStore.log({ eventType: 'c', subsystem: 'tags' });
      expect(AuditLogStore.verifyChain().valid).toBe(true);
    });

    it('tampered entry content → invalid z firstInvalidIndex', () => {
      AuditLogStore.log({ eventType: 'a', subsystem: 'tags' });
      AuditLogStore.log({ eventType: 'b', subsystem: 'tags' });
      // Tamper z drugim entry — zmień eventType (hash invalid)
      (AuditLogStore as any)._entries[1].eventType = 'b_TAMPERED';
      const r = AuditLogStore.verifyChain();
      expect(r.valid).toBe(false);
      expect(r.firstInvalidIndex).toBe(1);
    });

    it('broken chain (prev_hash mismatch) → invalid', () => {
      AuditLogStore.log({ eventType: 'a', subsystem: 'tags' });
      AuditLogStore.log({ eventType: 'b', subsystem: 'tags' });
      // Tamper z prev_hash drugiego
      (AuditLogStore as any)._entries[1].prevHash = 'badbadbad0000000';
      const r = AuditLogStore.verifyChain();
      expect(r.valid).toBe(false);
      expect(r.firstInvalidIndex).toBe(1);
    });

    it('empty chain → valid', () => {
      expect(AuditLogStore.verifyChain().valid).toBe(true);
    });
  });

  describe('exportJSON', () => {
    it('zwraca z schemaVersion + chainValid + entries', () => {
      AuditLogStore.log({ eventType: 'a', subsystem: 'tags' });
      const json = JSON.parse(AuditLogStore.exportJSON());
      expect(json.schemaVersion).toBe('1.0');
      expect(json.chainValid).toBe(true);
      expect(json.entries.length).toBe(1);
      expect(json.retentionDays).toBe(RETENTION_DEFAULT_DAYS);
    });

    it('export z filter', () => {
      AuditLogStore.log({ eventType: 'a', subsystem: 'tags' });
      AuditLogStore.log({ eventType: 'b', subsystem: 'rules' });
      const json = JSON.parse(AuditLogStore.exportJSON({ subsystem: 'rules' }));
      expect(json.entries.length).toBe(1);
      expect(json.entries[0].subsystem).toBe('rules');
    });
  });

  describe('persistence + load clamp', () => {
    it('persists entries + settings', () => {
      AuditLogStore.setRetentionDays(180);
      AuditLogStore.log({ eventType: 'a', subsystem: 'tags' });
      expect(localStorage.getItem('actuna.audit-log')).toContain('"eventType":"a"');
      expect(localStorage.getItem('actuna.audit-settings')).toContain('180');
    });

    it('load skip invalid retention setting', () => {
      localStorage.setItem('actuna.audit-settings', JSON.stringify({ retentionDays: 999 }));
      AuditLogStore._reset();
      AuditLogStore.init();
      expect(AuditLogStore.getSettings().retentionDays).toBe(RETENTION_DEFAULT_DAYS);
    });
  });

  describe('listen', () => {
    it('emit na log/setRetentionDays/purge', () => {
      let n = 0;
      const unsub = AuditLogStore.listen(() => n++);
      AuditLogStore.log({ eventType: 'a', subsystem: 'tags' });
      AuditLogStore.setRetentionDays(180);
      AuditLogStore.purgeAll();
      expect(n).toBe(3);
      unsub();
    });
  });
});
