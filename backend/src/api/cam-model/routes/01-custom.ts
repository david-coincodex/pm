/**
 * Machine routes, outside users-permissions (auth: false):
 *  - POST /cam-models/sync — the frontend's feed-roster upsert; guarded by the
 *    CAM_SYNC_SECRET header check in the controller, not by a role grant.
 *  - GET /cam-model-keys — PAGED key list (?page=&limit=, 20k/page + total) for sitemap
 *    chunk enumeration; the registry outgrew a single response within a day.
 *    Deliberately NOT under /cam-models/<segment>: the core GET /cam-models/:documentId
 *    route would shadow any literal sibling path.
 */
export default {
  type: 'content-api',
  routes: [
    {
      method: 'POST',
      path: '/cam-models/sync',
      handler: 'cam-model.sync',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/cam-model-keys',
      handler: 'cam-model.keys',
      config: { auth: false },
    },
  ],
};
