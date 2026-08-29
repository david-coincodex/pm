import { factories } from '@strapi/strapi';

/**
 * Ownership is enforced HERE, from ctx.state.user — never from anything the client sends.
 * The role grants (src/index.ts bootstrap) only open the routes; every handler scopes to
 * the authenticated user:
 *  - find:   forced filter on the caller's user id
 *  - create: incoming `user` stripped, set from the token; upsert on (user, provider, username)
 *  - delete: 404 unless the entry belongs to the caller (404, not 403 — no existence oracle)
 */
export default factories.createCoreController('api::cam-favorite.cam-favorite', ({ strapi }) => ({
  async find(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();
    const entries = await strapi.documents('api::cam-favorite.cam-favorite').findMany({
      filters: { user: { id: userId } },
      sort: { createdAt: 'desc' },
      limit: 500,
    });
    return { data: entries };
  },

  async create(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();
    const body = (ctx.request.body as { data?: Record<string, unknown> })?.data ?? {};
    const provider = String(body.provider ?? '').slice(0, 10);
    const username = String(body.username ?? '').slice(0, 60);
    if (!provider || !username) return ctx.badRequest('provider and username are required');

    const existing = await strapi.documents('api::cam-favorite.cam-favorite').findFirst({
      filters: { user: { id: userId }, provider, username },
    });
    if (existing) return { data: existing };

    const created = await strapi.documents('api::cam-favorite.cam-favorite').create({
      data: {
        user: userId,
        provider,
        username,
        displayName: String(body.displayName ?? username).slice(0, 100),
        thumbUrl: String(body.thumbUrl ?? '').slice(0, 500),
        gender: String(body.gender ?? '').slice(0, 4),
        notify: true,
      },
    });
    return { data: created };
  },

  async delete(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();
    const { id: documentId } = ctx.params;
    const entry = await strapi.documents('api::cam-favorite.cam-favorite').findFirst({
      filters: { documentId, user: { id: userId } },
    });
    if (!entry) return ctx.notFound();
    await strapi.documents('api::cam-favorite.cam-favorite').delete({ documentId });
    return { data: { documentId } };
  },
}));
