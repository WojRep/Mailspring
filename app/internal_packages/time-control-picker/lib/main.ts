/**
 * Time-control picker plugin entry — bilet MVP #90.
 *
 * Eksportuje React component + parser API przez AppEnv.timeControl.
 * Reuse-owany przez Snooze (#104), Send Later (#105), Follow-up (#106).
 */

import TimeControl from './time-control';
import { parseNaturalLanguage } from './natural-language-parser';

export function activate() {
  // Public API
  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.timeControl = {
    Component: TimeControl,
    parseNaturalLanguage,
  };
}

export function deactivate() {
  if ((window as any).AppEnv?.timeControl) {
    delete (window as any).AppEnv.timeControl;
  }
}
