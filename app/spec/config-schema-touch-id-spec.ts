import configSchema from '../src/config-schema';

/**
 * Ticket #41 — core.security.useTouchID config-schema entry.
 */

describe('config-schema — core.security.useTouchID (ticket #41)', () => {
  let security: any;

  beforeEach(() => {
    security = (configSchema as any).core.properties.security;
  });

  it('security section istnieje', () => {
    expect(security).toBeDefined();
    expect(security.type).toBe('object');
  });

  it('useTouchID jest boolean default false (opt-in per Apple Privacy)', () => {
    const node = security.properties.useTouchID;
    expect(node).toBeDefined();
    expect(node.type).toBe('boolean');
    expect(node.default).toBe(false);
  });

  it('useTouchID jest platform-restricted do darwin', () => {
    const node = security.properties.useTouchID;
    expect(Array.isArray(node.platforms)).toBe(true);
    expect(node.platforms).toEqual(['darwin']);
  });

  it('useTouchID ma title + note (descriptive UI)', () => {
    const node = security.properties.useTouchID;
    expect(typeof node.title).toBe('string');
    expect(node.title.length).toBeGreaterThan(0);
    expect(typeof node.note).toBe('string');
    expect(node.note.length).toBeGreaterThan(0);
  });
});
