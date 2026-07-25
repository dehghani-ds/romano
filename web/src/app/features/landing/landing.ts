import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Icon } from '../../shared/icon';

/**
 * Minimal single column, one primary CTA — the pattern the design system
 * selected for this product.
 */
@Component({
  selector: 'app-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  template: `
    <div class="container container--narrow page">
      <section class="hero">
        <p class="eyebrow">One coffee. Ordered today, ready tomorrow.</p>
        <h1 class="display">A proper Romano,<br />waiting for you.</h1>
        <p class="lede muted">
          Order your cups before you leave. Tomorrow morning they are at your seat — or in the
          fridge nearest to it.
        </p>

        <a
          [routerLink]="auth.isSignedIn() ? '/order' : '/signup'"
          class="btn btn--primary btn--lg cta"
        >
          {{ auth.isSignedIn() ? 'Order for tomorrow' : 'Create your account' }}
        </a>

        @if (!auth.isSignedIn()) {
          <p class="text-sm muted">
            Already have an account? <a routerLink="/signin">Sign in</a>
          </p>
        }
      </section>

      <ul class="benefits">
        <li class="benefit">
          <span class="benefit__icon"><app-icon name="coffee" [size]="20" /></span>
          <div>
            <h2 class="benefit__title">Choose your cups</h2>
            <p class="muted text-sm">One to twenty Romanos, made fresh in the morning.</p>
          </div>
        </li>
        <li class="benefit">
          <span class="benefit__icon"><app-icon name="seat" [size]="20" /></span>
          <div>
            <h2 class="benefit__title">Delivered where you are</h2>
            <p class="muted text-sm">To your seat, or to the refrigerator closest to it.</p>
          </div>
        </li>
        <li class="benefit">
          <span class="benefit__icon"><app-icon name="receipt" [size]="20" /></span>
          <div>
            <h2 class="benefit__title">Pay by receipt</h2>
            <p class="muted text-sm">
              Upload your transfer receipt — an admin checks it and starts your order.
            </p>
          </div>
        </li>
      </ul>
    </div>
  `,
  styles: `
    .hero {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: var(--space-md);
      padding-block: var(--space-2xl) var(--space-3xl);
    }

    .lede {
      max-width: 46ch;
      font-size: 1.0625rem;
    }

    .cta {
      margin-top: var(--space-sm);
      min-width: 240px;
    }

    .benefits {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-md);
    }

    .benefit {
      display: flex;
      align-items: flex-start;
      gap: var(--space-md);
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
      padding: var(--space-lg);
    }

    .benefit__icon {
      display: grid;
      place-items: center;
      flex: none;
      width: 44px;
      height: 44px;
      border-radius: var(--radius-full);
      background: var(--c-primary-tint);
      color: var(--c-primary);
    }

    .benefit__title {
      font-size: var(--fs-body);
      font-weight: 600;
      margin-bottom: 2px;
    }
  `,
})
export class Landing {
  protected readonly auth = inject(AuthService);
}
