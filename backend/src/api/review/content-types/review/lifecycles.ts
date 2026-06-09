export default {
  async afterCreate(event: any) {
    await syncComputedFields(event);
  },
  async afterUpdate(event: any) {
    await syncComputedFields(event);
  },
};

/** Average of the numeric score fields in a score component (1 decimal), or null. */
function averageScore(scores: any): number | null {
  if (!scores || typeof scores !== 'object') return null;
  const values = Object.entries(scores)
    .filter(([key]) => key !== 'id')
    .map(([, value]) => value)
    .filter((value): value is number => typeof value === 'number');
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

// Guards against the recompute write re-triggering this same hook.
const recomputing = new Set<number>();

/**
 * Recompute the auto-managed fields from the persisted row after every write and
 * overwrite the stored values:
 *   - overallScore: average of the paysite/camsite score breakdown
 *   - displayTitle: the name of the selected site (used as the entry's label)
 *
 * Runs in afterCreate/afterUpdate (not before) because only the persisted row
 * exposes the related site and score components as plain values — in the write
 * payload they arrive as references and can't be read.
 */
async function syncComputedFields(event: any) {
  const id = event.result?.id;
  if (id == null || recomputing.has(id)) return;

  const entry = await strapi.db.query('api::review.review').findOne({
    where: { id },
    populate: ['paysiteScores', 'camsiteScores', 'site'],
  });
  if (!entry) return;

  const overallScore = averageScore(entry.paysiteScores) ?? averageScore(entry.camsiteScores);
  const displayTitle = entry.site?.name ?? entry.displayTitle ?? null;

  const currentScore = entry.overallScore == null ? null : Number(entry.overallScore);
  const next: Record<string, unknown> = {};
  if (overallScore !== currentScore) next.overallScore = overallScore;
  if (displayTitle !== entry.displayTitle) next.displayTitle = displayTitle;
  if (Object.keys(next).length === 0) return;

  recomputing.add(id);
  try {
    await strapi.db.query('api::review.review').update({ where: { id }, data: next });
  } finally {
    recomputing.delete(id);
  }
}
