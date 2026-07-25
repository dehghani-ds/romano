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
        <p class="eyebrow">یک قهوه. امروز سفارش، فردا آماده.</p>
        <h1 class="display">یک رومانوی درست و حسابی،<br />منتظر شماست.</h1>
        <p class="lede muted">
          فنجان‌هایتان را پیش از رفتن سفارش بدهید. فردا صبح سر میزتان هستند — یا در نزدیک‌ترین
          یخچال به شما.
        </p>

        <a
          [routerLink]="auth.isSignedIn() ? '/order' : '/signup'"
          class="btn btn--primary btn--lg cta"
        >
          {{ auth.isSignedIn() ? 'سفارش برای فردا' : 'ساخت حساب کاربری' }}
        </a>

        @if (!auth.isSignedIn()) {
          <p class="text-sm muted">
            قبلاً ثبت‌نام کرده‌اید؟ <a routerLink="/signin">وارد شوید</a>
          </p>
        }
      </section>

      <ul class="benefits">
        <li class="benefit">
          <span class="benefit__icon"><app-icon name="coffee" [size]="20" /></span>
          <div>
            <h2 class="benefit__title">تعداد فنجان را انتخاب کنید</h2>
            <p class="muted text-sm">از یک تا بیست رومانو، صبح تازه دم می‌شود.</p>
          </div>
        </li>
        <li class="benefit">
          <span class="benefit__icon"><app-icon name="seat" [size]="20" /></span>
          <div>
            <h2 class="benefit__title">همان‌جا که هستید تحویل بگیرید</h2>
            <p class="muted text-sm">سر میز خودتان، یا در نزدیک‌ترین یخچال به آن.</p>
          </div>
        </li>
        <li class="benefit">
          <span class="benefit__icon"><app-icon name="receipt" [size]="20" /></span>
          <div>
            <h2 class="benefit__title">پرداخت با رسید</h2>
            <p class="muted text-sm">
              رسید واریز را بارگذاری کنید — مدیر آن را بررسی و سفارش شما را شروع می‌کند.
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
