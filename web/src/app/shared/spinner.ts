import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Inline busy indicator for buttons and short waits. */
@Component({
  selector: 'app-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="spinner" [style.width.px]="size()" [style.height.px]="size()"></span>
    <span class="visually-hidden">{{ label() }}</span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
    }

    .spinner {
      display: block;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      opacity: 0.9;
      animation: spin 640ms linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .spinner {
        animation-duration: 1.6s;
      }
    }
  `,
})
export class Spinner {
  readonly size = input(16);
  readonly label = input('Loading');
}
