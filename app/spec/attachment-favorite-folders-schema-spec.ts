import configSchema from '../src/config-schema';

/**
 * Ticket #88 — Tier B follow-up. favoriteFolders w config-schema.
 * Custom UI w Preferences zarządza tą tablicą; tutaj sprawdzamy
 * tylko schema kontrakt + default value.
 */

describe('Ticket #88 — favoriteFolders config-schema', () => {
  let attachments: any;

  beforeEach(() => {
    attachments = (configSchema as any).core.properties.attachments;
  });

  it('favoriteFolders zdefiniowany jako array stringów', () => {
    const node = attachments.properties.favoriteFolders;
    expect(node).toBeDefined();
    expect(node.type).toBe('array');
    expect(node.items).toBeDefined();
    expect(node.items.type).toBe('string');
  });

  it('default to pusta tablica []', () => {
    const node = attachments.properties.favoriteFolders;
    expect(Array.isArray(node.default)).toBe(true);
    expect(node.default.length).toBe(0);
  });

  it('nie zmienia defaultSaveTarget (regresja #47)', () => {
    const node = attachments.properties.defaultSaveTarget;
    expect(node).toBeDefined();
    expect(node.default).toBe('askEveryTime');
    expect(node.enum).toEqual(['downloads', 'documents', 'lastUsed', 'askEveryTime']);
  });
});
