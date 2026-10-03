import type { PropertyValues } from '@videojs/element';
import { ContextConsumer } from '@videojs/element/context';
import { mediaContext, sliderContext, UIElement } from '@videojs/html';

import {
  hlsStatics,
  type IFramePlayer,
  IFramePlayerController,
  isHlsJsMedia,
  isImageIFramePlayer,
} from './iframe-player';

const SHADOW_CSS = `\
:host {
  display: block;
  position: relative;
  overflow: hidden;
}
:host([data-renderer]) {
  aspect-ratio: 16 / 9;
  width: var(--media-slider-preview-max-width, 240px);
  max-width: 100%;
  background: #000;
}
video,
img {
  display: none;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
}
:host([data-renderer="video"]) video,
:host([data-renderer="image"]) img {
  display: block;
}`;

function createVideo(): HTMLVideoElement {
  const video = document.createElement('video');

  video.muted = true;
  video.playsInline = true;
  video.disablePictureInPicture = true;
  video.disableRemotePlayback = true;
  video.tabIndex = -1;
  video.setAttribute('part', 'video');

  return video;
}

function createImage(): HTMLImageElement {
  const img = document.createElement('img');

  img.alt = '';
  img.setAttribute('decoding', 'async');
  img.setAttribute('part', 'image');

  return img;
}

/**
 * A slider thumbnail drawn from the stream's HLS I-frame playlists by hls.js.
 *
 * @fires engine-change - The I-frame player was created or released, before it attaches. Read `engine`.
 * @fires frame-change - A different frame is on screen. Read `frameTime`.
 */
export class HlsJsIFrameSliderThumbnailElement extends UIElement {
  static readonly tagName = 'hlsjs-iframe-slider-thumbnail';

  readonly #shadow = this.attachShadow({ mode: 'open' });
  readonly #video = createVideo();
  readonly #image = createImage();
  readonly #slider = new ContextConsumer(this, { context: sliderContext, subscribe: true });
  readonly #media = new ContextConsumer(this, { context: mediaContext, subscribe: true });
  readonly #iframes = new IFramePlayerController(this);

  #attached: IFramePlayer | null = null;
  #frameTime = Number.NaN;
  #frameSize = '';
  #frameCallback: number | null = null;

  constructor() {
    super();

    const style = document.createElement('style');

    style.textContent = SHADOW_CSS;
    this.#shadow.append(style, this.#video, this.#image, document.createElement('slot'));
  }

  /** The hls.js I-frame player drawing this thumbnail, or `null` while the stream has none. For inspection only. */
  get engine(): IFramePlayer | null {
    return this.#iframes.engine;
  }

  /** Presentation time of the frame on screen, in seconds, or `NaN` before the first one. */
  get frameTime(): number {
    return this.#frameTime;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.destroyed) return;

    this.setAttribute('aria-hidden', 'true');
    this.#watchFrames();
    this.requestUpdate();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#unwatchFrames();
  }

  protected override update(changed: PropertyValues): void {
    super.update(changed);

    const media = this.#media.value?.media;

    this.#iframes.setMedia(isHlsJsMedia(media) ? media : null);

    const engine = this.#iframes.engine;
    if (engine !== this.#attached) this.#attach(engine);

    this.toggleAttribute('data-hidden', !engine);
    this.toggleAttribute('data-loading', !!engine && Number.isNaN(this.#frameTime));

    // On live streams the pointer value drifts with the seekable window whether or not anyone is hovering, so frames
    // are only fetched while the preview is up.
    const slider = this.#slider.value;
    if (!engine || !slider || !(slider.state.pointing || slider.state.dragging)) return;

    this.#iframes.load(slider.pointerValue);
  }

  #attach(engine: IFramePlayer | null): void {
    this.#attached = engine;
    this.#setFrame(Number.NaN, 0, 0);
    this.#image.removeAttribute('src');

    if (!engine) {
      this.removeAttribute('data-renderer');
      this.dispatchEvent(new Event('engine-change'));
      return;
    }

    const image = isImageIFramePlayer(engine);

    this.setAttribute('data-renderer', image ? 'image' : 'video');
    this.dispatchEvent(new Event('engine-change'));

    if (!image) {
      engine.attachMedia(this.#video);
      return;
    }

    // Image players fire FRAG_BUFFERED from the image's `load`, which is the only presentation signal they have.
    engine.on(hlsStatics(engine).Events.FRAG_BUFFERED, (_event, data) => {
      if (engine === this.#attached) {
        this.#setFrame(data.frag.start, this.#image.naturalWidth, this.#image.naturalHeight);
      }
    });
    engine.attachImage(this.#image);
  }

  #watchFrames(): void {
    if (!('requestVideoFrameCallback' in this.#video)) return;

    this.#frameCallback = this.#video.requestVideoFrameCallback(this.#onVideoFrame);
  }

  #unwatchFrames(): void {
    if (this.#frameCallback === null) return;

    this.#video.cancelVideoFrameCallback(this.#frameCallback);
    this.#frameCallback = null;
  }

  #onVideoFrame = (_now: number, metadata: VideoFrameCallbackMetadata): void => {
    this.#frameCallback = null;

    if (this.#attached && !isImageIFramePlayer(this.#attached)) {
      this.#setFrame(metadata.mediaTime, metadata.width, metadata.height);
    }

    if (this.isConnected) this.#watchFrames();
  };

  #setFrame(time: number, width: number, height: number): void {
    const size = width && height ? `${width} / ${height}` : '';

    if (size !== this.#frameSize) {
      this.#frameSize = size;
      this.style.aspectRatio = size;
    }

    if (Object.is(time, this.#frameTime)) return;

    this.#frameTime = time;
    this.requestUpdate();

    if (!Number.isNaN(time)) this.dispatchEvent(new Event('frame-change'));
  }
}
