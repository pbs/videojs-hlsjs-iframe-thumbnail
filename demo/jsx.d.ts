// React 19 renders custom elements directly; this only tells TypeScript about the tags the demo uses.
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type CustomElement<T extends HTMLElement, Props = object> = DetailedHTMLProps<HTMLAttributes<T>, T> & Props;

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'video-player': CustomElement<HTMLElement>;
      'video-skin': CustomElement<HTMLElement>;
      'hlsjs-video': CustomElement<
        HTMLElement,
        { src?: string; playsinline?: boolean; muted?: boolean; autoplay?: boolean }
      >;
      'hlsjs-iframe-slider-thumbnail': CustomElement<HTMLElementTagNameMap['hlsjs-iframe-slider-thumbnail']>;
    }
  }
}
