/**
 * Bilet MVP #103 — People hub + vCard parser + CardDAV stub unit tests.
 *
 * Pokrycie:
 *  - vCard parse: 3.0 + 4.0, FN, N, EMAIL multi, TEL multi, ORG/TITLE/NOTE/URL, line folding.
 *  - vCard serialize roundtrip.
 *  - parseVCards multi-card concatenation, skip invalid.
 *  - Sender Groups CRUD (manual + autoDomain).
 *  - groupMembers (autoDomain matches ContactCards + autocomplete + manual).
 *  - groupsForEmail.
 *  - Autocomplete: recordUsage (frequency + recency), searchAutocomplete ranking (frequency × recency boost).
 *  - inContacts flag reflects ContactCard or group membership.
 *  - vCard import/export integration z ContactCardStore.
 *  - CardDAVAdapter add/remove/list/stub sync.
 *  - localStorage persistence.
 */

import {
  parseVCard,
  parseVCards,
  serializeVCard,
  serializeVCards,
  VCard,
} from '../internal_packages/people-hub/lib/vcard';
import { PeopleHubStore } from '../internal_packages/people-hub/lib/people-hub-store';
import { CardDAVAdapter } from '../internal_packages/people-hub/lib/carddav-adapter';
import { ContactCardStore } from '../internal_packages/contact-card/lib/contact-card-store';

describe('People hub — bilet MVP #103', () => {

  beforeEach(() => {
    PeopleHubStore._reset();
    CardDAVAdapter._reset();
    ContactCardStore._reset();
    PeopleHubStore.init();
    CardDAVAdapter.init();
    ContactCardStore.init();
  });

  // === vCard parser ===

  describe('parseVCard', () => {
    it('parses minimal 3.0 z FN + EMAIL', () => {
      const txt = `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Bob Smith\r\nEMAIL:bob@example.com\r\nEND:VCARD`;
      const card = parseVCard(txt);
      expect(card.version).toBe('3.0');
      expect(card.fn).toBe('Bob Smith');
      expect(card.emails[0].value).toBe('bob@example.com');
    });

    it('parses 4.0 z N strukturalnym + ORG + TITLE + NOTE + URL', () => {
      const txt = [
        'BEGIN:VCARD',
        'VERSION:4.0',
        'FN:Alice Wonderland',
        'N:Wonderland;Alice;;Dr.;PhD',
        'EMAIL;TYPE=work:alice@acme.com',
        'EMAIL;TYPE=home:alice@home.com',
        'TEL;TYPE=cell:+48-600-100-200',
        'ORG:ACME Inc',
        'TITLE:Engineering Director',
        'NOTE:Met at conference 2025',
        'URL:https://acme.com/alice',
        'END:VCARD',
      ].join('\r\n');
      const card = parseVCard(txt);
      expect(card.version).toBe('4.0');
      expect(card.n?.family).toBe('Wonderland');
      expect(card.n?.given).toBe('Alice');
      expect(card.n?.prefix).toBe('Dr.');
      expect(card.n?.suffix).toBe('PhD');
      expect(card.emails.length).toBe(2);
      expect(card.tels[0].value).toBe('+48-600-100-200');
      expect(card.org).toBe('ACME Inc');
      expect(card.title).toBe('Engineering Director');
      expect(card.note).toBe('Met at conference 2025');
      expect(card.url).toBe('https://acme.com/alice');
    });

    it('rzuca dla braku BEGIN/END', () => {
      expect(() => parseVCard('VERSION:4.0\nFN:X\n')).toThrow();
      expect(() => parseVCard('BEGIN:VCARD\nFN:X\n')).toThrow();
    });

    it('rzuca dla braku FN i N', () => {
      const txt = `BEGIN:VCARD\nVERSION:4.0\nEMAIL:x@x.com\nEND:VCARD`;
      expect(() => parseVCard(txt)).toThrow();
    });

    it('FN derived from N gdy brak FN', () => {
      const txt = `BEGIN:VCARD\nVERSION:4.0\nN:Doe;Jane;;;\nEMAIL:jd@x.com\nEND:VCARD`;
      const card = parseVCard(txt);
      expect(card.fn).toBe('Jane Doe');
    });

    it('unfolds soft line breaks (RFC line folding)', () => {
      // FN value split z soft break:
      const txt = `BEGIN:VCARD\nVERSION:4.0\nFN:Very Long Na\n me Continued\nEND:VCARD`;
      const card = parseVCard(txt);
      expect(card.fn).toBe('Very Long Name Continued');
    });

    it('unescapes \\, \\; \\\\ \\n', () => {
      const txt = `BEGIN:VCARD\nVERSION:4.0\nFN:Smith\\, John\nNOTE:line1\\nline2\nEND:VCARD`;
      const card = parseVCard(txt);
      expect(card.fn).toBe('Smith, John');
      expect(card.note).toBe('line1\nline2');
    });
  });

  describe('parseVCards (multi)', () => {
    it('parses dwie karty concatenated', () => {
      const txt = [
        'BEGIN:VCARD\nVERSION:4.0\nFN:A\nEND:VCARD',
        'BEGIN:VCARD\nVERSION:4.0\nFN:B\nEND:VCARD',
      ].join('\n');
      const cards = parseVCards(txt);
      expect(cards.length).toBe(2);
      expect(cards.map(c => c.fn).sort()).toEqual(['A', 'B']);
    });

    it('skip invalid bez crashu', () => {
      spyOn(console, 'error');
      const txt = [
        'BEGIN:VCARD\nVERSION:4.0\nFN:Good\nEND:VCARD',
        'BEGIN:VCARD\nINVALID', // no END
      ].join('\n');
      const cards = parseVCards(txt);
      expect(cards.length).toBe(1);
      expect(cards[0].fn).toBe('Good');
    });
  });

  describe('serialize roundtrip', () => {
    it('serialize+parse zachowuje fields', () => {
      const orig: VCard = {
        version: '4.0',
        fn: 'Bob Smith',
        n: { family: 'Smith', given: 'Bob', additional: '', prefix: '', suffix: '' },
        emails: [{ value: 'bob@x.com', type: 'work' }],
        tels: [{ value: '+48600000000', type: 'cell' }],
        org: 'ACME',
        title: 'Lead',
        note: 'note',
        url: 'https://x.com',
      };
      const txt = serializeVCard(orig);
      const reparsed = parseVCard(txt);
      expect(reparsed.fn).toBe(orig.fn);
      expect(reparsed.n?.family).toBe('Smith');
      expect(reparsed.emails[0].value).toBe('bob@x.com');
      expect(reparsed.org).toBe('ACME');
      expect(reparsed.url).toBe('https://x.com');
    });

    it('escape special chars w roundtrip', () => {
      const orig: VCard = {
        version: '4.0',
        fn: 'Smith, John',
        emails: [],
        tels: [],
        note: 'multi\nline',
      };
      const txt = serializeVCard(orig);
      const reparsed = parseVCard(txt);
      expect(reparsed.fn).toBe('Smith, John');
      expect(reparsed.note).toBe('multi\nline');
    });
  });

  // === Sender Groups ===

  describe('Sender Groups CRUD', () => {
    it('createGroup wymaga name', () => {
      expect(() => PeopleHubStore.createGroup({ name: '' })).toThrowError(/name required/);
    });

    it('createGroup z autoDomain lowercases + strips @', () => {
      const g = PeopleHubStore.createGroup({ name: 'Acme', autoDomain: '@EXAMPLE.COM' });
      expect(g.autoDomain).toBe('example.com');
    });

    it('createGroup z manualEmails lowercase+trim', () => {
      const g = PeopleHubStore.createGroup({ name: 'X', manualEmails: ['  Bob@X.com  ', 'alice@y.com'] });
      expect(g.manualEmails.sort()).toEqual(['alice@y.com', 'bob@x.com']);
    });

    it('updateGroup patches + preserves id+createdAt', () => {
      const g = PeopleHubStore.createGroup({ name: 'A' });
      const upd = PeopleHubStore.updateGroup(g.id, { name: 'B', color: 'red' });
      expect(upd?.name).toBe('B');
      expect(upd?.color).toBe('red');
      expect(upd?.createdAt).toBe(g.createdAt);
    });

    it('deleteGroup', () => {
      const g = PeopleHubStore.createGroup({ name: 'A' });
      expect(PeopleHubStore.deleteGroup(g.id)).toBe(true);
      expect(PeopleHubStore.getGroup(g.id)).toBeUndefined();
    });

    it('listGroups alfabetycznie', () => {
      PeopleHubStore.createGroup({ name: 'Zeta' });
      PeopleHubStore.createGroup({ name: 'Alpha' });
      const names = PeopleHubStore.listGroups().map(g => g.name);
      expect(names).toEqual(['Alpha', 'Zeta']);
    });
  });

  describe('groupMembers + groupsForEmail', () => {
    it('groupMembers łączy manualEmails + autoDomain z ContactCards', () => {
      ContactCardStore.upsert('alice@acme.com');
      ContactCardStore.upsert('bob@acme.com');
      ContactCardStore.upsert('out@other.com');
      const g = PeopleHubStore.createGroup({
        name: 'Acme',
        autoDomain: 'acme.com',
        manualEmails: ['extra@somewhere.com'],
      });
      const members = PeopleHubStore.groupMembers(g.id);
      expect(members.sort()).toEqual(['alice@acme.com', 'bob@acme.com', 'extra@somewhere.com']);
    });

    it('groupMembers — manual only', () => {
      const g = PeopleHubStore.createGroup({ name: 'X', manualEmails: ['a@x.com'] });
      expect(PeopleHubStore.groupMembers(g.id)).toEqual(['a@x.com']);
    });

    it('groupMembers nieistniejącego → puste', () => {
      expect(PeopleHubStore.groupMembers('group_nope')).toEqual([]);
    });

    it('groupsForEmail wykrywa manual + autoDomain', () => {
      const gA = PeopleHubStore.createGroup({ name: 'A', autoDomain: 'acme.com' });
      const gB = PeopleHubStore.createGroup({ name: 'B', manualEmails: ['bob@x.com'] });
      const forBob = PeopleHubStore.groupsForEmail('bob@acme.com');
      expect(forBob.map(g => g.id)).toEqual([gA.id]);
      const forBobX = PeopleHubStore.groupsForEmail('bob@x.com');
      expect(forBobX.map(g => g.id)).toEqual([gB.id]);
    });
  });

  // === Autocomplete ===

  describe('autocomplete', () => {
    it('recordUsage tworzy entry z frequency 1 + lastUsedAt now', () => {
      PeopleHubStore.recordUsage('bob@x.com', 'Bob');
      const e = PeopleHubStore.getAutocompleteEntry('bob@x.com');
      expect(e?.frequency).toBe(1);
      expect(e?.name).toBe('Bob');
      expect(e?.lastUsedAt).toBeGreaterThan(0);
    });

    it('recordUsage drugi raz inkrementuje frequency', () => {
      PeopleHubStore.recordUsage('bob@x.com');
      PeopleHubStore.recordUsage('bob@x.com');
      PeopleHubStore.recordUsage('bob@x.com');
      expect(PeopleHubStore.getAutocompleteEntry('bob@x.com')?.frequency).toBe(3);
    });

    it('recordUsage case+trim normalizes', () => {
      PeopleHubStore.recordUsage('  BOB@X.com  ');
      expect(PeopleHubStore.getAutocompleteEntry('bob@x.com')?.frequency).toBe(1);
    });

    it('recordUsage ignoruje pusty email', () => {
      PeopleHubStore.recordUsage('');
      expect(PeopleHubStore.countAutocomplete()).toBe(0);
    });

    it('searchAutocomplete < 2 znaki → puste', () => {
      PeopleHubStore.recordUsage('bob@x.com');
      expect(PeopleHubStore.searchAutocomplete('b')).toEqual([]);
    });

    it('searchAutocomplete matche email + name', () => {
      PeopleHubStore.recordUsage('bob@x.com', 'Bob Smith');
      PeopleHubStore.recordUsage('alice@y.com', 'Alice');
      expect(PeopleHubStore.searchAutocomplete('bob').length).toBe(1);
      expect(PeopleHubStore.searchAutocomplete('smith').length).toBe(1);
      expect(PeopleHubStore.searchAutocomplete('y.com').length).toBe(1);
    });

    it('searchAutocomplete sortuje wg frequency × recency boost', () => {
      // Manualnie set entries z różnymi frequency + lastUsedAt
      PeopleHubStore.recordUsage('high-freq@x.com', 'A');
      PeopleHubStore.recordUsage('high-freq@x.com', 'A');
      PeopleHubStore.recordUsage('high-freq@x.com', 'A');
      PeopleHubStore.recordUsage('high-freq@x.com', 'A');
      PeopleHubStore.recordUsage('high-freq@x.com', 'A');
      PeopleHubStore.recordUsage('low-freq@x.com', 'B');
      const out = PeopleHubStore.searchAutocomplete('freq');
      expect(out[0].email).toBe('high-freq@x.com');
      expect(out[1].email).toBe('low-freq@x.com');
    });

    it('searchAutocomplete limit działa', () => {
      for (let i = 0; i < 20; i++) {
        PeopleHubStore.recordUsage(`bob${i}@x.com`);
      }
      expect(PeopleHubStore.searchAutocomplete('bob', 5).length).toBe(5);
    });

    it('inContacts true gdy ContactCard istnieje', () => {
      ContactCardStore.upsert('bob@x.com');
      PeopleHubStore.recordUsage('bob@x.com');
      expect(PeopleHubStore.getAutocompleteEntry('bob@x.com')?.inContacts).toBe(true);
    });

    it('inContacts false dla nieznanego', () => {
      PeopleHubStore.recordUsage('stranger@x.com');
      expect(PeopleHubStore.getAutocompleteEntry('stranger@x.com')?.inContacts).toBe(false);
    });

    it('inContacts true gdy w manual group', () => {
      PeopleHubStore.createGroup({ name: 'G', manualEmails: ['gm@x.com'] });
      PeopleHubStore.recordUsage('gm@x.com');
      expect(PeopleHubStore.getAutocompleteEntry('gm@x.com')?.inContacts).toBe(true);
    });
  });

  // === vCard import/export integration ===

  describe('vCard import/export z ContactCardStore', () => {
    it('importVCards tworzy ContactCards', () => {
      const txt = [
        'BEGIN:VCARD\nVERSION:4.0\nFN:Alice\nEMAIL:alice@x.com\nORG:ACME\nEND:VCARD',
        'BEGIN:VCARD\nVERSION:4.0\nFN:Bob\nEMAIL:bob@x.com\nEND:VCARD',
      ].join('\n');
      const n = PeopleHubStore.importVCards(txt);
      expect(n).toBe(2);
      expect(ContactCardStore.get('alice@x.com')?.name).toBe('Alice');
      expect(ContactCardStore.get('alice@x.com')?.organization).toBe('ACME');
    });

    it('importVCards skip cards bez email', () => {
      const txt = `BEGIN:VCARD\nVERSION:4.0\nFN:NoEmail\nEND:VCARD`;
      expect(PeopleHubStore.importVCards(txt)).toBe(0);
    });

    it('exportVCards zwraca vCard 4.0 dla wszystkich ContactCards', () => {
      ContactCardStore.upsert('a@x.com', { name: 'Alice' });
      ContactCardStore.upsert('b@x.com', { name: 'Bob', organization: 'ACME' });
      const vcf = PeopleHubStore.exportVCards();
      expect(vcf).toContain('FN:Alice');
      expect(vcf).toContain('FN:Bob');
      expect(vcf).toContain('ORG:ACME');
      expect(vcf).toContain('VERSION:4.0');
    });
  });

  // === CardDAV stub ===

  describe('CardDAVAdapter', () => {
    it('addAccount wymaga url + username', () => {
      expect(() => CardDAVAdapter.addAccount({ provider: 'icloud', url: '', username: '' }))
        .toThrowError(/url \+ username required/);
    });

    it('addAccount + listAccounts + removeAccount', () => {
      const a = CardDAVAdapter.addAccount({
        provider: 'fastmail',
        url: 'https://carddav.fastmail.com/',
        username: 'user@fastmail.com',
      });
      expect(CardDAVAdapter.listAccounts().length).toBe(1);
      expect(a.syncIntervalSec).toBe(900);
      expect(CardDAVAdapter.removeAccount(a.id)).toBe(true);
      expect(CardDAVAdapter.listAccounts().length).toBe(0);
    });

    it('syncAccount stub zwraca SyncResult z errors marker', async () => {
      const a = CardDAVAdapter.addAccount({
        provider: 'nextcloud',
        url: 'https://nc.example/dav/',
        username: 'me',
      });
      const result = await CardDAVAdapter.syncAccount(a.id);
      expect(result.accountId).toBe(a.id);
      expect(result.fetched).toBe(0);
      expect(result.errors[0]).toContain('stub');
      expect(CardDAVAdapter.getAccount(a.id)?.lastSyncAt).toBeGreaterThan(0);
    });

    it('syncAccount nieistniejącego → error w SyncResult', async () => {
      const result = await CardDAVAdapter.syncAccount('dav_nope');
      expect(result.errors[0]).toContain('not found');
    });
  });

  // === Persistence ===

  describe('persistence', () => {
    it('persists groups + autocomplete do localStorage', () => {
      PeopleHubStore.createGroup({ name: 'Persisted' });
      PeopleHubStore.recordUsage('test@x.com');
      expect(localStorage.getItem('actuna.people-groups')).toContain('Persisted');
      expect(localStorage.getItem('actuna.people-autocomplete')).toContain('test@x.com');
    });

    it('CardDAVAdapter persists', () => {
      CardDAVAdapter.addAccount({ provider: 'icloud', url: 'https://x/', username: 'me' });
      expect(localStorage.getItem('actuna.carddav-accounts')).toContain('icloud');
    });
  });
});
