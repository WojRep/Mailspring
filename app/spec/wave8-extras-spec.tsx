/**
 * RED tests — Wave 8: centrum-dnia + threading-tree + time-intent-tags components.
 */
import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

let CentrumDniaPane: any = null;
let ThreadingTreePopout: any = null;
let TimeIntentBadge: any = null;
try { CentrumDniaPane = require('../internal_packages/centrum-dnia/lib/centrum-dnia-pane').default; } catch (e) {}
try { ThreadingTreePopout = require('../internal_packages/threading-tree/lib/threading-tree-popout').default; } catch (e) {}
try { TimeIntentBadge = require('../internal_packages/time-intent-tags/lib/time-intent-badge').default; } catch (e) {}

const { CentrumDniaStore } = require('../internal_packages/centrum-dnia/lib/centrum-dnia-store');
const { TimeIntentStore } = require('../internal_packages/time-intent-tags/lib/time-intent-store');

describe('Wave 8 — plan v1.0 extras', () => {
  describe('CentrumDniaPane (#6 plan v1.0)', () => {
    beforeEach(() => {
      if (CentrumDniaStore._reset) { CentrumDniaStore._reset(); CentrumDniaStore.init(); }
    });
    afterEach(() => { cleanup(); });

    it('component exists', () => {
      expect(CentrumDniaPane).not.toBeNull();
    });

    it('hidden gdy pane zamknięty', () => {
      if (!CentrumDniaPane) return;
      const { container } = render(<CentrumDniaPane />);
      expect(container.querySelector('.centrum-dnia-pane')).toBeNull();
    });

    it('open → renderuje 3 sections (calendar/tasks/mails)', () => {
      if (!CentrumDniaPane) return;
      const { container } = render(<CentrumDniaPane />);
      CentrumDniaStore.openPane();
      expect(container.querySelector('.centrum-dnia-pane')).not.toBeNull();
      const sections = container.querySelectorAll('.centrum-dnia-section');
      expect(sections.length).toBe(3);
    });
  });

  describe('ThreadingTreePopout (#25 plan v1.0)', () => {
    afterEach(() => { cleanup(); });

    it('component exists', () => {
      expect(ThreadingTreePopout).not.toBeNull();
    });

    it('renderuje NIC bez tree prop', () => {
      if (!ThreadingTreePopout) return;
      const { container } = render(<ThreadingTreePopout />);
      expect(container.querySelector('.threading-tree-popout')).toBeNull();
    });

    it('renderuje tree gdy props.tree', () => {
      if (!ThreadingTreePopout) return;
      const tree = {
        roots: [{
          messageId: 'm1', subject: 'Root', from: 'a@b.com', date: Date.now(), children: [
            { messageId: 'm2', subject: 'Re: Root', from: 'c@d.com', date: Date.now(), children: [] },
          ],
        }],
        nodeCount: 2,
      };
      const { container } = render(<ThreadingTreePopout tree={tree} />);
      expect(container.querySelector('.threading-tree-popout')).not.toBeNull();
      const nodes = container.querySelectorAll('.threading-tree-node');
      expect(nodes.length).toBe(2);
    });
  });

  describe('TimeIntentBadge (#13 plan v1.0)', () => {
    beforeEach(() => {
      if (TimeIntentStore._reset) { TimeIntentStore._reset(); TimeIntentStore.init(); }
    });
    afterEach(() => { cleanup(); });

    it('component exists', () => {
      expect(TimeIntentBadge).not.toBeNull();
    });

    it('renderuje NIC gdy thread bez intent', () => {
      if (!TimeIntentBadge) return;
      const { container } = render(<TimeIntentBadge threadId="t1" />);
      expect(container.querySelector('.time-intent-badge')).toBeNull();
    });

    it('renderuje badge gdy thread ma intent="today"', () => {
      if (!TimeIntentBadge) return;
      TimeIntentStore.set('t2', 'today');
      const { container } = render(<TimeIntentBadge threadId="t2" />);
      const badge = container.querySelector('.time-intent-badge');
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toMatch(/today|dziś/i);
    });
  });
});
