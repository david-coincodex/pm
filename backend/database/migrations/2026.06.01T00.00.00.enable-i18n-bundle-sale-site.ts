import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  for (const table of ['bundles', 'sales', 'sites'] as const) {
    const hasLocale = await knex.schema.hasColumn(table, 'locale');
    if (!hasLocale) {
      await knex.schema.table(table, (t) => {
        t.string('locale');
      });
    }
    await knex(table).whereNull('locale').update({ locale: 'en' });
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Intentionally a no-op: removing locale data from existing rows is destructive.
}
