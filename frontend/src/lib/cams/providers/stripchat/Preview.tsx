'use client';

import { HlsPreview } from '../shared/HlsPreview';
import type { PreviewProps } from '../video-types';

/** StripChat card preview: the feed's HLS in a muted, chromeless <video>. */
export default function StripchatPreview({ model, onReady, onFatal }: PreviewProps) {
  return <HlsPreview src={model.streamUrl!} onReady={onReady} onFatal={onFatal} />;
}
