// Ticket 43a — UX hover discoverability (cursor + touch + active feedback).
//
// Strategy: spec verifies that global stylesheet (interactivity.less,
// imported by index.less) produces the expected computed style on
// interactive elements. Mailspring spec runner loads full UI environment
// inside Electron renderer, so getComputedStyle reflects real applied
// rules.

describe('interactivity CSS (cursor + touch + active feedback)', () => {
  let host: HTMLElement;

  beforeEach(() => {
    // Isolate test elements in a host to avoid contaminating other specs.
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  describe('cursor: pointer affordance', () => {
    it('applies cursor: pointer to <button> elements', () => {
      const btn = document.createElement('button');
      btn.textContent = 'Click me';
      host.appendChild(btn);
      const style = getComputedStyle(btn);
      expect(style.cursor).toBe('pointer');
    });

    it('applies cursor: pointer to elements with role="button"', () => {
      const div = document.createElement('div');
      div.setAttribute('role', 'button');
      div.textContent = 'Clickable div';
      host.appendChild(div);
      const style = getComputedStyle(div);
      expect(style.cursor).toBe('pointer');
    });

    it('applies cursor: pointer to <a href="..."> links', () => {
      const link = document.createElement('a');
      link.href = '#test';
      link.textContent = 'A link';
      host.appendChild(link);
      const style = getComputedStyle(link);
      expect(style.cursor).toBe('pointer');
    });

    it('applies cursor: not-allowed to disabled buttons', () => {
      const btn = document.createElement('button');
      btn.disabled = true;
      btn.textContent = 'Disabled';
      host.appendChild(btn);
      const style = getComputedStyle(btn);
      expect(style.cursor).toBe('not-allowed');
    });

    it('applies cursor: not-allowed to aria-disabled elements', () => {
      const div = document.createElement('div');
      div.setAttribute('role', 'button');
      div.setAttribute('aria-disabled', 'true');
      div.textContent = 'Aria-disabled';
      host.appendChild(div);
      const style = getComputedStyle(div);
      expect(style.cursor).toBe('not-allowed');
    });
  });

  describe('touch target minimum size (Fitts\'s Law forward-looking)', () => {
    it('applies min-height >= 36px to <button>', () => {
      const btn = document.createElement('button');
      btn.textContent = 'Tap me';
      host.appendChild(btn);
      const style = getComputedStyle(btn);
      expect(parseFloat(style.minHeight)).toBeGreaterThanOrEqual(36);
    });

    it('applies min-width >= 36px to <button>', () => {
      const btn = document.createElement('button');
      btn.textContent = 'Tap me';
      host.appendChild(btn);
      const style = getComputedStyle(btn);
      expect(parseFloat(style.minWidth)).toBeGreaterThanOrEqual(36);
    });
  });
});
