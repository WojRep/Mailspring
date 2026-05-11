import configSchema from '../src/config-schema';

// Ticket 09 — Default settings — 24h clock + show-full-headers ON for
// new installs. PL/EU users expect 24-hour clock; compliance-conscious
// audience benefits from seeing full RFC 5322 headers by default.
//
// This spec is a true TDD red→green cycle (first since methodology
// bootstrap): assertions written FIRST, fail against current upstream
// defaults (both false), then config-schema.ts edited so they pass.

describe('config-schema defaults — ActunaMail v0.2 EU baseline', () => {
  describe('use24HourClock', () => {
    it('defaults to true (PL/EU convention)', () => {
      const node = (configSchema as any).core.properties.workspace.properties.use24HourClock;
      expect(node).toBeDefined();
      expect(node.type).toBe('boolean');
      expect(node.default).toBe(true);
    });
  });

  describe('detailedHeaders (Show full message headers)', () => {
    it('defaults to true (compliance-conscious audience)', () => {
      const node = (configSchema as any).core.properties.reading.properties.detailedHeaders;
      expect(node).toBeDefined();
      expect(node.type).toBe('boolean');
      expect(node.default).toBe(true);
    });
  });

  describe('no other default flip occurred', () => {
    // Regression guard — make sure we didn't accidentally flip other
    // workspace/reading boolean defaults while editing this area.
    it('detailedNames stays at false (single decision per ticket)', () => {
      const node = (configSchema as any).core.properties.reading.properties.detailedNames;
      expect(node.default).toBe(false);
    });
  });
});
