/**
 * Background scheduler plugin entry — bilet MVP #91.
 *
 * activate():
 *   1. SchedulerStore.init() — load persisted actions z localStorage,
 *      re-schedule pending na startup.
 *   2. Expose `AppEnv.scheduler` public API (BackgroundScheduler).
 *
 * deactivate():
 *   1. Reset store (clears timers).
 *
 * Foundation dla #104 Snooze, #105 Send Later, #106 Follow-up, #100
 * scheduled rules. Każdy z tych biletów MUSI registerHandler() przy
 * własnym activate().
 */

import { SchedulerStore, BackgroundScheduler } from './scheduler-store';

export function activate() {
  SchedulerStore.init();
  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.scheduler = BackgroundScheduler;
}

export function deactivate() {
  SchedulerStore._reset();
  if ((window as any).AppEnv?.scheduler) {
    delete (window as any).AppEnv.scheduler;
  }
}
