// import type { Core } from '@strapi/strapi';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: any }) {
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
