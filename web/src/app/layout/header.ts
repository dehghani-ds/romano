import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ThemeService } from '../core/theme.service';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, Icon],
  template: `
    <header class="header">
      <div class="container header__inner">
        <a class="brand" routerLink="/" aria-label="رومانو — صفحهٔ اصلی">
          <span class="brand__mark"><app-icon name="coffee" [size]="20" /></span>
          <span class="brand__name">رومانو</span>
        </a>

        @if (auth.isSignedIn()) {
          <nav class="nav" aria-label="منوی اصلی">
            <a routerLink="/order" routerLinkActive="is-active" class="nav__link">
              <app-icon name="coffee" [size]="18" />
              <span>سفارش</span>
            </a>
            <a routerLink="/orders" routerLinkActive="is-active" class="nav__link">
              <app-icon name="list" [size]="18" />
              <span>سفارش‌های من</span>
            </a>
            @if (auth.isAdmin()) {
              <a routerLink="/admin" routerLinkActive="is-active" class="nav__link nav__link--admin">
                <app-icon name="shield" [size]="18" />
                <span>مدیریت</span>
              </a>
            }
          </nav>
        }

        <div class="actions">
          <button
            type="button"
            class="icon-btn"
            (click)="theme.toggle()"
            [attr.aria-label]="theme.theme() === 'dark' ? 'تغییر به پوستهٔ روشن' : 'تغییر به پوستهٔ تیره'"
          >
            <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" [size]="18" />
          </button>

          @if (auth.isSignedIn()) {
            <a routerLink="/profile" routerLinkActive="is-active" class="icon-btn" aria-label="پروفایل شما">
              <app-icon name="user" [size]="18" />
            </a>
            <button
              type="button"
              class="icon-btn icon-btn--danger"
              (click)="signOut()"
              [disabled]="signingOut()"
              aria-label="خروج از حساب"
            >
              <app-icon name="logout" [size]="18" />
            </button>
          } @else {
            <a routerLink="/signin" class="btn btn--ghost btn--sm">ورود</a>
            <a routerLink="/signup" class="btn btn--primary btn--sm">ثبت‌نام</a>
          }
        </div>
      </div>
    </header>
  `,
  styles: `
    .header {
      position: sticky;
      top: 0;
      z-index: var(--z-header);
      background: color-mix(in srgb, var(--c-bg) 88%, transparent);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--c-border);
    }

    .header__inner {
      display: flex;
      align-items: center;
      gap: var(--space-md);
      min-height: 64px;
      flex-wrap: wrap;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: var(--space-sm);
      text-decoration: none;
      color: var(--c-fg);
      font-family: var(--font-display);
      font-size: 1.25rem;
      font-weight: 600;
      margin-inline-end: auto;
    }

    .brand__mark {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
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
      padding-bottom: var(--space-sm);
    }

    @media (min-width: 768px) {
      .nav {
        order: 0;
        width: auto;
        overflow: visible;
        padding-bottom: 0;
      }
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
      transition: background-color var(--dur-base) var(--ease-out), color var(--dur-base) var(--ease-out);

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

    /* The admin area is separated from the customer nav. */
    .nav__link--admin {
      margin-inline-start: var(--space-sm);
      border-inline-start: 1px solid var(--c-border);
      border-start-start-radius: 0;
      border-end-start-radius: 0;
      padding-inline-start: var(--space-md);
    }

    .actions {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
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
      text-decoration: none;
      transition: color var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out);

      &:hover:not(:disabled) {
        color: var(--c-fg);
        border-color: var(--c-border-strong);
      }

      &.is-active {
        color: var(--c-primary);
        border-color: var(--c-primary);
      }

      &:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
    }

    /* Sign out is spatially separated from the rest — it is destructive. */
    .icon-btn--danger {
      margin-inline-start: var(--space-xs);

      &:hover:not(:disabled) {
        color: var(--c-danger);
        border-color: var(--c-danger);
      }
    }
  `,
})
export class Header {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  protected readonly signingOut = signal(false);

  protected async signOut(): Promise<void> {
    this.signingOut.set(true);
    try {
      await this.auth.signOut();
      await this.router.navigate(['/signin']);
    } finally {
      this.signingOut.set(false);
    }
  }
}
