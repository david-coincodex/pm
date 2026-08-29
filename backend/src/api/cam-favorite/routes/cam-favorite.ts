import { factories } from '@strapi/strapi';

/** find/create/delete only — favorites are toggled, never updated in place. */
export default factories.createCoreRouter('api::cam-favorite.cam-favorite', {
  only: ['find', 'create', 'delete'],
});
