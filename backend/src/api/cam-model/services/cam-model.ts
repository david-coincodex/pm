import { factories } from '@strapi/strapi';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CAM_MODEL_UID as UID, PHOTO_CAP } from '../constants';

const FOLDER_NAME = 'Cam Models';
/** Advisory: fetchUrlToInputFile only checks the Content-Length HEADER before buffering the
 * body — a chunked response bypasses it. Acceptable because hosts are pinned to two provider
 * CDNs below; do not reuse this path for arbitrary hosts. */
const MAX_PHOTO_BYTES = 1_000_000;

/**
 * Only provider CDNs we ingest from. fetchUrlToInputFile already blocks private/internal IPs
 * (SSRF blocklist), but URLs originate in feed data, so we pin the hosts too.
 */
const ALLOWED_PHOTO_HOSTS = new Set(['thumb.live.mmcdn.com', 'i.bgicdn.com']);

let folderIdPromise: Promise<number> | null = null;

export default factories.createCoreService(UID, ({ strapi }) => ({
  /**
   * The media-library folder all cam photos land in, created on first use — keeps thousands
   * of machine-captured images out of the admin library's root. Single-flighted: the capture
   * cron fires several concurrent capturePhoto calls, and on first run they all raced this
   * create (UNIQUE constraint on upload_folders.path). A lost race re-reads the winner's row.
   */
  async getCamMediaFolder(): Promise<number> {
    folderIdPromise ??= (async () => {
      const q = strapi.db.query('plugin::upload.folder');
      const existing = await q.findOne({ where: { name: FOLDER_NAME, parent: null } });
      if (existing) return existing.id;
      try {
        const folder = await strapi.plugin('upload').service('folder').create({ name: FOLDER_NAME });
        return folder.id;
      } catch (err) {
        const winner = await q.findOne({ where: { name: FOLDER_NAME, parent: null } });
        if (winner) return winner.id;
        throw err;
      }
    })();
    try {
      return await folderIdPromise;
    } catch (err) {
      folderIdPromise = null; // a failed resolution must not be cached forever
      throw err;
    }
  },

  /**
   * Download one image from a provider CDN and append it to the model's `photos` media
   * relation. The ref/refId/field metas make the upload service write the morph relation
   * itself — the cam-model row is never touched.
   */
  async capturePhoto(model: { id: number; key: string }, url: string): Promise<void> {
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      throw new Error(`invalid photo url for ${model.key}`);
    }
    if (!ALLOWED_PHOTO_HOSTS.has(host)) throw new Error(`photo host not allowed: ${host}`);

    const folder = await this.getCamMediaFolder();
    const tmpDir = await mkdtemp(join(tmpdir(), 'cam-photo-'));
    try {
      const { file } = await strapi
        .plugin('upload')
        .service('file')
        .fetchUrlToInputFile(url, tmpDir, MAX_PHOTO_BYTES);
      await strapi
        .plugin('upload')
        .service('upload')
        .upload({
          data: {
            fileInfo: { name: `${model.key}-${Date.now()}`, folder },
            ref: UID,
            refId: model.id,
            field: 'photos',
          },
          files: [file],
        });
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  },

  /**
   * Keep at most `cap` photos per model, dropping the oldest. upload.remove() is the only
   * complete deletion — provider file, generated formats and the DB row together.
   */
  async rotatePhotos(modelId: number, cap = PHOTO_CAP): Promise<void> {
    const row = await strapi.db.query(UID).findOne({
      where: { id: modelId },
      populate: { photos: true },
    });
    const photos: { id: number; createdAt: string }[] = row?.photos ?? [];
    if (photos.length <= cap) return;
    const oldestFirst = [...photos].sort(
      // Secondary sort on id: same-ms createdAt ties would otherwise evict unstably.
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id,
    );
    await this.removePhotos(oldestFirst.slice(0, photos.length - cap));
  },

  /**
   * The ONE way photos die: upload.remove deletes the provider file, generated formats and
   * the DB row together — entry deletion never cascades media, so every caller (rotation,
   * the cleanup cron) must come through here first. Returns the FAILURE count: rotation can
   * shrug (it retries next capture), but cleanup must NOT delete a model row while its photos
   * still exist — that is precisely how files orphan.
   */
  async removePhotos(photos: { id: number }[]): Promise<number> {
    const uploadService = strapi.plugin('upload').service('upload');
    let failed = 0;
    for (const photo of photos) {
      await uploadService.remove(photo).catch((err: unknown) => {
        failed += 1;
        strapi.log.warn(`[cam-model] failed to remove photo ${photo.id}: ${String(err)}`);
      });
    }
    return failed;
  },
}));
