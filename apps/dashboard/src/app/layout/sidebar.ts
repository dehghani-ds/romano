import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { Icon, ThemeService } from '@romano/ui';

import { AuthService } from '../core/auth.service';

/**
 * The admin navigation.
 *
 * A persistent rail from 1024px up, per the design system; below that it
 * collapses to a horizontal bar so the console stays usable on a phone without
 * a drawer to open.
 */
@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, Icon],
  template: `
    <aside class="sidebar">
      <a class="brand" routerLink="/" aria-label="داشبورد رومانو">
        <span class="brand__mark"><app-icon name="shield" [size]="18" /></span>
        <span class="brand__name">داشبورد رومانو</span>
      </a>

      <nav class="nav" aria-label="منوی مدیریت">
        <a
          routerLink="/"
          routerLinkActive="is-active"
          [routerLinkActiveOptions]="{ exact: true }"
          class="nav__link"
        >
          <app-icon name="list" [size]="18" />
          <span>خلاصه</span>
        </a>
        <a routerLink="/orders" routerLinkActive="is-active" class="nav__link">
          <app-icon name="coffee" [size]="18" />
          <span>سفارش‌ها</span>
        </a>
      </nav>

      <div class="foot">
        <button
          type="button"
          class="icon-btn"
          (click)="theme.toggle()"
          [attr.aria-label]="
            theme.theme() === 'dark' ? 'تغییر به پوستهٔ روشن' : 'تغییر به پوستهٔ تیره'
          "
        >
          <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" [size]="18" />
        </button>

        @if (auth.isSignedIn()) {
          <span class="who muted text-sm">{{ auth.displayName() }}</span>
          <button
            type="button"
            class="icon-btn icon-btn--danger"
            (click)="signOut()"
            aria-label="خروج از حساب"
          >
            <app-icon name="logout" [size]="18" />
          </button>
        }
      </div>
    </aside>
  `,
  styles: `
    .sidebar {
      display: flex;
      align-items: center;
      gap: var(--space-md);
      padding: var(--space-sm) var(--gutter);
      background: var(--c-surface);
      border-bottom: 1px solid var(--c-border);
      flex-wrap: wrap;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: var(--space-sm);
      text-decoration: none;
      color: var(--c-fg);
      font-family: var(--font-display);
      font-size: 1.0625rem;
      font-weight: 600;
      margin-inline-end: auto;
    }

    .brand__mark {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: var(--radius-full);
      background: var(--c-primary);
      color: var(--c-on-primary);
    }

    .nav {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      order: 3;
      width: 100%;
      overflow-x: auto;
    }

    .nav__link {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      min-height: 44px;
      padding: 0 var(--space-md);
      border-radius: var(--radius-md);
      color: var(--c-fg-muted);
      text-decoration: none;
      font-size: var(--fs-sm);
      font-weight: 500;
      white-space: nowrap;
      transition:
        background-color var(--dur-base) var(--ease-out),
        color var(--dur-base) var(--ease-out);

      &:hover {
        background: var(--c-surface-2);
        color: var(--c-fg);
      }

      &.is-active {
        background: var(--c-primary-tint);
        color: var(--c-primary);
        font-weight: 600;
      }
    }

    .foot {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
    }

    .who {
      display: none;
    }

    .icon-btn {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border: 1px solid var(--c-border);
      border-radius: var(--radius-md);
      background: var(--c-surface);
      color: var(--c-fg-muted);
      cursor: pointer;
      transition:
        color var(--dur-base) var(--ease-out),
        border-color var(--dur-base) var(--ease-out);

      &:hover {
        color: var(--c-fg);
        border-color: var(--c-border-strong);
      }
    }

    .icon-btn--danger:hover {
      color: var(--c-danger);
      border-color: var(--c-danger);
    }

    /* From 1024px the rail becomes a real sidebar, fixed to the inline start. */
    @media (min-width: 1024px) {
      .sidebar {
        position: fixed;
        inset-block: 0;
        inset-inline-start: 0;
        width: 248px;
        flex-direction: column;
        align-items: stretch;
        gap: var(--space-lg);
        padding: var(--space-lg) var(--space-md);
        border-bottom: 0;
        border-inline-start: 1px solid var(--c-border);
        overflow-y: auto;
      }

      .brand {
        margin-inline-end: 0;
      }

      .nav {
        order: 0;
        flex-direction: column;
        align-items: stretch;
        gap: var(--space-xs);
        overflow: visible;
        margin-block-end: auto;
      }

      .foot {
        justify-content: space-between;
      }

      .who {
        display: block;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  `,
})
export class Sidebar {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  protected signOut(): void {
    this.auth.signOut();
    void this.router.navigate(['/signin']);
  }
}
