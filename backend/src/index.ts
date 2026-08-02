// import type { Core } from '@strapi/strapi';

import { normalizeMediaUrls } from './utils/relative-media-urls';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }: { strapi: any }) {
    /**
     * Store uploaded-media URLs as root-relative paths, always.
     *
     * A document-service middleware rather than per-content-type `lifecycles.ts` on purpose:
     * there are SIX CKEditor fields across five content types (article.content, category.intro,
     * category.content, page.content, review.content, site.description) plus `blocks` fields on
     * bundle and sale. One registration covers create/update/publish for all of them, and any
     * rich-text field added later is protected without anyone remembering to wire it up.
     *
     * See src/utils/relative-media-urls.ts for why this is necessary: the CKEditor media library
     * always inserts an absolute URL built from whatever host the admin is open on.
     */
    strapi.documents.use(async (context: any, next: any) => {
      // Only OUR content types. In particular `plugin::upload.file` must never pass through
      // here: with a CDN/proxy upload provider its own `url`/`formats` fields hold absolute
      // URLs that can legitimately contain `/uploads/` — normalising those would corrupt the
      // media library's records, not article content.
      if (!context.uid?.startsWith('api::')) return next();
      const isWrite = context.action === 'create' || context.action === 'update';
      if (isWrite && context.params?.data) {
        context.params.data = normalizeMediaUrls(context.params.data);
      }
      return next();
    });
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: any }) {
    // Grant the Public role read access (find/findOne) on every api:: content type. The frontend
    // fetches Strapi anonymously (no token), so on a fresh DB the Public role has no permissions
    // and every request returns 403 → SSR crashes with "Forbidden". Idempotent + non-destructive:
    // only missing permissions are created, so manual changes / already-configured DBs are untouched.
    try {
      const publicRole = await strapi
        .query('plugin::users-permissions.role')
        .findOne({ where: { type: 'public' }, populate: { permissions: true } });
      if (publicRole) {
        const existing = new Set((publicRole.permissions ?? []).map((p: any) => p.action));
        const apiUids = Object.keys(strapi.contentTypes).filter((uid: string) => uid.startsWith('api::'));
        let created = 0;
        for (const uid of apiUids) {
          for (const verb of ['find', 'findOne']) {
            const action = `${uid}.${verb}`;
            if (!existing.has(action)) {
              await strapi
                .query('plugin::users-permissions.permission')
                .create({ data: { action, role: publicRole.id } });
              created++;
            }
          }
        }
        if (created) strapi.log.info(`[bootstrap] Granted ${created} public read permission(s).`);
      }
    } catch (error) {
      strapi.log.warn(`[bootstrap] Could not grant public permissions: ${(error as Error).message}`);
    }

    // `overallScore` and `displayTitle` are auto-computed (see review lifecycles).
    // Strapi hardcodes `editable: true` in field metadata and has no schema flag
    // for read-only, so we enforce it on the stored content-manager configuration
    // here (reproducible on any DB). Also use `displayTitle` as the entry label.
    try {
      const ct = strapi.contentTypes['api::review.review'];
      const svc = strapi.plugin('content-manager').service('content-types');
      const conf = await svc.findConfiguration(ct);

      let changed = false;
      for (const field of ['overallScore', 'displayTitle']) {
        const edit = conf?.metadatas?.[field]?.edit;
        if (edit && edit.editable !== false) {
          edit.editable = false;
          changed = true;
        }
      }
      if (conf?.settings && conf.settings.mainField !== 'displayTitle') {
        conf.settings.mainField = 'displayTitle';
        changed = true;
      }
      // Admin list columns: ID, Site, Overall score.
      const listColumns = ['id', 'site', 'overallScore'];
      if (conf?.layouts && JSON.stringify(conf.layouts.list) !== JSON.stringify(listColumns)) {
        conf.layouts.list = listColumns;
        changed = true;
      }

      if (changed) {
        await svc.updateConfiguration(ct, conf);
        strapi.log.info('[bootstrap] Review: overallScore/displayTitle read-only, mainField=displayTitle.');
      }
    } catch (error) {
      strapi.log.warn(`[bootstrap] Could not enforce review admin config: ${(error as Error).message}`);
    }
  },
};
