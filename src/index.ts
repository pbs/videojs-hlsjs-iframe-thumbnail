import { HlsJsIFrameSliderThumbnailElement } from './slider-thumbnail';

export type { IFramePlayer } from './iframe-player';
export { HlsJsIFrameSliderThumbnailElement };

if (!customElements.get(HlsJsIFrameSliderThumbnailElement.tagName)) {
  customElements.define(HlsJsIFrameSliderThumbnailElement.tagName, HlsJsIFrameSliderThumbnailElement);
}

declare global {
  interface HTMLElementTagNameMap {
    [HlsJsIFrameSliderThumbnailElement.tagName]: HlsJsIFrameSliderThumbnailElement;
  }
}
