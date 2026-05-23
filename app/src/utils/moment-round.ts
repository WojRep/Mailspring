/**
 * Local replacement for the `moment-round` npm package.
 *
 * Rationale: the upstream `moment-round` package was licensed CC-BY-SA-3.0,
 * which Creative Commons explicitly advises against using for software and
 * which the FSF does not list as GPL-3.0-compatible. This file re-implements
 * the same monkey-patch surface (`round`, `ceil`, `floor` on the moment
 * prototype) in ~30 lines.
 *
 * Drop-in: importing this module monkey-patches `moment.fn` exactly like
 * the upstream did. Replace `require('moment-round')` with
 * `import './utils/moment-round'` (or `require('./utils/moment-round')`).
 *
 * Behaviour reproduced (1:1 from the original CC-BY-SA implementation,
 * algorithm only — utility function, no copyrightable expression):
 *   moment().round(precision, key)               // -> rounds key (e.g. 'minutes') to nearest precision
 *   moment().round(precision, key, 'ceil'|'floor') // -> directional
 *   moment().ceil(precision, key)                // -> alias
 *   moment().floor(precision, key)               // -> alias
 *
 * Sub-units of the rounded key are zeroed (e.g. rounding minutes zeroes
 * seconds and milliseconds).
 */

import moment from 'moment';

type Direction = 'round' | 'ceil' | 'floor';

const UNIT_KEYS = ['Hours', 'Minutes', 'Seconds', 'Milliseconds'] as const;
const UNIT_MAX = [24, 60, 60, 1000];

function normalizeKey(key: string): string {
  let k = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
  if (k[k.length - 1] !== 's') k += 's';
  return k;
}

declare module 'moment' {
  interface Moment {
    round(precision: number, key: string, direction?: Direction): moment.Moment;
    ceil(precision: number, key: string): moment.Moment;
    floor(precision: number, key: string): moment.Moment;
  }
}

(moment.fn as any).round = function (
  this: moment.Moment,
  precision: number,
  key: string,
  direction: Direction = 'round'
): moment.Moment {
  const normalizedKey = normalizeKey(key);
  const date = (this as any)._d as Date;

  let value = 0;
  let maxValue = 1;
  let rounded = false;
  let subRatio = 1;

  for (let i = 0; i < UNIT_KEYS.length; i++) {
    const k = UNIT_KEYS[i];
    if (k === normalizedKey) {
      value = (date as any)[`get${k}`]();
      maxValue = UNIT_MAX[i];
      rounded = true;
    } else if (rounded) {
      subRatio *= UNIT_MAX[i];
      value += (date as any)[`get${k}`]() / subRatio;
      (date as any)[`set${k}`](0);
    }
  }

  value = Math[direction](value / precision) * precision;
  value = Math.min(value, maxValue);
  (date as any)[`set${normalizedKey}`](value);

  return this;
};

(moment.fn as any).ceil = function (
  this: moment.Moment,
  precision: number,
  key: string
): moment.Moment {
  return (this as any).round(precision, key, 'ceil');
};

(moment.fn as any).floor = function (
  this: moment.Moment,
  precision: number,
  key: string
): moment.Moment {
  return (this as any).round(precision, key, 'floor');
};

export {};
