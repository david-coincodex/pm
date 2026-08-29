import { factories } from '@strapi/strapi';

/**
 * Read-only over REST: rows are written exclusively by the feed sync (custom /cam-models/sync
 * route) and the crons. Public find/findOne come from the bootstrap grant loop.
 */
export default factories.createCoreRouter('api::cam-model.cam-model', {
  only: ['find', 'findOne'],
});
