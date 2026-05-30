/**
 * Bulk Unsubscribe plugin entry — bilet MVP #115.
 */

import { ComponentRegistry } from 'actunamail-exports';
import BulkUnsubscribeBanner from './bulk-unsubscribe-banner';
import { SubscriptionStore } from './subscription-store';
import { parseListUnsubscribe, extractMailtoAddress } from './list-unsubscribe-parser';

export function activate() {
  SubscriptionStore.init();

  // Mount banner w MessageList:Header slot — widoczny gdy thread ma
  // List-Unsubscribe header (RFC 2369/8058). Plan v1.0 #115.
  ComponentRegistry.register(BulkUnsubscribeBanner, {
    role: 'MessageList:Header',
  });

  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'unsubscribe:list',
      label: 'Lista subskrypcji / Subscriptions',
      section: 'Privacy',
      keywords: ['unsubscribe', 'subscribe', 'newsletter', 'lista'],
      handler: () => openList(),
    });
    palette.register({
      id: 'unsubscribe:bulk',
      label: 'Bulk unsubscribe (multi-select)',
      section: 'Privacy',
      keywords: ['unsubscribe', 'bulk', 'multi', 'wszystko'],
      handler: () => openBulkSelect(),
    });
  }

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.unsubscribe = {
    Store: SubscriptionStore,
    parseListUnsubscribe,
    extractMailtoAddress,
  };
}

export function deactivate() {
  ComponentRegistry.unregister(BulkUnsubscribeBanner);
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.unregister('unsubscribe:list');
    palette.unregister('unsubscribe:bulk');
  }
  if ((window as any).AppEnv?.unsubscribe) {
    delete (window as any).AppEnv.unsubscribe;
  }
}

function openList(): void { console.info('[unsubscribe] open subscriptions list'); }
function openBulkSelect(): void { console.info('[unsubscribe] open bulk select view'); }

export type { SubscriptionEntry, UnsubscribeStatus } from './subscription-store';
export type { UnsubscribeInfo } from './list-unsubscribe-parser';
