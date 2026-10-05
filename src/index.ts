import { HlsJsIFrameSliderThumbnailElement } from './slider-thumbnail.js';

export type { IFramePlayer } from './iframe-player.js';
export { HlsJsIFrameSliderThumbnailElement };

if (!customElements.get(HlsJsIFrameSliderThumbnailElement.tagName)) {
  customElements.define(HlsJsIFrameSliderThumbnailElement.tagName, HlsJsIFrameSliderThumbnailElement);
}

declare global {
  interface HTMLElementTagNameMap {
    [HlsJsIFrameSliderThumbnailElement.tagName]: HlsJsIFrameSliderThumbnailElement;
  }
}
