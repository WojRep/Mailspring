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

  describe('touch target minimum size — REMOVED (v0.2.t hotfix)', () => {
    // History:
    //   v0.2.m 43a:   global `button { min-height: 36px; min-width: 36px }`
    //                 → caused sidebar unread badges + disclosure triangles
    //                 to inflate into 36×36 squares ("kółka artefakty").
    //   v0.2.s hotfix: scoped rule to .btn-toolbar / .btn-large only
    //                 → caused toolbar buttons to overflow message subject
    //                 area in narrow windows ("pasek nie miejsci ikon").
    //   v0.2.t hotfix: rule removed entirely. Mailspring's native button
    //                 sizes (~28-30px) are adequate for mouse pointer
    //                 interaction on desktop. Forward-looking touch
    //                 target sizing deferred to mobile day.
    //
    // Regression guards: ensure no min-size is forced on any button anymore.

    it('does NOT force min-size on bare <button>', () => {
      const btn = document.createElement('button');
      btn.textContent = 'Plain';
      host.appendChild(btn);
      const style = getComputedStyle(btn);
      expect(parseFloat(style.minHeight) || 0).toBeLessThan(36);
    });

    it('does NOT force min-size on button.btn-toolbar (Mailspring native sizing wins)', () => {
      const btn = document.createElement('button');
      btn.className = 'btn-toolbar';
      btn.textContent = 'Toolbar';
      host.appendChild(btn);
      const style = getComputedStyle(btn);
      // Mailspring's buttons.less may apply its own height, but it must not
      // be ≥36 due to OUR rule. Anything below 36 is acceptable here.
      expect(parseFloat(style.minHeight) || 0).toBeLessThan(36);
    });
  });
});
