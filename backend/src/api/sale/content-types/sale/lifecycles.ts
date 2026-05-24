export default {
  async beforeCreate(event: any) {
    await validateNoOverlap(event.params.data, null);
  },
  async beforeUpdate(event: any) {
    const { where, data } = event.params;
    // Fetch the current record to fill in any missing dates
    const existing = await strapi.entityService.findOne('api::sale.sale', where.id, {
      fields: ['startsAt', 'endsAt'],
    });
    const startsAt = data.startsAt ?? existing?.startsAt;
    const endsAt = data.endsAt ?? existing?.endsAt;
    await validateNoOverlap({ startsAt, endsAt }, where.id);
  },
};

async function validateNoOverlap(
  data: { startsAt?: string; endsAt?: string },
  excludeId: string | number | null
) {
  const { startsAt, endsAt } = data;
  if (!startsAt || !endsAt) return;

  const filters: Record<string, unknown> = {
    publishedAt: { $notNull: true },
    $and: [
      { startsAt: { $lt: endsAt } },
      { endsAt: { $gt: startsAt } },
    ],
  };

  if (excludeId !== null) {
    (filters as any).id = { $ne: excludeId };
  }

  const overlapping = await strapi.entityService.findMany('api::sale.sale', {
    filters,
    fields: ['id', 'title', 'startsAt', 'endsAt'],
  });

  if (overlapping && (overlapping as any[]).length > 0) {
    const clash = (overlapping as any[])[0];
    throw new Error(
      `Sale dates overlap with "${clash.title}" (${clash.startsAt} → ${clash.endsAt}). Only one published sale can be active at a time.`
    );
  }
}
