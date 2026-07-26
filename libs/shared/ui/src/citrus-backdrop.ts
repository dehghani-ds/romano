import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The decorative layer behind every page: a lime slice, ice, and two soft
 * washes of colour.
 *
 * Inline SVG rather than an <img> or a background-image, for two reasons: an
 * external SVG cannot read the page's custom properties, so it could not
 * follow the theme, and inlining keeps it off the network entirely.
 *
 * It is `aria-hidden` and `pointer-events: none` — nothing here carries
 * meaning, and every opacity is low enough that text contrast is unchanged.
 */
@Component({
  selector: 'app-citrus-backdrop',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop" aria-hidden="true">
      <div class="wash wash--lime"></div>
      <div class="wash wash--ice"></div>

      <svg class="art art--slice" viewBox="-110 -110 220 220" role="presentation">
        <circle class="rind" r="100" />
        <circle class="pith" r="90" />
        @for (angle of segmentAngles; track angle) {
          <path
            class="segment"
            [attr.transform]="'rotate(' + angle + ')'"
            d="M 7.5 -2.7 L 75.2 -27.4 A 80 80 0 0 1 75.2 27.4 L 7.5 2.7 A 8 8 0 0 0 7.5 -2.7 Z"
          />
        }
      </svg>

      <svg class="art art--ice-a" viewBox="0 0 100 100" role="presentation">
        <rect class="cube" x="8" y="8" width="84" height="84" rx="18" />
        <rect class="glint" x="24" y="24" width="30" height="12" rx="6" />
      </svg>

      <svg class="art art--ice-b" viewBox="0 0 100 100" role="presentation">
        <rect class="cube" x="8" y="8" width="84" height="84" rx="18" />
        <rect class="glint" x="24" y="24" width="30" height="12" rx="6" />
      </svg>
    </div>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: var(--z-base);
      overflow: hidden;
      pointer-events: none;
      /* Paints behind everything, including the page background's own colour. */
      isolation: isolate;
    }

    .wash {
      position: absolute;
      width: 70vmax;
      height: 70vmax;
      border-radius: var(--radius-full);
    }

    .wash--lime {
      inset-block-start: -28vmax;
      inset-inline-end: -20vmax;
      background: radial-gradient(circle, var(--c-primary-tint), transparent 68%);
    }

    .wash--ice {
      inset-block-end: -32vmax;
      inset-inline-start: -24vmax;
      background: radial-gradient(circle, var(--c-ice), transparent 66%);
      opacity: 0.55;
    }

    .art {
      position: absolute;
      overflow: visible;
    }

    /* The slice hangs off the inline-start edge, half out of frame. */
    .art--slice {
      width: clamp(260px, 34vw, 460px);
      aspect-ratio: 1;
      inset-block-end: -12%;
      inset-inline-start: -10%;
      opacity: 0.14;
      transform: rotate(-12deg);
    }

    .rind {
      fill: var(--c-primary);
    }

    .pith {
      fill: var(--c-surface);
    }

    .segment {
      fill: var(--c-accent);
    }

    .art--ice-a,
    .art--ice-b {
      width: clamp(72px, 9vw, 132px);
      aspect-ratio: 1;
      opacity: 0.5;
    }

    .art--ice-a {
      inset-block-start: 12%;
      inset-inline-end: 6%;
      transform: rotate(14deg);
    }

    .art--ice-b {
      inset-block-end: 18%;
      inset-inline-end: 14%;
      transform: rotate(-9deg);
    }

    .cube {
      fill: var(--c-ice);
      stroke: var(--c-ice-deep);
      stroke-width: 3;
    }

    .glint {
      fill: var(--c-surface);
      opacity: 0.7;
    }

    /*
     * The same opacity is not the same weight in both themes: lime at 14% over
     * cream is a whisper, over near-black it is a poster. Dark gets its own
     * values rather than inheriting light's.
     */
    :host-context([data-theme='dark']) {
      .art--slice {
        opacity: 0.09;
      }

      .art--ice-a,
      .art--ice-b {
        opacity: 0.34;
      }

      .glint {
        opacity: 0.35;
      }
    }

    /* Below the fold of a phone the art crowds the content, so only the washes
       survive at narrow widths. */
    @media (max-width: 767px) {
      .art--ice-b {
        display: none;
      }

      .art--slice {
        opacity: 0.1;
      }
    }
  `,
})
export class CitrusBackdrop {
  /** Eight wedges, one every 45°, drawn from a single rotated path. */
  protected readonly segmentAngles = [0, 45, 90, 135, 180, 225, 270, 315];
}
