import configSchema from '../src/config-schema';

/**
 * Ticket #47 Tier A — UX zapisu załączników.
 *
 * Część 1: config-schema dla `core.attachments.defaultSaveTarget`
 *   - enum z 4 wartości (downloads / documents / lastUsed / askEveryTime)
 *   - default 'askEveryTime' (zachowanie wsteczne — modal jak wcześniej)
 *   - enumLabels obecne dla każdej wartości
 *
 * Część 2: regresja — `openFolderAfterDownload` + `displayFilePreview`
 *   pozostają na swoich miejscach (nie zostały usunięte podczas rozszerzania).
 */

describe('Ticket #47 Tier A — defaultSaveTarget config-schema', () => {
  let attachments: any;

  beforeEach(() => {
    attachments = (configSchema as any).core.properties.attachments;
  });

  it('attachments podsekcja istnieje', () => {
    expect(attachments).toBeDefined();
    expect(attachments.type).toBe('object');
  });

  describe('defaultSaveTarget', () => {
    it('jest zdefiniowany jako string enum', () => {
      const node = attachments.properties.defaultSaveTarget;
      expect(node).toBeDefined();
      expect(node.type).toBe('string');
      expect(Array.isArray(node.enum)).toBe(true);
    });

    it('zawiera 4 wartości: downloads / documents / lastUsed / askEveryTime', () => {
      const node = attachments.properties.defaultSaveTarget;
      expect(node.enum).toEqual(['downloads', 'documents', 'lastUsed', 'askEveryTime']);
    });

    it('default to askEveryTime (zachowanie wsteczne)', () => {
      const node = attachments.properties.defaultSaveTarget;
      expect(node.default).toBe('askEveryTime');
    });

    it('ma enumLabels (jedna etykieta per enum value)', () => {
      const node = attachments.properties.defaultSaveTarget;
      expect(Array.isArray(node.enumLabels)).toBe(true);
      expect(node.enumLabels.length).toBe(node.enum.length);
      node.enumLabels.forEach((label: string) => {
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(0);
      });
    });

    it('ma title (renderowane w Preferences > General > Attachments)', () => {
      const node = attachments.properties.defaultSaveTarget;
      expect(typeof node.title).toBe('string');
      expect(node.title.length).toBeGreaterThan(0);
    });
  });

  describe('regresja — istniejące pola attachments', () => {
    it('openFolderAfterDownload pozostaje boolean default false', () => {
      const node = attachments.properties.openFolderAfterDownload;
      expect(node).toBeDefined();
      expect(node.type).toBe('boolean');
      expect(node.default).toBe(false);
    });

    it('displayFilePreview pozostaje boolean default true', () => {
      const node = attachments.properties.displayFilePreview;
      expect(node).toBeDefined();
      expect(node.type).toBe('boolean');
      expect(node.default).toBe(true);
    });
  });
});
