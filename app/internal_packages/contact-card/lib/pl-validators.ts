/**
 * PL identifier validators — bilet MVP #102.
 *
 * Walidacja: NIP, REGON, KRS, PESEL, IBAN (PL).
 *
 * PESEL/IBAN — Tier B encryption MANDATORY przy persistence (zob. #113 RODO).
 * Te walidatory są PURE FUNCTIONS — nie storage. Encryption layer dodawany w
 * ContactCardStore.persist gdy #113 ship.
 */

export interface ValidationResult {
  valid: boolean;
  /** Human-readable error message (PL). Undefined gdy valid. */
  reason?: string;
}

function onlyDigits(s: string): string {
  return s.replace(/\D/g, '');
}

/**
 * NIP — Polish tax ID. 10 digits z weighted sum mod 11.
 * Weights: 6,5,7,2,3,4,5,6,7. Sum mod 11 == 10 → invalid; else == last digit.
 */
export function validateNIP(input: string): ValidationResult {
  const d = onlyDigits(input);
  if (d.length !== 10) return { valid: false, reason: 'NIP musi mieć 10 cyfr' };
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i], 10) * weights[i];
  const checksum = sum % 11;
  if (checksum === 10) return { valid: false, reason: 'NIP — błędna suma kontrolna' };
  if (checksum !== parseInt(d[9], 10)) return { valid: false, reason: 'NIP — błędna suma kontrolna' };
  return { valid: true };
}

/**
 * REGON — Polish business registry. 9 lub 14 digits z weighted checksum.
 * 9-digit weights: 8,9,2,3,4,5,6,7. Sum mod 11; if 10 → 0; compare last digit.
 * 14-digit weights: 2,4,8,5,0,9,7,3,6,1,2,4,8. Sum mod 11; if 10 → 0; compare last digit.
 */
export function validateREGON(input: string): ValidationResult {
  const d = onlyDigits(input);
  if (d.length !== 9 && d.length !== 14) {
    return { valid: false, reason: 'REGON musi mieć 9 lub 14 cyfr' };
  }
  if (d.length === 9) {
    const weights = [8, 9, 2, 3, 4, 5, 6, 7];
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += parseInt(d[i], 10) * weights[i];
    const checksum = sum % 11 === 10 ? 0 : sum % 11;
    if (checksum !== parseInt(d[8], 10)) return { valid: false, reason: 'REGON — błędna suma kontrolna' };
    return { valid: true };
  }
  // 14-digit: validate first 9 + extension
  const first9 = validateREGON(d.slice(0, 9));
  if (!first9.valid) return first9;
  const weights = [2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8];
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += parseInt(d[i], 10) * weights[i];
  const checksum = sum % 11 === 10 ? 0 : sum % 11;
  if (checksum !== parseInt(d[13], 10)) return { valid: false, reason: 'REGON 14 — błędna suma kontrolna' };
  return { valid: true };
}

/**
 * KRS — Polish court registry. 10 digits, brak checksum (tylko length+digit check).
 */
export function validateKRS(input: string): ValidationResult {
  const d = onlyDigits(input);
  if (d.length !== 10) return { valid: false, reason: 'KRS musi mieć 10 cyfr' };
  return { valid: true };
}

/**
 * PESEL — Polish personal ID. 11 digits z embedded date + checksum.
 * Weights: 1,3,7,9,1,3,7,9,1,3. Sum mod 10 → (10 - x) mod 10 == last digit.
 *
 * **Tier B encryption MANDATORY przy persistence (RODO art. 9 special category data).**
 */
export function validatePESEL(input: string): ValidationResult {
  const d = onlyDigits(input);
  if (d.length !== 11) return { valid: false, reason: 'PESEL musi mieć 11 cyfr' };
  const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i], 10) * weights[i];
  const checksum = (10 - (sum % 10)) % 10;
  if (checksum !== parseInt(d[10], 10)) return { valid: false, reason: 'PESEL — błędna suma kontrolna' };
  // Validate embedded date
  const year = parseInt(d.slice(0, 2), 10);
  const monthRaw = parseInt(d.slice(2, 4), 10);
  const day = parseInt(d.slice(4, 6), 10);
  // Month encoding: 1900-1999 → +0, 2000-2099 → +20, 2100-2199 → +40, 1800-1899 → +80, 2200-2299 → +60
  let fullYear: number;
  let month: number;
  if (monthRaw >= 1 && monthRaw <= 12) { fullYear = 1900 + year; month = monthRaw; }
  else if (monthRaw >= 21 && monthRaw <= 32) { fullYear = 2000 + year; month = monthRaw - 20; }
  else if (monthRaw >= 41 && monthRaw <= 52) { fullYear = 2100 + year; month = monthRaw - 40; }
  else if (monthRaw >= 61 && monthRaw <= 72) { fullYear = 2200 + year; month = monthRaw - 60; }
  else if (monthRaw >= 81 && monthRaw <= 92) { fullYear = 1800 + year; month = monthRaw - 80; }
  else return { valid: false, reason: 'PESEL — błędny zakres miesiąca' };
  // Day validation
  const daysInMonth = new Date(fullYear, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return { valid: false, reason: 'PESEL — błędny dzień miesiąca' };
  return { valid: true };
}

/**
 * IBAN — z walidacją kraju PL (28 chars: PL + 26 digits).
 * Mod-97 check per ISO 13616.
 *
 * **Tier B encryption MANDATORY przy persistence (financial data).**
 */
export function validateIBAN(input: string): ValidationResult {
  const cleaned = input.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(cleaned)) {
    return { valid: false, reason: 'IBAN — niepoprawny format' };
  }
  // PL-specific length check (28)
  if (cleaned.startsWith('PL') && cleaned.length !== 28) {
    return { valid: false, reason: 'IBAN PL musi mieć 28 znaków' };
  }
  // Move first 4 chars to end, convert letters → digits (A=10..Z=35)
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  let numStr = '';
  for (const ch of rearranged) {
    if (ch >= '0' && ch <= '9') numStr += ch;
    else numStr += String(ch.charCodeAt(0) - 'A'.charCodeAt(0) + 10);
  }
  // Mod 97 — chunk to avoid BigInt
  let remainder = 0;
  for (let i = 0; i < numStr.length; i += 7) {
    const chunk = String(remainder) + numStr.slice(i, i + 7);
    remainder = parseInt(chunk, 10) % 97;
  }
  if (remainder !== 1) return { valid: false, reason: 'IBAN — błędna suma kontrolna' };
  return { valid: true };
}

export const PL_VALIDATORS = {
  nip: validateNIP,
  regon: validateREGON,
  krs: validateKRS,
  pesel: validatePESEL,
  iban: validateIBAN,
};

/** Pola wymagające Tier B encryption (RODO art. 9 special category + financial). */
export const TIER_B_ENCRYPTED_FIELDS: Set<string> = new Set(['pesel', 'iban']);
