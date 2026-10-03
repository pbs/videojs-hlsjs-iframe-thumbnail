import '@videojs/html/video/player';
import '@videojs/html/video/skin';
import '@videojs/html/media/hlsjs-video';
import 'videojs-hlsjs-iframe-thumbnail';

import { createRoot } from 'react-dom/client';

const SRC = 'https://pbs.github.io/test-streams/test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

function Player() {
  return (
    <video-player>
      <video-skin>
        <hlsjs-video id="video" src={SRC} playsinline muted autoplay />
        <hlsjs-iframe-slider-thumbnail id="thumbnail" slot="thumbnail" />
      </video-skin>
    </video-player>
  );
}

createRoot(document.getElementById('root')!).render(<Player />);
