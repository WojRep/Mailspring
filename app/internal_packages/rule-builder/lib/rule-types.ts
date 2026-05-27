/**
 * Rule types — bilet MVP #100.
 *
 * Sentence builder semantics: WHEN trigger / MATCH all|any of conditions / THEN actions / EXCEPT IF exceptions.
 *
 * Reuses RuleField/RuleOperator/MatchMode z #99 smart-folder rule-engine — share
 * intentionally bo automation conditions = smart folder filter rules + actions.
 */

import type { Rule as ConditionRule, MatchMode } from '../../smart-folder/lib/rule-engine';

export type TriggerType =
  | 'message_arrives'
  | 'message_sent'
  | 'scheduled'
  | 'manual';

export type ActionType =
  | 'move'           // value = folderId
  | 'copy'           // value = folderId
  | 'tag'            // value = tagId
  | 'remove_tag'     // value = tagId
  | 'mark_read'      // value = true|false
  | 'mark_important' // value = true|false
  | 'pin'            // value = true|false
  | 'snooze'         // value = ISO date or relative ('today_evening', 'tomorrow_morning')
  | 'delete'         // no value
  | 'forward'        // value = email — wymagany consent dialog
  | 'auto_reply'     // value = templateId
  | 'notify'         // value = message string
  | 'stop_processing'; // no value — stop chain

export interface Action {
  type: ActionType;
  value?: any;
}

export type RuleLocation = 'server' | 'local';

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  /** Where rule executes — Gmail filter on server vs local Mailspring. */
  location: RuleLocation;
  trigger: TriggerType;
  /** Schedule cron-like — only when trigger=scheduled. */
  scheduleAt?: string;
  match: MatchMode;
  conditions: ConditionRule[];
  actions: Action[];
  /** Exceptions evaluated as "any exception matches → skip rule". */
  exceptions: ConditionRule[];
  /** Position in execution order (lower = earlier). */
  order: number;
  /** Cumulative hit counter — incremented per match (excl. preview). */
  hits: number;
  /** Last execution Unix ms. */
  lastRunAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface RuleAuditEntry {
  timestamp: number;
  ruleId: string;
  event: 'created' | 'updated' | 'deleted' | 'enabled' | 'disabled' | 'executed' | 'run_now';
  /** Number of matched threads for execute/run_now events. */
  matchCount?: number;
  /** Optional human-readable detail. */
  detail?: string;
}

export const ACTION_LABELS_PL: Record<ActionType, string> = {
  move: 'Przenieś do folderu',
  copy: 'Skopiuj do folderu',
  tag: 'Dodaj tag',
  remove_tag: 'Usuń tag',
  mark_read: 'Oznacz jako przeczytane',
  mark_important: 'Oznacz jako ważne',
  pin: 'Przypnij',
  snooze: 'Odłóż (snooze)',
  delete: 'Usuń',
  forward: 'Przekaż do',
  auto_reply: 'Auto-odpowiedź',
  notify: 'Powiadom',
  stop_processing: 'Zatrzymaj dalsze reguły',
};

export const ACTION_LABELS_EN: Record<ActionType, string> = {
  move: 'Move to folder',
  copy: 'Copy to folder',
  tag: 'Add tag',
  remove_tag: 'Remove tag',
  mark_read: 'Mark as read',
  mark_important: 'Mark as important',
  pin: 'Pin',
  snooze: 'Snooze',
  delete: 'Delete',
  forward: 'Forward to',
  auto_reply: 'Auto-reply',
  notify: 'Notify',
  stop_processing: 'Stop processing rules',
};

export const TRIGGER_LABELS_PL: Record<TriggerType, string> = {
  message_arrives: 'Gdy wiadomość przychodzi',
  message_sent: 'Gdy wiadomość wysłana',
  scheduled: 'O zaplanowanej porze',
  manual: 'Tylko ręcznie',
};

export const TRIGGER_LABELS_EN: Record<TriggerType, string> = {
  message_arrives: 'When message arrives',
  message_sent: 'When message sent',
  scheduled: 'On schedule',
  manual: 'Manual only',
};

/** WCAG 3.3.4 — bulk modification confirmation threshold. */
export const BULK_CONFIRM_THRESHOLD = 50;

/** Actions requiring explicit user consent dialog before execution. */
export const CONSENT_REQUIRED_ACTIONS: Set<ActionType> = new Set(['forward', 'delete', 'auto_reply']);
