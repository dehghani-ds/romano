import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { CatalogService } from '../../core/catalog.service';
import { SeatOption } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { Spinner } from '../../shared/spinner';

/** Local mobile format, e.g. 09121234567. */
const MOBILE_PATTERN = /^09\d{9}$/;
const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return password && confirm && password !== confirm ? { mismatch: true } : null;
}

@Component({
  selector: 'app-sign-up',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, Icon, Spinner],
  template: `
    <div class="container container--narrow page">
      <div class="card">
        <h1 class="title">ساخت حساب کاربری</h1>
        <p class="muted text-sm intro">
          نام، نام کاربری و محل نشستن شما را می‌خواهیم — تا بدانیم قهوه را کجا برسانیم.
        </p>

        @if (error(); as message) {
          <div class="alert alert--error" role="alert">
            <app-icon name="alert" [size]="18" />
            <span>{{ message }}</span>
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="stack" novalidate>
          <fieldset class="group">
            <legend class="eyebrow">نام شما</legend>
            <div class="field-grid field-grid--2">
              <div class="field">
                <label class="field__label" for="firstName">
                  نام<span class="field__required" aria-hidden="true">*</span>
                </label>
                <input
                  id="firstName"
                  class="field__control"
                  formControlName="firstName"
                  autocomplete="given-name"
                  [attr.aria-invalid]="invalid('firstName') ? 'true' : null"
                />
                @if (invalid('firstName')) {
                  <p class="field__error" role="alert">
                    <app-icon name="alert" [size]="14" />
                    نام خود را وارد کنید.
                  </p>
                }
              </div>

              <div class="field">
                <label class="field__label" for="lastName">
                  نام خانوادگی<span class="field__required" aria-hidden="true">*</span>
                </label>
                <input
                  id="lastName"
                  class="field__control"
                  formControlName="lastName"
                  autocomplete="family-name"
                  [attr.aria-invalid]="invalid('lastName') ? 'true' : null"
                />
                @if (invalid('lastName')) {
                  <p class="field__error" role="alert">
                    <app-icon name="alert" [size]="14" />
                    نام خانوادگی خود را وارد کنید.
                  </p>
                }
              </div>
            </div>
          </fieldset>

          <fieldset class="group">
            <legend class="eyebrow">راه ارتباطی</legend>

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
                formControlName="mobile"
                autocomplete="tel"
                placeholder="09121234567"
                [attr.aria-invalid]="invalid('mobile') ? 'true' : null"
              />
              <p class="field__hint">فقط اگر مشکلی در سفارش پیش بیاید با شما تماس می‌گیریم.</p>
              @if (invalid('mobile')) {
                <p class="field__error" role="alert">
                  <app-icon name="alert" [size]="14" />
                  شمارهٔ موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود، مثلاً ۰۹۱۲۱۲۳۴۵۶۷.
                </p>
              }
            </div>

            <div class="field">
              <label class="field__label" for="seatId">
                میز شما<span class="field__required" aria-hidden="true">*</span>
              </label>
              <select
                id="seatId"
                class="field__control"
                formControlName="seatId"
                [attr.aria-invalid]="invalid('seatId') ? 'true' : null"
              >
                <option value="">میز خود را انتخاب کنید…</option>
                @for (seat of seats(); track seat.id) {
                  <option [value]="seat.id">{{ seat.code }} — {{ seat.label }}</option>
                }
              </select>
              @if (selectedSeat(); as seat) {
                <p class="field__hint">
                  نزدیک‌ترین یخچال:
                  {{ seat.refrigerators?.label ?? 'هنوز مشخص نشده' }}
                  @if (seat.refrigerators?.description; as description) {
                    — {{ description }}
                  }
                </p>
              } @else {
                <p class="field__hint">
                  محل تحویل قهوه از روی همین انتخاب مشخص می‌شود. بعداً هم می‌توانید تغییرش دهید.
                </p>
              }
              @if (invalid('seatId')) {
                <p class="field__error" role="alert">
                  <app-icon name="alert" [size]="14" />
                  میزی را که پشت آن می‌نشینید انتخاب کنید.
                </p>
              }
            </div>
          </fieldset>

          <fieldset class="group">
            <legend class="eyebrow">اطلاعات ورود</legend>

            <div class="field">
              <label class="field__label" for="username">
                نام کاربری<span class="field__required" aria-hidden="true">*</span>
              </label>
              <input
                id="username"
                class="field__control"
                dir="ltr"
                formControlName="username"
                autocomplete="username"
                autocapitalize="none"
                spellcheck="false"
                [attr.aria-invalid]="invalid('username') ? 'true' : null"
              />
              <p class="field__hint">
                ۳ تا ۳۰ نویسه: حروف کوچک انگلیسی، عدد و زیرخط.
              </p>
              @if (invalid('username')) {
                <p class="field__error" role="alert">
                  <app-icon name="alert" [size]="14" />
                  ۳ تا ۳۰ نویسه از حروف کوچک انگلیسی، عدد یا زیرخط بنویسید — بدون فاصله.
                </p>
              }
            </div>

            <div class="field">
              <label class="field__label" for="password">
                رمز عبور<span class="field__required" aria-hidden="true">*</span>
              </label>
              <div class="password">
                <input
                  id="password"
                  class="field__control"
                  [type]="showPassword() ? 'text' : 'password'"
                  formControlName="password"
                  autocomplete="new-password"
                  [attr.aria-invalid]="invalid('password') ? 'true' : null"
                />
                <button
                  type="button"
                  class="password__toggle"
                  (click)="showPassword.set(!showPassword())"
                  [attr.aria-label]="showPassword() ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'"
                >
                  <app-icon [name]="showPassword() ? 'eye-off' : 'eye'" [size]="18" />
                </button>
              </div>
              <p class="field__hint">دست‌کم ۸ نویسه.</p>
              @if (invalid('password')) {
                <p class="field__error" role="alert">
                  <app-icon name="alert" [size]="14" />
                  رمز عبور باید دست‌کم ۸ نویسه باشد.
                </p>
              }
            </div>

            <div class="field">
              <label class="field__label" for="confirmPassword">
                تکرار رمز عبور<span class="field__required" aria-hidden="true">*</span>
              </label>
              <input
                id="confirmPassword"
                class="field__control"
                type="password"
                formControlName="confirmPassword"
                autocomplete="new-password"
                [attr.aria-invalid]="mismatch() ? 'true' : null"
              />
              @if (mismatch()) {
                <p class="field__error" role="alert">
                  <app-icon name="alert" [size]="14" />
                  دو رمز عبور یکسان نیستند.
                </p>
              }
            </div>
          </fieldset>

          <button type="submit" class="btn btn--primary btn--block btn--lg" [disabled]="busy()">
            @if (busy()) {
              <app-spinner [size]="18" label="در حال ساخت حساب" />
            } @else {
              ساخت حساب
            }
          </button>
        </form>

        <p class="text-sm muted footer">
          قبلاً ثبت‌نام کرده‌اید؟ <a routerLink="/signin">وارد شوید</a>
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

    .group {
      border: 0;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-md);
    }

    .group + .group {
      margin-top: var(--space-lg);
      padding-top: var(--space-lg);
      border-top: 1px solid var(--c-border);
    }

    legend {
      padding: 0;
      margin-bottom: var(--space-sm);
    }

    .password {
      position: relative;
    }

    .password__toggle {
      position: absolute;
      inset-inline-end: 4px;
      top: 50%;
      transform: translateY(-50%);
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      background: none;
      border: 0;
      border-radius: var(--radius-md);
      color: var(--c-fg-muted);
      cursor: pointer;

      &:hover {
        color: var(--c-fg);
      }
    }

    .footer {
      margin-top: var(--space-lg);
      text-align: center;
    }
  `,
})
export class SignUp {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly seats = signal<SeatOption[]>([]);

  protected readonly form = this.fb.nonNullable.group(
    {
      firstName: ['', [Validators.required, Validators.maxLength(60)]],
      lastName: ['', [Validators.required, Validators.maxLength(60)]],
      mobile: ['', [Validators.required, Validators.pattern(MOBILE_PATTERN)]],
      seatId: ['', [Validators.required]],
      username: ['', [Validators.required, Validators.pattern(USERNAME_PATTERN)]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );

  private readonly seatId = signal('');

  protected readonly selectedSeat = computed(() =>
    this.seats().find((s) => s.id === this.seatId()),
  );

  constructor() {
    void this.loadSeats();
    this.form.controls.seatId.valueChanges.subscribe((value) => this.seatId.set(value));
  }

  private async loadSeats(): Promise<void> {
    try {
      this.seats.set(await this.catalog.seats());
    } catch (err) {
      this.error.set((err as Error).message);
    }
  }

  protected invalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  protected mismatch(): boolean {
    return (
      this.form.hasError('mismatch') && this.form.controls.confirmPassword.touched
    );
  }

  protected async submit(): Promise<void> {
    this.error.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstInvalid();
      return;
    }

    this.busy.set(true);
    const value = this.form.getRawValue();

    try {
      await this.auth.signUp({
        username: value.username,
        password: value.password,
        firstName: value.firstName,
        lastName: value.lastName,
        mobile: value.mobile,
        seatId: value.seatId,
      });

      this.toasts.success('حساب شما ساخته شد. به رومانو خوش آمدید.');
      await this.router.navigate(['/order']);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  private focusFirstInvalid(): void {
    const name = Object.keys(this.form.controls).find((key) => this.form.get(key)?.invalid);
    if (name) document.getElementById(name)?.focus();
  }
}
