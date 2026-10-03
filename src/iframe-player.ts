import type { ReactiveController, ReactiveControllerHost } from '@videojs/element';
import type Hls from 'hls.js';
import type { HlsConfig, HlsIFramesOnly, HlsImageIFramesOnly } from 'hls.js';

/** An hls.js I-frame player: `HlsImageIFramesOnly` for MJPG variants, `HlsIFramesOnly` otherwise. */
export type IFramePlayer = HlsIFramesOnly | HlsImageIFramesOnly;

/** Media backed by an hls.js engine, such as `<hlsjs-video>`. */
export interface HlsJsMedia extends EventTarget {
  readonly engine: Hls | null;
}

export function isHlsJsMedia(media: unknown): media is HlsJsMedia {
  return typeof media === 'object' && media !== null && 'engine' in media && 'addEventListener' in media;
}

export function isImageIFramePlayer(player: IFramePlayer): player is HlsImageIFramesOnly {
  return 'attachImage' in player;
}

/**
 * The hls.js class behind an instance. Read off the instance rather than imported, so I-frame players come from the
 * same hls.js copy as the main stream and nothing here depends on hls.js at runtime.
 */
export function hlsStatics(instance: Hls | IFramePlayer): typeof Hls {
  return instance.constructor as typeof Hls;
}

/** Pointer positions closer than this resolve to the same I-frame, so they are not requested again. */
const LOAD_EPSILON = 0.1;

let warnedUnsupported = false;

/**
 * Owns the hls.js I-frame player for the media's current stream and keeps it in step with the main engine. The player
 * is built once the main stream has found its initial PTS (it takes a snapshot of it at creation), rebuilt for each
 * manifest, and released when the engine goes away. The host is asked to update whenever `engine` changes.
 */
export class IFramePlayerController implements ReactiveController {
  readonly #host: ReactiveControllerHost;

  #media: HlsJsMedia | null = null;
  #hls: Hls | null = null;
  #engine: IFramePlayer | null = null;
  #lastTime = Number.NaN;

  constructor(host: ReactiveControllerHost) {
    this.#host = host;
    host.addController(this);
  }

  /** The I-frame player for the current stream, or `null` until the stream has one. */
  get engine(): IFramePlayer | null {
    return this.#engine;
  }

  /** Follow this media's engine, or `null` to release the player and stop listening. */
  setMedia(media: HlsJsMedia | null): void {
    if (media === this.#media) return;

    this.#media?.removeEventListener('loadstart', this.#onLoadStart);
    this.#media = media;
    // `<hlsjs-video>` dispatches `loadstart` after building a new engine and before it loads the source.
    media?.addEventListener('loadstart', this.#onLoadStart);

    this.#setHls(media?.engine ?? null);
  }

  /** Show the I-frame at or before `time`, in seconds on the main stream's timeline. */
  load(time: number): void {
    if (!this.#engine || Math.abs(time - this.#lastTime) < LOAD_EPSILON) return;

    this.#lastTime = time;
    this.#engine.loadMediaAt(time);
  }

  hostDisconnected(): void {
    this.setMedia(null);
  }

  hostDestroyed(): void {
    this.setMedia(null);
  }

  #onLoadStart = (): void => {
    this.#setHls(this.#media?.engine ?? null);
  };

  // Video.js reuses the engine when only the URL changes, so a new manifest means new I-frame variants.
  #onManifestLoading = (): void => {
    this.#release();
  };

  #onDestroying = (): void => {
    this.#setHls(null);
  };

  // INIT_PTS_FOUND is the first usable signal; FRAG_BUFFERED covers a bind that landed between it and the first append.
  // Both repeat, at discontinuities and for every fragment, so only the first after a load builds anything.
  #onMainStream = (_event: string, data: { id: string }): void => {
    if (data.id === 'main' && !this.#engine) this.#create();
  };

  #setHls(hls: Hls | null): void {
    const next = hls && supportsIFrames(hls) ? hls : null;
    if (next === this.#hls) return;

    const prev = this.#hls;

    if (prev) {
      const { Events } = hlsStatics(prev);

      prev.off(Events.MANIFEST_LOADING, this.#onManifestLoading);
      prev.off(Events.INIT_PTS_FOUND, this.#onMainStream);
      prev.off(Events.FRAG_BUFFERED, this.#onMainStream);
      prev.off(Events.DESTROYING, this.#onDestroying);
    }

    this.#release();
    this.#hls = next;
    if (!next) return;

    const { Events } = hlsStatics(next);

    next.on(Events.MANIFEST_LOADING, this.#onManifestLoading);
    next.on(Events.INIT_PTS_FOUND, this.#onMainStream);
    next.on(Events.FRAG_BUFFERED, this.#onMainStream);
    next.on(Events.DESTROYING, this.#onDestroying);

    // Bound after playback began: INIT_PTS_FOUND is long gone, and a paused, fully buffered stream sends no more
    // FRAG_BUFFERED either.
    if (next.media?.buffered.length) this.#create();
  }

  #create(): void {
    const hls = this.#hls;
    if (!hls || hls.iframeVariants.length === 0) return;

    const config = iframePlayerConfig(hls);
    // MJPG variants decode as plain images, which spares the preview an MSE pipeline.
    const hasImages = hls.iframeVariants.some((variant) => variant.imageCodec);
    const engine = (hasImages && hls.createImageIFramePlayer(config)) || hls.createIFramePlayer(config);
    if (!engine) return;

    // hls.js destroys I-frame players itself with the main instance and on each new manifest.
    engine.on(hlsStatics(hls).Events.DESTROYING, () => this.#release());

    this.#engine = engine;
    this.#lastTime = Number.NaN;
    this.#host.requestUpdate();
  }

  #release(): void {
    const engine = this.#engine;
    if (!engine) return;

    this.#engine = null;
    this.#lastTime = Number.NaN;
    engine.destroy();
    this.#host.requestUpdate();
  }
}

function supportsIFrames(hls: Hls): boolean {
  const supported = typeof hls.createIFramePlayer === 'function' && !!hls.config.iframeController;

  if (!supported && !warnedUnsupported) {
    warnedUnsupported = true;
    console.warn(
      `[hlsjs-iframe-slider-thumbnail] hls.js ${hlsStatics(hls).version} has no I-frame API; previews need the full ` +
        'build of hls.js 1.7 or later. @videojs/hlsjs-video pins its own hls.js; see the README for the override.'
    );
  }

  return supported;
}

/**
 * Overrides for the config hls.js copies from the main instance. Video.js's cap-level controller would take over the
 * main stream's rendition cap, and Video.js sets its key-system access function on `config`, which is not copied.
 */
function iframePlayerConfig(hls: Hls): Partial<HlsConfig> {
  const config: Partial<HlsConfig> = { capLevelController: hlsStatics(hls).DefaultConfig.capLevelController };

  if (hls.config.emeEnabled) config.requestMediaKeySystemAccessFunc = hls.config.requestMediaKeySystemAccessFunc;

  return config;
}
