import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import {
  PaymentSettings,
  UpdatePaymentSettingsRequest,
  formatCardNumber,
  formatDateTime,
} from '@romano/domain';
import { Icon, Spinner, ToastService } from '@romano/ui';

import { PaymentSettingsService } from '../../core/payment-settings.service';

/** Mirrors the API's DTO, so the form refuses what the server would refuse. */
const CARD_PATTERN = /^\d{16}$/;
const URL_PATTERN = /^https?:\/\/\S+$/;
const MERCHANT_PATTERN = /^[A-Za-z0-9._-]{4,128}$/;

/**
 * How Romano takes money.
 *
 * Both halves of this page used to need a developer: the card-to-card
 * destination was a constant compiled into two Angular bundles, and the gateway
 * credentials were environment variables read at boot. Changing either meant a
 * deploy. They are a database row now, and this is the form.
 *
 * **The merchant key is write-only.** The server never sends it — the field
 * starts empty however many times the page is loaded, and shows a masked hint of
 * what is installed beside it. Leaving it empty keeps the current key; that is
 * the only thing empty can mean, since the form was never given a key to send
 * back. Clearing one is deliberate, behind its own button.
 *
 * The gateway section is disclosed rather than always open: most visits here are
 * to change a card number, and a credential field is not something to scroll
 * past on the way.
 */
@Component({
  selector: 'app-payment-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Icon, Spinner],
  template: `
    <div class="container container--narrow page">
      <div class="head">
        <div>
          <h1 class="title">تنظیمات پرداخت</h1>
          <p class="muted text-sm">{{ subtitle() }}</p>
        </div>
        <button type="button" class="btn btn--secondary btn--sm" (click)="reload()">
          <app-icon name="refresh" [size]="16" />
          تازه‌سازی
        </button>
      </div>

      @if (loading()) {
        <div class="card stack" aria-busy="true">
          <div class="skeleton" style="height: 28px; width: 40%"></div>
          <div class="skeleton" style="height: 180px"></div>
        </div>
      } @else if (loadError(); as message) {
        <div class="alert alert--error" role="alert">
          <app-icon name="alert" [size]="18" />
          <span>{{ message }}</span>
        </div>
      } @else {
        @if (formError(); as message) {
          <div class="alert alert--error" role="alert">
            <app-icon name="alert" [size]="18" />
            <span>{{ message }}</span>
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <!-- Card to card ------------------------------------------------- -->
          <section class="card">
            <h2 class="section-title">
              <app-icon name="receipt" [size]="18" />
              کارت‌به‌کارت
            </h2>
            <p class="muted text-sm section-lead">
              همین شماره در صفحهٔ سفارش و صفحهٔ پرداخت به مشتری نشان داده می‌شود.
            </p>

            <label class="toggle">
              <input type="checkbox" formControlName="cardToCardEnabled" />
              <span>
                <span class="toggle__label">پرداخت کارت‌به‌کارت فعال باشد</span>
                <span class="toggle__hint">
                  مشتری مبلغ را واریز می‌کند و رسیدش را بارگذاری می‌کند.
                </span>
              </span>
            </label>

            <div class="field-grid field-grid--2">
              <div class="field">
                <label class="field__label" for="cardHolder">نام صاحب کارت</label>
                <input id="cardHolder" class="field__control" formControlName="cardHolder" />
                @if (invalid('cardHolder')) {
                  <p class="field__error" role="alert">
                    <app-icon name="alert" [size]="14" />
                    نام صاحب کارت را بنویسید (۱ تا ۸۰ نویسه).
                  </p>
                }
              </div>

              <div class="field">
                <label class="field__label" for="cardNumber">شمارهٔ کارت</label>
                <input
                  id="cardNumber"
                  class="field__control code"
                  dir="ltr"
                  inputmode="numeric"
                  autocomplete="off"
                  formControlName="cardNumber"
                />
                @if (invalid('cardNumber')) {
                  <p class="field__error" role="alert">
                    <app-icon name="alert" [size]="14" />
                    شمارهٔ کارت باید ۱۶ رقم و بدون فاصله یا خط تیره باشد.
                  </p>
                } @else {
                  <p class="field__hint code">{{ grouped() }}</p>
                }
              </div>
            </div>
          </section>

          <!-- Gateway ------------------------------------------------------ -->
          <section class="card">
            <h2 class="section-title">
              <app-icon name="credit-card" [size]="18" />
              درگاه پرداخت اینترنتی (زیبال)
            </h2>

            <p class="state" [class.state--ready]="settings()?.onlineReady">
              <app-icon [name]="settings()?.onlineReady ? 'check-circle' : 'alert'" [size]="16" />
              <span>{{ readiness() }}</span>
            </p>

            <label class="toggle">
              <input type="checkbox" formControlName="onlineEnabled" />
              <span>
                <span class="toggle__label">پرداخت اینترنتی فعال باشد</span>
                <span class="toggle__hint">
                  تا وقتی کلید درگاه و نشانی بازگشت پر نشده باشند، دکمهٔ پرداخت به مشتری نشان داده
                  نمی‌شود.
                </span>
              </span>
            </label>

            <div class="field">
              <label class="field__label" for="zibalMerchant">کلید درگاه (Merchant)</label>
              <input
                id="zibalMerchant"
                class="field__control code"
                dir="ltr"
                type="password"
                autocomplete="off"
                spellcheck="false"
                formControlName="zibalMerchant"
                [placeholder]="merchantPlaceholder()"
                [attr.aria-describedby]="'merchant-hint'"
              />
              @if (invalid('zibalMerchant')) {
                <p class="field__error" role="alert">
                  <app-icon name="alert" [size]="14" />
                  کلید درگاه را همان‌طور که زیبال داده وارد کنید — دست‌کم ۴ نویسه، بدون فاصله.
                </p>
              } @else {
                <p class="field__hint" id="merchant-hint">
                  @if (settings()?.zibalMerchantSet) {
                    کلید ثبت شده است. برای نگه‌داشتنش این کادر را خالی بگذارید — کلید فعلی هیچ‌وقت
                    خوانده نمی‌شود.
                  } @else {
                    کلید را از پنل زیبال بردارید. پس از ذخیره دیگر نمایش داده نمی‌شود.
                  }
                </p>
              }

              @if (settings()?.zibalMerchantSet) {
                <button
                  type="button"
                  class="btn btn--secondary btn--sm clear-key"
                  (click)="clearKey()"
                  [disabled]="saving()"
                >
                  <app-icon name="trash" [size]="16" />
                  حذف کلید ثبت‌شده
                </button>
              }
            </div>

            <div class="field">
              <label class="field__label" for="zibalCallbackUrl">نشانی بازگشت (Callback)</label>
              <input
                id="zibalCallbackUrl"
                class="field__control code"
                dir="ltr"
                formControlName="zibalCallbackUrl"
                placeholder="https://example.com/api/payments/callback"
              />
              @if (invalid('zibalCallbackUrl')) {
                <p class="field__error" role="alert">
                  <app-icon name="alert" [size]="14" />
                  نشانی بازگشت باید یک آدرس کامل با http یا https باشد.
                </p>
              } @else {
                <p class="field__hint">
                  زیبال مشتری را به این نشانی برمی‌گرداند — نشانی همین سرور به‌علاوهٔ
                  <span class="code">/api/payments/callback</span>
                </p>
              }
            </div>

            <div class="field-grid field-grid--2">
              <div class="field">
                <label class="field__label" for="webBaseUrl">نشانی سایت</label>
                <input
                  id="webBaseUrl"
                  class="field__control code"
                  dir="ltr"
                  formControlName="webBaseUrl"
                  placeholder="https://example.com"
                />
                @if (invalid('webBaseUrl')) {
                  <p class="field__error" role="alert">
                    <app-icon name="alert" [size]="14" />
                    نشانی سایت باید یک آدرس کامل با http یا https باشد.
                  </p>
                } @else {
                  <p class="field__hint">مشتری پس از پرداخت به صفحهٔ سفارش در این سایت می‌رود.</p>
                }
              </div>

              <div class="field">
                <label class="field__label" for="zibalBaseUrl">نشانی سرویس زیبال</label>
                <input
                  id="zibalBaseUrl"
                  class="field__control code"
                  dir="ltr"
                  formControlName="zibalBaseUrl"
                />
                @if (invalid('zibalBaseUrl')) {
                  <p class="field__error" role="alert">
                    <app-icon name="alert" [size]="14" />
                    نشانی درگاه باید یک آدرس کامل با http یا https باشد.
                  </p>
                } @else {
                  <p class="field__hint">جز در موارد خاص، همین مقدار پیش‌فرض درست است.</p>
                }
              </div>
            </div>
          </section>

          <div class="actions">
            <button type="submit" class="btn btn--primary" [disabled]="saving()">
              @if (saving()) {
                <app-spinner [size]="16" label="در حال ذخیره" />
              } @else {
                ذخیرهٔ تنظیمات
              }
            </button>
            @if (lastEdit(); as edit) {
              <p class="muted text-sm">{{ edit }}</p>
            }
          </div>
        </form>
      }
    </div>
  `,
  styles: `
    .head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-md);
      margin-bottom: var(--space-lg);
    }

    .title {
      font-family: var(--font-display);
      font-size: var(--fs-h1);
    }

    .card + .card,
    .card + .alert,
    .alert + form {
      margin-top: var(--space-md);
    }

    form .card + .card {
      margin-top: var(--space-md);
    }

    .section-title {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      font-size: var(--fs-h3);
      font-weight: 600;
      margin-bottom: var(--space-xs);
    }

    .section-lead {
      margin-bottom: var(--space-md);
    }

    .state {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      margin-bottom: var(--space-md);
      font-size: var(--fs-sm);
      /* Not carried by colour: the icon and the sentence both change with it. */
      color: var(--c-warning);
    }

    .state--ready {
      color: var(--c-success);
    }

    .toggle {
      display: flex;
      align-items: flex-start;
      gap: var(--space-sm);
      min-height: 44px;
      margin-bottom: var(--space-md);
      cursor: pointer;

      input {
        flex: none;
        width: 20px;
        height: 20px;
        margin-top: 2px;
        accent-color: var(--c-primary);
        cursor: pointer;
      }

      &:has(input:focus-visible) {
        outline: 2px solid var(--c-ring);
        outline-offset: 4px;
        border-radius: var(--radius-sm);
      }
    }

    .toggle__label {
      display: block;
      font-weight: 600;
    }

    .toggle__hint {
      display: block;
      font-size: var(--fs-sm);
      color: var(--c-fg-muted);
    }

    .clear-key {
      margin-top: var(--space-sm);
    }

    .actions {
      display: flex;
      align-items: center;
      gap: var(--space-md);
      margin-top: var(--space-lg);
      flex-wrap: wrap;
    }
  `,
})
export class PaymentSettingsPage {
  private readonly api = inject(PaymentSettingsService);
  private readonly toasts = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly settings = signal<PaymentSettings | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    cardToCardEnabled: [true],
    cardHolder: ['', [Validators.required, Validators.maxLength(80)]],
    cardNumber: ['', [Validators.required, Validators.pattern(CARD_PATTERN)]],
    onlineEnabled: [false],
    // No `required`: empty means "keep the key you already have".
    zibalMerchant: ['', [Validators.pattern(MERCHANT_PATTERN)]],
    zibalCallbackUrl: ['', [Validators.pattern(URL_PATTERN)]],
    webBaseUrl: ['', [Validators.pattern(URL_PATTERN)]],
    zibalBaseUrl: ['', [Validators.required, Validators.pattern(URL_PATTERN)]],
  });

  protected readonly grouped = computed(() => {
    const digits = this.form.controls.cardNumber.value;
    return CARD_PATTERN.test(digits) ? formatCardNumber(digits) : '';
  });

  protected readonly subtitle = computed(() => {
    const settings = this.settings();
    if (!settings) return 'کارت مقصد و درگاه پرداخت';
    return settings.onlineReady
      ? 'کارت‌به‌کارت و پرداخت اینترنتی، هر دو فعال'
      : 'کارت مقصد و درگاه پرداخت';
  });

  protected readonly readiness = computed(() => {
    const settings = this.settings();
    if (!settings) return '';
    if (settings.onlineReady) return 'درگاه فعال است و به مشتری نشان داده می‌شود.';
    if (!settings.zibalMerchantSet) return 'کلید درگاه هنوز وارد نشده است.';
    if (!settings.zibalCallbackUrl) return 'نشانی بازگشت هنوز وارد نشده است.';
    return 'درگاه تنظیم شده اما خاموش است.';
  });

  /** Shows which key is installed without being one. */
  protected readonly merchantPlaceholder = computed(() => {
    const hint = this.settings()?.zibalMerchantHint;
    return hint ? `${hint} — برای نگه‌داشتن، خالی بگذارید` : 'کلید درگاه را وارد کنید';
  });

  protected readonly lastEdit = computed(() => {
    const settings = this.settings();
    if (!settings) return null;
    const who = settings.updatedByUsername;
    const when = formatDateTime(settings.updatedAt);
    return who ? `آخرین تغییر: ${when} توسط ${who}` : `آخرین تغییر: ${when}`;
  });

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);

    try {
      this.apply(await this.api.read());
    } catch (error) {
      this.loadError.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  private apply(settings: PaymentSettings): void {
    this.settings.set(settings);
    this.form.reset({
      cardToCardEnabled: settings.cardToCardEnabled,
      cardHolder: settings.cardHolder,
      cardNumber: settings.cardNumber,
      onlineEnabled: settings.onlineEnabled,
      // Always blank. The server does not send the key and this field must not
      // pretend otherwise — a masked value sitting here would be submitted back
      // as if it were real.
      zibalMerchant: '',
      zibalCallbackUrl: settings.zibalCallbackUrl ?? '',
      webBaseUrl: settings.webBaseUrl ?? '',
      zibalBaseUrl: settings.zibalBaseUrl,
    });
  }

  protected invalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    this.formError.set(null);

    if (this.form.invalid) {
      this.formError.set('چند مورد را باید اصلاح کنید.');
      return;
    }

    const value = this.form.getRawValue();
    const patch: UpdatePaymentSettingsRequest = {
      cardToCardEnabled: value.cardToCardEnabled,
      cardHolder: value.cardHolder.trim(),
      cardNumber: value.cardNumber.trim(),
      onlineEnabled: value.onlineEnabled,
      zibalCallbackUrl: value.zibalCallbackUrl.trim(),
      webBaseUrl: value.webBaseUrl.trim(),
      zibalBaseUrl: value.zibalBaseUrl.trim(),
    };

    // Omitted unless something was typed — absence is what keeps the current key.
    const merchant = value.zibalMerchant.trim();
    if (merchant) patch.zibalMerchant = merchant;

    await this.save(patch, 'تنظیمات پرداخت ذخیره شد.');
  }

  /**
   * Removing the installed key.
   *
   * Its own action rather than "clear the field and save", because an empty
   * field means the opposite everywhere else on this page.
   */
  protected async clearKey(): Promise<void> {
    const confirmed = confirm(
      'کلید درگاه حذف شود؟ پرداخت اینترنتی تا وارد کردن کلید تازه کار نمی‌کند.',
    );
    if (!confirmed) return;

    await this.save({ zibalMerchant: '', onlineEnabled: false }, 'کلید درگاه حذف شد.');
  }

  private async save(patch: UpdatePaymentSettingsRequest, success: string): Promise<void> {
    this.saving.set(true);
    this.formError.set(null);

    try {
      this.apply(await this.api.update(patch));
      this.toasts.success(success);
    } catch (error) {
      this.formError.set((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
