'use client';

import { HlsPreview } from '../shared/HlsPreview';
import type { PreviewProps } from '../video-types';

/** BongaCams card preview: the feed's raw HLS in a muted, chromeless <video>. */
export default function BongacamsPreview({ model, onReady, onFatal }: PreviewProps) {
  return <HlsPreview src={model.streamUrl!} onReady={onReady} onFatal={onFatal} />;
}
