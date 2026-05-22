import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Only run if the old subscriptions table still exists and the offers table is empty
  const hasSubscriptions = await knex.schema.hasTable('subscriptions');
  if (!hasSubscriptions) return;

  const offersCount = await knex('offers').count('id as count').first();
  if (Number(offersCount?.count) > 0) return;

  // Copy rows, mapping subscription_type → offer_type
  const rows = await knex('subscriptions').select('*');
  if (rows.length === 0) return;

  await knex('offers').insert(
    rows.map((row) => ({
      document_id: row.document_id,
      offer_type: row.subscription_type,
      price: row.price,
      discount_percent: row.discount_percent,
      affiliate_link: row.affiliate_link,
      allows_downloads: row.allows_downloads,
      priority: row.priority,
      valid_from: row.valid_from,
      valid_to: row.valid_to,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
      created_by_id: row.created_by_id,
      updated_by_id: row.updated_by_id,
      deal_id: row.deal_id,
    }))
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex('offers').delete();
}
