import { ContextProvider } from '@videojs/element/context';
import { mediaContext, type MediaContextValue, sliderContext, type SliderContextValue } from '@videojs/html';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { HlsJsIFrameSliderThumbnailElement } from '../index';

type Listener = (event: string, data: object) => void;

class StockCapLevelController {}

// I-frame players are `Hls` subclasses in hls.js, so they share its statics.
class FakePlayer {
  static Events = {
    MANIFEST_LOADING: 'hlsManifestLoading',
    INIT_PTS_FOUND: 'hlsInitPtsFound',
    FRAG_BUFFERED: 'hlsFragBuffered',
    DESTROYING: 'hlsDestroying',
  };

  listeners = new Map<string, Set<Listener>>();
  attachMedia = vi.fn();
  // `declare`: the element tells image players apart with `in`, so video players must not own the key.
  declare attachImage?: ReturnType<typeof vi.fn>;
  loadMediaAt = vi.fn();
  destroy = vi.fn(() => this.fire('hlsDestroying'));

  constructor(image: boolean) {
    if (image) this.attachImage = vi.fn();
  }

  on(event: string, listener: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
  }

  fire(event: string, data: object = {}): void {
    this.listeners.get(event)?.forEach((listener) => listener(event, data));
  }
}

// Only the surface the element reads: statics (`Events`, `DefaultConfig`, `version`), `config`, `media`,
// `iframeVariants`, the two player factories, and `on`/`off`.
class FakeHls extends FakePlayer {
  static version = '1.7.3';
  static DefaultConfig = { capLevelController: StockCapLevelController };

  config: Record<string, unknown> = { iframeController: class {} };
  media = { buffered: { length: 0 } };
  iframeVariants: Array<{ imageCodec?: string; videoCodec?: string }>;
  players: FakePlayer[] = [];
  createIFramePlayer = vi.fn((_config?: object) => this.#make(false));
  createImageIFramePlayer = vi.fn((_config?: object) => this.#make(true));

  constructor(iframeVariants: Array<{ imageCodec?: string; videoCodec?: string }> = [AVC]) {
    super(false);
    this.iframeVariants = iframeVariants;
  }

  off(event: string, listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }

  get player(): FakePlayer | undefined {
    return this.players.at(-1);
  }

  #make(image: boolean): FakePlayer {
    const player = new FakePlayer(image);
    this.players.push(player);
    return player;
  }
}

const AVC = { videoCodec: 'avc1.64001f' };
const MJPG = { imageCodec: 'mjpg' };
const MAIN = { id: 'main' };
const keyAccess = () => Promise.resolve();

const sliderValue = (pointerValue: number, state: Partial<SliderContextValue['state']> = {}) =>
  // The element reads only `pointerValue`, `state.pointing` and `state.dragging`.
  ({ pointerValue, state: { pointing: false, dragging: false, ...state } }) as SliderContextValue;

async function mount(engine: unknown = new FakeHls()) {
  const player = document.createElement('div');
  const media = Object.assign(document.createElement('div'), { engine });
  const slider = new ContextProvider(player, { context: sliderContext, initialValue: sliderValue(0) });
  const mediaProvider = new ContextProvider(player, {
    context: mediaContext,
    initialValue: { media, registerMedia: () => () => {} } as unknown as MediaContextValue,
  });
  const thumbnail = new HlsJsIFrameSliderThumbnailElement();

  player.append(media, thumbnail);
  document.body.append(player);
  await thumbnail.updateComplete;

  return {
    thumbnail,
    media,
    point: async (time: number, state: Partial<SliderContextValue['state']> = { pointing: true }) => {
      slider.setValue(sliderValue(time, state));
      await thumbnail.updateComplete;
    },
    setMedia: async (next: HTMLElement) => {
      mediaProvider.setValue({ media: next, registerMedia: () => () => {} } as unknown as MediaContextValue);
      await thumbnail.updateComplete;
    },
  };
}

// happy-dom has no requestVideoFrameCallback; tests present frames by hand.
let presentFrame: ((metadata: Partial<VideoFrameCallbackMetadata>) => void) | null = null;

beforeAll(() => {
  Object.assign(HTMLVideoElement.prototype, {
    requestVideoFrameCallback(callback: VideoFrameRequestCallback) {
      presentFrame = (metadata) => callback(0, { mediaTime: 0, width: 0, height: 0, ...metadata } as never);
      return 1;
    },
    cancelVideoFrameCallback() {
      presentFrame = null;
    },
  });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('HlsJsIFrameSliderThumbnailElement', () => {
  describe('player creation', () => {
    it('renders MJPG variants through an image player attached to the shadow <img>', async () => {
      const engine = new FakeHls([AVC, MJPG]);
      const { thumbnail } = await mount(engine);

      engine.fire('hlsInitPtsFound', MAIN);
      await thumbnail.updateComplete;

      expect(engine.createImageIFramePlayer).toHaveBeenCalledOnce();
      expect(engine.createIFramePlayer).not.toHaveBeenCalled();
      expect(engine.player!.attachImage).toHaveBeenCalledWith(thumbnail.shadowRoot!.querySelector('img'));
      expect(thumbnail.engine).toBe(engine.player);
      expect(thumbnail.getAttribute('data-renderer')).toBe('image');
    });

    it('renders other variants through a video player attached to the shadow <video>', async () => {
      const engine = new FakeHls([AVC]);
      const { thumbnail } = await mount(engine);

      engine.fire('hlsInitPtsFound', MAIN);
      await thumbnail.updateComplete;

      expect(engine.createImageIFramePlayer).not.toHaveBeenCalled();
      expect(engine.player!.attachMedia).toHaveBeenCalledWith(thumbnail.shadowRoot!.querySelector('video'));
      expect(thumbnail.getAttribute('data-renderer')).toBe('video');
    });

    it('stays hidden when the stream has no I-frame variants', async () => {
      const engine = new FakeHls([]);
      const { thumbnail } = await mount(engine);

      engine.fire('hlsInitPtsFound', MAIN);
      await thumbnail.updateComplete;

      expect(engine.createIFramePlayer).not.toHaveBeenCalled();
      expect(thumbnail.engine).toBeNull();
      expect(thumbnail.hasAttribute('data-hidden')).toBe(true);
    });

    it('creates the player at once when bound after the main stream has buffered', async () => {
      const engine = new FakeHls();
      engine.media = { buffered: { length: 1 } };
      const { thumbnail } = await mount(engine);

      await thumbnail.updateComplete;

      expect(thumbnail.engine).toBe(engine.player);
    });

    it('waits for the main stream: ignores audio INIT_PTS, accepts FRAG_BUFFERED, builds once', async () => {
      const engine = new FakeHls();
      const { thumbnail } = await mount(engine);
      await thumbnail.updateComplete;

      engine.fire('hlsInitPtsFound', { id: 'audio' });
      expect(engine.createIFramePlayer).not.toHaveBeenCalled();

      engine.fire('hlsFragBuffered', MAIN);
      engine.fire('hlsInitPtsFound', MAIN);
      engine.fire('hlsFragBuffered', MAIN);
      expect(engine.createIFramePlayer).toHaveBeenCalledOnce();
    });
  });

  describe('player config', () => {
    it("hands the I-frame player hls.js's stock cap-level controller", async () => {
      const engine = new FakeHls();
      await mount(engine);

      engine.fire('hlsInitPtsFound', MAIN);

      expect(engine.createIFramePlayer.mock.calls[0]).toEqual([{ capLevelController: StockCapLevelController }]);
    });

    it('forwards requestMediaKeySystemAccessFunc only when EME is on', async () => {
      const clear = new FakeHls();
      const drm = new FakeHls();
      clear.config = { ...clear.config, requestMediaKeySystemAccessFunc: keyAccess };
      drm.config = { ...drm.config, emeEnabled: true, requestMediaKeySystemAccessFunc: keyAccess };
      await mount(clear);
      await mount(drm);

      clear.fire('hlsInitPtsFound', MAIN);
      drm.fire('hlsInitPtsFound', MAIN);

      expect(clear.createIFramePlayer.mock.calls[0]![0]).not.toHaveProperty('requestMediaKeySystemAccessFunc');
      expect(drm.createIFramePlayer.mock.calls[0]![0]).toHaveProperty('requestMediaKeySystemAccessFunc', keyAccess);
    });
  });

  describe('loading frames', () => {
    it('requests frames only while pointing or dragging, skipping near-identical times', async () => {
      const engine = new FakeHls();
      const { thumbnail, point } = await mount(engine);
      engine.fire('hlsInitPtsFound', MAIN);
      await thumbnail.updateComplete;
      const { loadMediaAt } = engine.player!;

      await point(12.5, { pointing: false });
      expect(loadMediaAt).not.toHaveBeenCalled();

      await point(12.6);
      expect(loadMediaAt).toHaveBeenLastCalledWith(12.6);

      await point(12.65);
      expect(loadMediaAt).toHaveBeenCalledOnce();

      await point(30, { dragging: true });
      expect(loadMediaAt).toHaveBeenLastCalledWith(30);
    });
  });

  describe('lifecycle', () => {
    it('rebuilds the player when the engine loads a new manifest', async () => {
      const engine = new FakeHls();
      const { thumbnail } = await mount(engine);
      engine.fire('hlsInitPtsFound', MAIN);
      await thumbnail.updateComplete;
      const first = engine.player!;

      engine.fire('hlsManifestLoading');
      await thumbnail.updateComplete;
      expect(first.destroy).toHaveBeenCalledOnce();
      expect(thumbnail.engine).toBeNull();
      expect(thumbnail.hasAttribute('data-renderer')).toBe(false);

      engine.fire('hlsInitPtsFound', MAIN);
      await thumbnail.updateComplete;
      expect(thumbnail.engine).toBe(engine.players[1]);
    });

    it('rebinds on loadstart when the media has a new engine', async () => {
      const first = new FakeHls();
      const { thumbnail, media } = await mount(first);
      first.fire('hlsInitPtsFound', MAIN);
      await thumbnail.updateComplete;

      const second = new FakeHls();
      media.engine = second;
      media.dispatchEvent(new Event('loadstart'));
      await thumbnail.updateComplete;

      expect(first.player!.destroy).toHaveBeenCalledOnce();
      for (const listeners of first.listeners.values()) expect(listeners.size).toBe(0);

      second.fire('hlsInitPtsFound', MAIN);
      await thumbnail.updateComplete;
      expect(thumbnail.engine).toBe(second.player);
    });

    it('follows the player media when it changes', async () => {
      const first = new FakeHls();
      const { thumbnail, setMedia } = await mount(first);
      first.fire('hlsInitPtsFound', MAIN);
      await thumbnail.updateComplete;

      const second = new FakeHls();
      await setMedia(Object.assign(document.createElement('div'), { engine: second }));

      expect(first.player!.destroy).toHaveBeenCalledOnce();
      second.fire('hlsInitPtsFound', MAIN);
      await thumbnail.updateComplete;
      expect(thumbnail.engine).toBe(second.player);
    });

    it('lets go when hls.js destroys the engine', async () => {
      const engine = new FakeHls();
      const { thumbnail } = await mount(engine);
      engine.fire('hlsInitPtsFound', MAIN);
      await thumbnail.updateComplete;

      engine.fire('hlsDestroying');
      await thumbnail.updateComplete;

      expect(thumbnail.engine).toBeNull();
      for (const listeners of engine.listeners.values()) expect(listeners.size).toBe(0);
    });

    it('destroys the player and unsubscribes on disconnect', async () => {
      const engine = new FakeHls();
      const { thumbnail } = await mount(engine);
      engine.fire('hlsInitPtsFound', MAIN);
      await thumbnail.updateComplete;

      thumbnail.remove();

      expect(engine.player!.destroy).toHaveBeenCalledOnce();
      for (const listeners of engine.listeners.values()) expect(listeners.size).toBe(0);
    });

    it('warns once and stays hidden when hls.js has no I-frame API', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const legacy = { on: vi.fn(), off: vi.fn(), config: {}, constructor: { version: '1.6.7' } };
      const { thumbnail } = await mount(legacy);
      await mount(legacy);

      expect(legacy.on).not.toHaveBeenCalled();
      expect(thumbnail.engine).toBeNull();
      expect(thumbnail.hasAttribute('data-hidden')).toBe(true);
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0]![0]).toMatch(/hls\.js 1\.6\.7 has no I-frame API/);
    });
  });

  describe('state', () => {
    it('reports loading until a video frame is presented, then its time and size', async () => {
      const engine = new FakeHls();
      const { thumbnail } = await mount(engine);
      const events: string[] = [];
      thumbnail.addEventListener('engine-change', () =>
        events.push(`engine:${engine.player!.attachMedia.mock.calls.length}`)
      );
      thumbnail.addEventListener('frame-change', () => events.push(`frame:${thumbnail.frameTime}`));

      engine.fire('hlsInitPtsFound', MAIN);
      await thumbnail.updateComplete;
      expect(thumbnail.hasAttribute('data-loading')).toBe(true);
      expect(thumbnail.frameTime).toBeNaN();

      presentFrame!({ mediaTime: 8, width: 320, height: 240 });
      await thumbnail.updateComplete;
      expect(thumbnail.hasAttribute('data-loading')).toBe(false);
      expect(thumbnail.frameTime).toBe(8);
      expect(thumbnail.style.aspectRatio).toBe('320 / 240');

      presentFrame!({ mediaTime: 8, width: 320, height: 240 });
      expect(events).toEqual(['engine:0', 'frame:8']);

      engine.fire('hlsManifestLoading');
      await thumbnail.updateComplete;
      expect(thumbnail.frameTime).toBeNaN();
      expect(thumbnail.style.aspectRatio).toBe('');
      expect(events).toEqual(['engine:0', 'frame:8', 'engine:1']);
    });

    it('takes image frame times from the image player', async () => {
      const engine = new FakeHls([MJPG]);
      const { thumbnail } = await mount(engine);
      engine.fire('hlsInitPtsFound', MAIN);
      await thumbnail.updateComplete;

      engine.player!.fire('hlsFragBuffered', { frag: { start: 42 } });
      await thumbnail.updateComplete;

      expect(thumbnail.frameTime).toBe(42);
      expect(thumbnail.hasAttribute('data-loading')).toBe(false);
    });
  });
});
