/**
 * Lightweight fuzzy matcher dla Cmd+K Command Palette (#89).
 *
 * Brak fuzzaldrin w deps (sprawdzone w app/package.json) → własna prosta
 * implementacja. Charakterystyka:
 *   - case-insensitive substring match
 *   - bonus za consecutive chars
 *   - bonus za word boundary start (np. "ts" matches "TypeScript" lepiej
 *     niż "tests")
 *   - keywords array też scoring'owany
 *
 * Sortuje wyniki: highest score first. Score 0 = brak dopasowania.
 *
 * Performance: O(n * m) gdzie n = liczba commands, m = długość label.
 * Dla 100 commands i query 5 chars to ~5000 ops — trivial.
 */

export interface ScoredMatch<T> {
  item: T;
  score: number;
}

/** Główna funkcja matchująca query do label + keywords. */
export function fuzzyScore(query: string, label: string, keywords: string[] = []): number {
  if (!query) return 1; // empty query → all match (score 1)
  const q = query.toLowerCase();
  const l = label.toLowerCase();

  // 1. Exact match (highest)
  if (l === q) return 1000;

  // 2. Starts with query (very high)
  if (l.startsWith(q)) return 500 + (q.length / l.length) * 100;

  // 3. Word boundary match (e.g. "ts" → "TypeScript")
  const wordBoundaryScore = scoreWordBoundaries(q, l);
  if (wordBoundaryScore > 0) return wordBoundaryScore;

  // 4. Substring anywhere (lower)
  if (l.includes(q)) return 100 + (q.length / l.length) * 50;

  // 5. Keywords match
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    if (kwLower === q) return 200;
    if (kwLower.startsWith(q)) return 150;
    if (kwLower.includes(q)) return 50;
  }

  // 6. Consecutive char matching (typo-tolerant)
  const consecutive = scoreConsecutive(q, l);
  if (consecutive > 0) return consecutive;

  return 0;
}

/** Word boundary scoring — chars matching after spaces/dashes/uppercase. */
function scoreWordBoundaries(q: string, l: string): number {
  // Extract word-boundary positions (start, after space/dash, capital)
  const boundaries: number[] = [0];
  for (let i = 1; i < l.length; i++) {
    const prev = l[i - 1];
    if (prev === ' ' || prev === '-' || prev === '_') {
      boundaries.push(i);
    }
  }
  // Try to match query chars sequentially at boundary positions
  let qIdx = 0;
  let matched = 0;
  for (const b of boundaries) {
    if (qIdx >= q.length) break;
    if (l[b] === q[qIdx]) {
      matched++;
      qIdx++;
    }
  }
  if (matched === q.length) return 300 + matched * 10;
  return 0;
}

/** Score consecutive char matching (handles typos partially). */
function scoreConsecutive(q: string, l: string): number {
  let qIdx = 0;
  let matched = 0;
  let consecutive = 0;
  let maxConsecutive = 0;
  for (let i = 0; i < l.length && qIdx < q.length; i++) {
    if (l[i] === q[qIdx]) {
      matched++;
      qIdx++;
      consecutive++;
      maxConsecutive = Math.max(maxConsecutive, consecutive);
    } else {
      consecutive = 0;
    }
  }
  if (matched < q.length) return 0;
  return 20 + maxConsecutive * 5;
}

/** Filter+sort lista items. */
export function fuzzyFilter<T extends { label: string; keywords?: string[] }>(
  query: string,
  items: T[]
): ScoredMatch<T>[] {
  return items
    .map(item => ({
      item,
      score: fuzzyScore(query, item.label, item.keywords || []),
    }))
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score);
}
