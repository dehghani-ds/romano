import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

export type IconName =
  | 'clock'
  | 'refresh'
  | 'check'
  | 'check-circle'
  | 'x'
  | 'x-circle'
  | 'alert'
  | 'coffee'
  | 'building'
  | 'users'
  | 'receipt'
  | 'upload'
  | 'user'
  | 'logout'
  | 'sun'
  | 'moon'
  | 'plus'
  | 'minus'
  | 'chevron-left'
  | 'chevron-right'
  | 'list'
  | 'shield'
  | 'eye'
  | 'eye-off'
  | 'search'
  | 'inbox'
  | 'copy'
  | 'pencil'
  | 'trash'
  | 'wallet'
  | 'cup'
  | 'wrench'
  | 'tag'
  | 'calendar';

/**
 * Inline SVG icons — one family, 1.75px stroke, 24px grid.
 *
 * The design system forbids emoji as structural icons and mixed icon sets, so
 * every glyph in the app comes from this map.
 */
const PATHS: Record<IconName, string> = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-.6 4"/><path d="M20 5v6h-6"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  x: '<path d="M6 6 18 18M18 6 6 18"/>',
  'x-circle': '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  alert: '<path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  coffee:
    '<path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z"/><path d="M17 9h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M7 2v3M11 2v3"/>',
  building:
    '<path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V21"/><path d="M15 10h3.5A1.5 1.5 0 0 1 20 11.5V21"/><path d="M2.5 21h19"/><path d="M7.5 8h4M7.5 12h4M7.5 16h4"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6"/><path d="M17.5 14.3A6.5 6.5 0 0 1 21.5 20"/>',
  receipt:
    '<path d="M6 2.5h12v19l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4Z"/><path d="M9.5 8h5M9.5 12h5"/>',
  upload: '<path d="M12 16V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M4 16v2.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V16"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  logout: '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 8 6 12l4 4"/><path d="M6 12h9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  'chevron-left': '<path d="m14 6-6 6 6 6"/>',
  'chevron-right': '<path d="m10 6 6 6-6 6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  shield: '<path d="M12 3 5 6v5.5c0 4.2 2.9 7.6 7 9.5 4.1-1.9 7-5.3 7-9.5V6l-7-3Z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="m4 4 16 16"/><path d="M9.9 5.9A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.3 4.1"/><path d="M6.6 7.6A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9.6 9.6 0 0 0 3.6-.7"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  inbox:
    '<path d="M3.5 13.5 6 5h12l2.5 8.5v5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-5Z"/><path d="M3.5 13.5H9a3 3 0 0 0 6 0h5.5"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5"/>',
  pencil:
    '<path d="m4 20 .8-4 11-11a2.3 2.3 0 0 1 3.2 3.2l-11 11L4 20Z"/><path d="m14.5 6.5 3 3"/>',
  trash:
    '<path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l.9 12.1A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/><path d="M10.5 11v5.5M13.5 11v5.5"/>',
  wallet:
    '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5H17a1.5 1.5 0 0 1 1.5 1.5v1"/><path d="M3.5 7.5v9A2 2 0 0 0 5.5 18.5H18a2 2 0 0 0 2-2v-7a1.5 1.5 0 0 0-1.5-1.5H5.5a2 2 0 0 1-2-2Z"/><path d="M16.5 13h.01"/>',
  /* A paper cup — supplies, as distinct from the `coffee` mug that is the drink. */
  cup: '<path d="M6 5h12l-1.3 14.1a1.6 1.6 0 0 1-1.6 1.4H8.9a1.6 1.6 0 0 1-1.6-1.4L6 5Z"/><path d="M6.6 10h10.8"/>',
  wrench:
    '<path d="M15.2 3.4a5.5 5.5 0 0 0-6.4 7.3L3.6 15.9a2 2 0 0 0 2.8 2.8l5.2-5.2a5.5 5.5 0 0 0 7.3-6.4l-3 3-2.8-2.8 3-3Z"/>',
  tag: '<path d="M4 11.4V5.5A1.5 1.5 0 0 1 5.5 4h5.9a1.5 1.5 0 0 1 1 .4l7 7a1.5 1.5 0 0 1 0 2.2l-5.8 5.8a1.5 1.5 0 0 1-2.2 0l-7-7a1.5 1.5 0 0 1-.4-1Z"/><path d="M8.5 8.5h.01"/>',
  calendar:
    '<rect x="3.5" y="5.5" width="17" height="15" rx="2"/><path d="M3.5 10h17"/><path d="M8 3v5M16 3v5"/>',
};

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
      [innerHTML]="markup()"
    ></svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
  `,
})
export class Icon {
  private readonly sanitizer = inject(DomSanitizer);

  readonly name = input.required<IconName>();
  readonly size = input(20);

  /**
   * `PATHS` is a fixed, developer-authored map keyed by a string-literal union,
   * so no user input can ever reach it. Angular's HTML sanitizer strips SVG
   * child elements, which would leave every icon blank — hence the explicit
   * trust here.
   */
  protected readonly markup = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(PATHS[this.name()] ?? ''),
  );
}
