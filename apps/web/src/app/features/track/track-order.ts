import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { Icon, Spinner } from '@romano/ui';

import { OrdersService } from '../../core/orders.service';

const MOBILE_PATTERN = /^09\d{9}$/;

/**
 * Finding an order again without an account.
 *
 * A guest's token normally lives in this browser, but browsers get cleared and
 * people switch devices. The order number plus the mobile it was placed with is
 * the way back in — and on success the token is stored again, so the order
 * behaves like any other from then on.
 */
@Component({
  selector: 'app-track-order',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, Icon, Spinner],
  template: `
    <div class="container container--narrow page">
      <div class="card">
        <h1 class="title">پیگیری سفارش</h1>
        <p class="muted text-sm intro">
          شمارهٔ سفارش و شماره‌ای که با آن سفارش داده‌اید را بنویسید.
        </p>

        @if (error(); as message) {
          <div class="alert alert--error" role="alert">
            <app-icon name="alert" [size]="18" />
            <span>{{ message }}</span>
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="stack" novalidate>
          <div class="field">
            <label class="field__label" for="orderNumber">
              شمارهٔ سفارش<span class="field__required" aria-hidden="true">*</span>
            </label>
            <input
              id="orderNumber"
              class="field__control code"
              dir="ltr"
              formControlName="orderNumber"
              placeholder="RM-260726-0001"
              autocapitalize="characters"
              spellcheck="false"
              [attr.aria-invalid]="invalid('orderNumber') ? 'true' : null"
            />
            <p class="field__hint">همان کدی که پس از ثبت سفارش به شما نشان دادیم.</p>
            @if (invalid('orderNumber')) {
              <p class="field__error" role="alert">
                <app-icon name="alert" [size]="14" />
                شمارهٔ سفارش را بنویسید.
              </p>
            }
          </div>

          <div class="field">
            <label class="field__label" for="mobile">
              شمارهٔ موبایل<span class="field__required" aria-hidden="true">*</span>
            </label>
            <input
              id="mobile"
              class="field__control"
              type="tel"
              dir="ltr"
              inputmode="numeric"
              autocomplete="tel"
              formControlName="mobile"
              placeholder="09121234567"
              [attr.aria-invalid]="invalid('mobile') ? 'true' : null"
            />
            @if (invalid('mobile')) {
              <p class="field__error" role="alert">
                <app-icon name="alert" [size]="14" />
                شمارهٔ موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود.
              </p>
            }
          </div>

          <button type="submit" class="btn btn--primary btn--block btn--lg" [disabled]="busy()">
            @if (busy()) {
              <app-spinner [size]="18" label="در حال جست‌وجو" />
            } @else {
              پیدا کردن سفارش
            }
          </button>
        </form>

        <p class="text-sm muted footer">
          حساب دارید؟ <a routerLink="/signin">وارد شوید</a> تا همهٔ سفارش‌هایتان را یک‌جا ببینید.
        </p>
      </div>
    </div>
  `,
  styles: `
    .title {
      font-family: var(--font-display);
      font-size: var(--fs-h1);
    }

    .intro {
      margin-top: var(--space-xs);
      margin-bottom: var(--space-lg);
    }

    .alert {
      margin-bottom: var(--space-md);
    }

    .footer {
      margin-top: var(--space-lg);
      text-align: center;
    }
  `,
})
export class TrackOrder {
  private readonly fb = inject(FormBuilder);
  private readonly orders = inject(OrdersService);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    orderNumber: ['', [Validators.required]],
    mobile: ['', [Validators.required, Validators.pattern(MOBILE_PATTERN)]],
  });

  protected invalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  protected async submit(): Promise<void> {
    this.error.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const name = Object.keys(this.form.controls).find((key) => this.form.get(key)?.invalid);
      if (name) document.getElementById(name)?.focus();
      return;
    }

    this.busy.set(true);
    const { orderNumber, mobile } = this.form.getRawValue();

    try {
      const order = await this.orders.track(orderNumber.trim(), mobile.trim());
      await this.router.navigate(['/orders', order.id]);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
