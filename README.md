# videojs-hlsjs-iframe-thumbnail

[![npm](https://img.shields.io/npm/v/videojs-hlsjs-iframe-thumbnail)](https://www.npmjs.com/package/videojs-hlsjs-iframe-thumbnail)

`<hlsjs-iframe-slider-thumbnail>` is a [Video.js v10](https://videojs.org) slider thumbnail that shows previews from the
stream's HLS I-frame playlists (`#EXT-X-I-FRAME-STREAM-INF`), decoded on demand by
[hls.js](https://github.com/video-dev/hls.js). It needs no storyboard / thumbnail VTT and works with live and DVR streams.

## Install

```sh
npm install videojs-hlsjs-iframe-thumbnail @videojs/html @videojs/hlsjs-video hls.js@^1.7
```

The I-frame API needs hls.js 1.7. `@videojs/hlsjs-video` currently pins an older version, so override it:

```jsonc
// package.json
"overrides": { "hls.js": "$hls.js" }        // npm
"pnpm": { "overrides": { "hls.js": "^1.7" } } // pnpm
"resolutions": { "hls.js": "^1.7" }          // yarn
```

`npm ls hls.js` should then show a single 1.7.x. Without it the element warns once and stays hidden. The Video.js CDN
bundles bake in their own hls.js, so a bundler is required until they update their hls.js version.

## Usage

In a packaged skin, put it in the `thumbnail` slot next to [`<hlsjs-video>`](https://videojs.org/docs/framework/html/reference/components/hlsjs-video):

```html
<video-player>
  <video-skin>
    <hlsjs-video src="https://example.com/master.m3u8" playsinline></hlsjs-video>
    <hlsjs-iframe-slider-thumbnail slot="thumbnail"></hlsjs-iframe-slider-thumbnail>
  </video-skin>
</video-player>

<script type="module">
  import '@videojs/html/video/player';
  import '@videojs/html/video/skin';
  import '@videojs/html/media/hlsjs-video';
  import 'videojs-hlsjs-iframe-thumbnail';
</script>
```

The skin still positions the popup, and still shows a `<track kind="metadata" label="thumbnails">` storyboard for
streams without I-frame playlists.

In a hand-built slider it goes where `<media-slider-thumbnail>` would, positioned by the slider's pointer variable:

```html
<media-time-slider>
  <media-slider-track>
    <media-slider-fill></media-slider-fill>
  </media-slider-track>
  <hlsjs-iframe-slider-thumbnail></hlsjs-iframe-slider-thumbnail>
</media-time-slider>
```

```css
hlsjs-iframe-slider-thumbnail {
  position: absolute;
  bottom: 100%;
  left: var(--media-slider-pointer);
  width: 200px;
  transform: translateX(-50%);
  opacity: 0;
}
media-time-slider[data-pointing] hlsjs-iframe-slider-thumbnail {
  opacity: 1;
}
hlsjs-iframe-slider-thumbnail[data-hidden] {
  display: none;
}
```

### React

React 19 renders custom elements directly, so the same markup works in JSX. See [`demo/react.tsx`](./demo/react.tsx),
and [`demo/jsx.d.ts`](./demo/jsx.d.ts) for TypeScript. There is no `@videojs/react` component yet because its slider
does not expose the pointer time.

## API

The element extends Video.js's `UIElement` and finds the player's media and slider on its own. It takes no attributes.

| Member                           | Description                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine` (read-only)             | The hls.js I-frame player drawing the thumbnail, or `null`. The element owns its lifecycle.                                                       |
| `frameTime` (read-only)          | Presentation time of the frame on screen, in seconds; `NaN` before the first one.                                                                 |
| `engine-change` event            | The I-frame player was created or released. Fired before it attaches, so `MEDIA_ATTACHING` is observable.                                         |
| `frame-change` event             | A different frame is on screen.                                                                                                                   |
| `data-renderer`                  | `video` or `image` while a player is active: MJPG variants render through hls.js's image player into an `<img>`, other variants into a `<video>`. |
| `data-loading`                   | Set from player creation until the first frame is on screen.                                                                                      |
| `data-hidden`                    | Set while there is no player: no I-frame playlists, or no hls.js engine.                                                                          |
| `::part(video)`, `::part(image)` | The render targets.                                                                                                                               |
| Default slot                     | Rendered over the frame, for overlays such as a timestamp.                                                                                        |

The host sizes itself to the decoded frame's aspect ratio and defaults its width to
`var(--media-slider-preview-max-width, 240px)`, which the packaged skins define.

## Behavior

- Frames load only while the pointer is on the slider or the thumb is being dragged.
- Loading a new stream rebuilds the I-frame player.

## DRM

Configure `source.drm` on `<hlsjs-video>` as usual. The I-frame player gets the same DRM configuration and licenses
from the same server. MJPG I-frame variants render without EME.

## Development

```sh
npm install
npm run dev        # demo pages at http://localhost:5174
npm test           # unit tests (Vitest, happy-dom)
npm run test:e2e   # Playwright against the demo pages, streaming real test assets
npm run lint       # oxlint and oxfmt --check
npm run build      # dist/
```

Vite serves the demo pages from `src/`, and the end-to-end tests run against them.

## License

[MIT](./LICENSE) © PBS
