import type { Knex } from 'knex';

/**
 * Convert legacy rich-text CTA buttons to the semantic `data-button` attribute.
 *
 * The CKEditor "Button Style" link decorator used to stamp a list of Tailwind utility classes
 * (including the generic `inline-flex`) onto anchors; the frontend styled them via
 * `.rich-text-content a.inline-flex`. We now mark buttons with a `data-button` attribute and the
 * frontend RichText maps it to Tailwind utilities at render (no classes/CSS in content). This
 * rewrites any anchor whose class list contains `inline-flex` to `data-button="true"` across every
 * CKEditor rich-text column — covering all locales and both draft & published rows.
 */

// [table, column] for every CKEditor rich-text field.
const TARGETS: Array<[string, string]> = [
  ['pages', 'content'],
  ['categories', 'intro'],
  ['categories', 'content'],
  ['reviews', 'content'],
  ['sites', 'description'],
  ['articles', 'content'],
];

// Swap the class attribute of any anchor that carries the old generic `inline-flex` (only content
// CTA buttons do) for `data-button="true"`. Robust to class ordering / extra classes.
function rewrite(html: string): string {
  return html.replace(/class=("|')([^"']*\binline-flex\b[^"']*)\1/g, 'data-button="true"');
}

export async function up(knex: Knex): Promise<void> {
  for (const [table, column] of TARGETS) {
    if (!(await knex.schema.hasColumn(table, column))) continue;
    const rows = await knex(table).select('id', column).where(column, 'like', '%inline-flex%');
    for (const row of rows) {
      const html = row[column];
      if (typeof html !== 'string') continue;
      const next = rewrite(html);
      if (next !== html) await knex(table).where('id', row.id).update({ [column]: next });
    }
  }
}

export async function down(_knex: Knex): Promise<void> {
  // No-op: rt-button is the desired end state; the original utility-class list is not restored.
}
