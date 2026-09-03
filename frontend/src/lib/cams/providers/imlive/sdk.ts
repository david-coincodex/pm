import type { CamModel } from '../../types';
import { loadScript } from '../shared/loadScript';

/**
 * ImLive's HTML5 video-chat SDK — the only way to play their LIVE rooms (there is no public
 * m3u8 and their room page refuses framing). Shared by ./Player.tsx (model page) and
 * ./Preview.tsx (card), which differ only in the documented speed/quality knobs.
 *
 * VERIFIED against the live SDK (2026-09-02): anonymous free-chat playback needs NO partner
 * credentials — `sponsorId` omitted and the docs' example `origin: 2` produced
 * `onChatStart {chatmode:'free'}` and 1280x720 video. `NEXT_PUBLIC_IMLIVE_SPONSOR_ID` /
 * `_ORIGIN` are honored if ever set (e.g. if ImLive later wants player-side attribution), but
 * are not required — our revenue path is the /out/ affiliate redirect, independent of this.
 *
 * The room's connection data (working server, CDN, BOSH comms, webrtcdata) is per-session and
 * arrives with each feed refresh in `model.imliveRoom`; a model who reconnects gets new values,
 * which is why it is never persisted.
 */

const SDK_SRC = 'https://j0.wlmediahub.com/App_Themes/api/scripts/video-chat.js';
/** Documented "navigate away" reason for destroy(). */
const REASON_NAVIGATE_AWAY = 902;
/** Close reasons produced by our own destroy() — never a stream failure. */
const SELF_CLOSE_REASONS = new Set(['userExit', 'navigateAway']);

/**
 * Close reasons that mean the room is genuinely gone: the model ended her free session, moved
 * to a paid show, or the gateway refused us. Rebuilding cannot help, and MEASURED it actively
 * hurts — three quick reconnects to a departed room earned an `accessDenied` from their
 * gateway. These go straight to the affiliate facade; every other reason (transport drops,
 * timeouts, an unlabelled close) is ambiguous and may be worth one rebuild.
 */
const TERMINAL_CLOSE_REASONS = new Set([
  'hostOffline',
  'isOffline',
  'accessDenied',
  'hostInPrivate',
  'roomClosed',
]);

/** Is this close reason final, or worth a rebuild? See TERMINAL_CLOSE_REASONS. */
export function isTerminalClose(why: string): boolean {
  return TERMINAL_CLOSE_REASONS.has(why);
}

type VideoChatInstance = {
  destroy?: (reason: number) => void;
  setVolume?: (v: number) => void;
  onUserGestureMade?: () => void;
};

type Handlers = {
  /** Frames are flowing. */
  onStart?: () => void;
  /** Unrecoverable: script blocked, room gone, chat closed. */
  onFail?: (why: string) => void;
  /** The browser blocked audible autoplay; the host may offer a tap-to-unmute affordance. */
  onNeedsGesture?: () => void;
};

export type ImliveMountOptions = {
  model: CamModel;
  /** DOM id of the container the SDK renders the video into. */
  elementId: string;
  /** 0..1; 0 keeps it muted, which is what autoplay policies require for cards. */
  volume: number;
  /** true on cards: the documented fast preview path (no chat gateway handshake). */
  preview: boolean;
  /** Show the SDK's own sound button. We keep it OFF everywhere: the model page bridges the
   * shared mute store into setVolume() so imLive wears the same bar as every other surface,
   * and card previews are silent. Kept as an option in case a surface ever wants theirs. */
  soundButton: boolean;
  handlers?: Handlers;
};

/** A mounted player: release it on unmount, and drive its volume from the shared mute store. */
export type ImlivePlayerHandle = {
  /** ALWAYS call on unmount: the SDK holds a comms connection; destroy() releases it. */
  teardown: () => void;
  /** 0..1. The documented live-volume API — no remount needed for a mute toggle. */
  setVolume: (volume: number) => void;
  /** The documented autoplay-resume call; invoke inside a real user gesture (our unmute click). */
  userGesture: () => void;
};

/**
 * Mount the SDK player. Returns a handle — ALWAYS call its teardown on unmount.
 */
export async function mountImlivePlayer(opts: ImliveMountOptions): Promise<ImlivePlayerHandle> {
  const room = opts.model.imliveRoom;
  if (!room) throw new Error('imlive: model has no room connection data');

  await loadScript(SDK_SRC);
  const Ctor = (window as unknown as { VideoChat?: new (cfg: unknown) => VideoChatInstance }).VideoChat;
  if (typeof Ctor !== 'function') throw new Error('imlive: SDK loaded but VideoChat is missing');

  const sponsorId = process.env.NEXT_PUBLIC_IMLIVE_SPONSOR_ID;
  const instance = new Ctor({
    guest: {
      id: 0,
      name: '',
      password: '',
      vcode: '',
      value: 0,
      countryId: 0,
      // Documented example value; not validated for anonymous free chat (see the header note).
      origin: Number(process.env.NEXT_PUBLIC_IMLIVE_ORIGIN ?? 2),
      type: 'anonymous',
    },
    player: {
      element: opts.elementId,
      bgColor: '#000000',
      // Chat UI we deliberately don't render: this is a video surface, not a chat client.
      gifts: false,
      predefinedMessages: false,
      emoticons: false,
      tips: false,
      volume: opts.volume,
      enableSoundButton: opts.soundButton,
      autoSizing: true,
    },
    // 'html5-pls' + gatewayType 'none' is the docs' preview mode: a much faster connect
    // because it skips the chat gateway handshake. 'auto' is the full room path.
    videoType: opts.preview ? 'html5-pls' : 'auto',
    gatewayType: opts.preview ? 'none' : '',
    host: {
      name: opts.model.username,
      id: Number(room.hostId),
      room: Number(room.roomId),
      workingServer: room.workingServer,
      cdnServer: room.cdnServer,
      comServer: room.comServer,
      webrtcdata: room.webrtcData,
      mainImage: room.mainImage,
    },
    chatData: {
      chatmode: 0, // free
      ...(sponsorId ? { sponsorId } : {}),
      convertionRate: 1,
      placement: 1,
      deviceType: typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches ? 'mobile' : 'pc',
    },
    handlers: {
      onChatStart: () => opts.handlers?.onStart?.(),
      // The room ended or was never live (e.g. the model went offline between the feed refresh
      // and this mount — free-chat rosters rotate fast). Treated as a failure so the host
      // shows its affiliate facade instead of a black box. EXCEPT when the close is OUR OWN
      // teardown: destroy() reports userExit/navigateAway, which must not be reported as a
      // broken stream (it would flip a perfectly good card to its fallback on unmount).
      onCloseChat: (d: { reasonMsg?: string } | undefined) => {
        const why = d?.reasonMsg ?? 'chat closed';
        if (SELF_CLOSE_REASONS.has(why)) return;
        opts.handlers?.onFail?.(why);
      },
      onPrivateError: (e: unknown) => opts.handlers?.onFail?.(`private error: ${String(e)}`),
      onUserGestureNeeded: () => opts.handlers?.onNeedsGesture?.(),
      onMutedChatStarted: () => opts.handlers?.onStart?.(),
    },
  });

  return {
    teardown: () => {
      try {
        instance.destroy?.(REASON_NAVIGATE_AWAY);
      } catch {
        /* a teardown failure must never break navigation */
      }
    },
    setVolume: (volume: number) => {
      try {
        instance.setVolume?.(volume);
      } catch {
        /* a volume failure must never take the stream down */
      }
    },
    userGesture: () => {
      try {
        instance.onUserGestureMade?.();
      } catch {
        /* same */
      }
    },
  };
}
