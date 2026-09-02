import type { CamModel } from './types';
import { PROVIDER_META } from './providers/meta';

/**
 * Cross-provider ordering for "most popular first" listings.
 *
 * THE PROBLEM: providers publish different numbers. Chaturbate's `num_users` and BongaCams'
 * `members_count` are both "viewers in the room right now" (measured medians 137 and 96), so
 * ranking those two against each other is honest and needs no adjustment. ImLive publishes
 * guests in its FREE room — 0 to 7, median 0, and its API has no popularity field worth the
 * name (92% of hosts are rated 5/5; the tip counter takes two distinct values). Sorting that
 * number against real viewer counts put EVERY ImLive model below EVERY other model: measured,
 * the first one landed at global rank 800 of 890.
 *
 * THE RULE:
 *  - providers whose counts are comparable compete on the real number, descending;
 *  - a provider whose count is NOT comparable keeps its own internal order (its adapter sorts
 *    by the best signals it has) and is woven in at a fixed cadence — roughly one card per
 *    `mixShare`. That placement is EDITORIAL and labelled as such in the metadata; the
 *    alternative was either burying the provider forever or inventing viewer numbers, and we
 *    don't display numbers we can't stand behind (its cards show no viewer badge at all).
 *
 * COST: one linear merge over pre-sorted lists, run once per snapshot refresh (~45s) inside
 * `build()`. Requests read the finished array, exactly as they read `byViewers` before — page
 * load does no ranking work.
 */
export function rankModels(models: CamModel[]): CamModel[] {
  const comparable: CamModel[] = [];
  /** Non-comparable providers, each keeping its adapter's order. */
  const editorial = new Map<string, { queue: CamModel[]; share: number }>();

  for (const m of models) {
    const meta = PROVIDER_META[m.provider];
    if (meta.ranking.viewersComparable) {
      comparable.push(m);
      continue;
    }
    const slot = editorial.get(m.provider) ?? {
      queue: [],
      // A missing mixShare would mean "every card": treat it as "rarely" instead of flooding.
      share: Math.max(2, meta.ranking.mixShare ?? 12),
    };
    slot.queue.push(m);
    editorial.set(m.provider, slot);
  }

  comparable.sort((a, b) => b.viewers - a.viewers);
  if (editorial.size === 0) return comparable;

  // Weave: after every `share` output cards, a provider due for placement contributes its next
  // model. Ties in due-ness resolve by provider id so the order is stable across refreshes.
  const out: CamModel[] = [];
  const cursors = [...editorial.entries()]
    .map(([id, slot]) => ({ id, ...slot, next: 0 }))
    .sort((a, b) => a.id.localeCompare(b.id));
  let i = 0;
  for (const model of comparable) {
    out.push(model);
    i += 1;
    for (const c of cursors) {
      if (c.next < c.queue.length && i % c.share === 0) {
        out.push(c.queue[c.next]);
        c.next += 1;
      }
    }
  }
  // Whatever didn't fit (a short comparable list, or a big editorial queue) goes at the end
  // rather than being dropped — a listing must never lose models.
  for (const c of cursors) out.push(...c.queue.slice(c.next));
  return out;
}
