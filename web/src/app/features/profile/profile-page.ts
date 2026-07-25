import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { CatalogService } from '../../core/catalog.service';
import { SeatOption } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { Spinner } from '../../shared/spinner';

const MOBILE_PATTERN = /^09\d{9}$/;

@Component({
  selector: 'app-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Icon, Spinner],
  template: `
    <div class="container container--narrow page">
      <h1 class="title">پروفایل شما</h1>

      <section class="card identity">
        <span class="identity__avatar"><app-icon name="user" [size]="22" /></span>
        <div>
          <p class="identity__name">{{ auth.displayName() }}</p>
          <p class="muted text-sm">&#64;{{ auth.profile()?.username }}</p>
        </div>
        @if (auth.isAdmin()) {
          <span class="badge">
            <app-icon name="shield" [size]="14" />
            مدیر
          </span>
        }
      </section>

      @if (error(); as message) {
        <div class="alert alert--error" role="alert">
          <app-icon name="alert" [size]="18" />
          <span>{{ message }}</span>
        </div>
      }

      <form [formGroup]="form" (ngSubmit)="save()" class="card form" novalidate>
        <h2 class="section-title">مشخصات</h2>

        <div class="field-grid field-grid--2">
          <div class="field">
            <label class="field__label" for="firstName">نام</label>
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
            <label class="field__label" for="lastName">نام خانوادگی</label>
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

        <div class="field">
          <label class="field__label" for="mobile">شمارهٔ موبایل</label>
          <input
            id="mobile"
            class="field__control"
            type="tel"
            dir="ltr"
            inputmode="numeric"
            formControlName="mobile"
            autocomplete="tel"
            [attr.aria-invalid]="invalid('mobile') ? 'true' : null"
          />
          @if (invalid('mobile')) {
            <p class="field__error" role="alert">
              <app-icon name="alert" [size]="14" />
              شمارهٔ موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود، مثلاً ۰۹۱۲۱۲۳۴۵۶۷.
            </p>
          }
        </div>

        <div class="field">
          <label class="field__label" for="seatId">میز شما</label>
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
              نزدیک‌ترین یخچال: {{ seat.refrigerators?.label ?? 'هنوز مشخص نشده' }}
              @if (seat.refrigerators?.description; as description) {
                — {{ description }}
              }
            </p>
          }
          @if (invalid('seatId')) {
            <p class="field__error" role="alert">
              <app-icon name="alert" [size]="14" />
              میزی را که پشت آن می‌نشینید انتخاب کنید.
            </p>
          }
        </div>

        <button type="submit" class="btn btn--primary" [disabled]="saving() || form.pristine">
          @if (saving()) {
            <app-spinner [size]="16" label="در حال ذخیره" />
          } @else {
            ذخیرهٔ تغییرات
          }
        </button>
      </form>

      <form [formGroup]="passwordForm" (ngSubmit)="changePassword()" class="card form" novalidate>
        <h2 class="section-title">تغییر رمز عبور</h2>

        <div class="field">
          <label class="field__label" for="newPassword">رمز عبور جدید</label>
          <input
            id="newPassword"
            class="field__control"
            type="password"
            formControlName="newPassword"
            autocomplete="new-password"
          />
          <p class="field__hint">دست‌کم ۸ نویسه.</p>
          @if (passwordForm.controls.newPassword.touched && passwordForm.controls.newPassword.invalid) {
            <p class="field__error" role="alert">
              <app-icon name="alert" [size]="14" />
              رمز عبور باید دست‌کم ۸ نویسه باشد.
            </p>
          }
        </div>

        <button
          type="submit"
          class="btn btn--secondary"
          [disabled]="changingPassword() || passwordForm.invalid"
        >
          @if (changingPassword()) {
            <app-spinner [size]="16" label="در حال به‌روزرسانی رمز" />
          } @else {
            به‌روزرسانی رمز عبور
          }
        </button>
      </form>
    </div>
  `,
  styles: `
    .title {
      font-family: var(--font-display);
      font-size: var(--fs-h1);
      margin-bottom: var(--space-lg);
    }

    .identity {
      display: flex;
      align-items: center;
      gap: var(--space-md);
      margin-bottom: var(--space-md);
    }

    .identity__avatar {
      display: grid;
      place-items: center;
      flex: none;
      width: 48px;
      height: 48px;
      border-radius: var(--radius-full);
      background: var(--c-primary);
      color: var(--c-on-primary);
    }

    .identity__name {
      font-weight: 600;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      margin-inline-start: auto;
      padding: 4px 10px;
      border-radius: var(--radius-full);
      background: var(--c-primary-tint);
      color: var(--c-primary);
      font-size: var(--fs-xs);
      font-weight: 600;
    }

    .form {
      display: flex;
      flex-direction: column;
      gap: var(--space-md);
    }

    .form + .form,
    .alert + .form {
      margin-top: var(--space-md);
    }

    .section-title {
      font-size: var(--fs-body);
      font-weight: 600;
    }

    .form .btn {
      align-self: flex-start;
    }
  `,
})
export class ProfilePage {
  protected readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogService);
  private readonly fb = inject(FormBuilder);
  private readonly toasts = inject(ToastService);

  protected readonly seats = signal<SeatOption[]>([]);
  protected readonly saving = signal(false);
  protected readonly changingPassword = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly seatId = signal('');

  protected readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(60)]],
    lastName: ['', [Validators.required, Validators.maxLength(60)]],
    mobile: ['', [Validators.required, Validators.pattern(MOBILE_PATTERN)]],
    seatId: ['', [Validators.required]],
  });

  protected readonly passwordForm = this.fb.nonNullable.group({
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected readonly selectedSeat = computed(() =>
    this.seats().find((s) => s.id === this.seatId()),
  );

  constructor() {
    void this.load();
    this.form.controls.seatId.valueChanges.subscribe((value) => this.seatId.set(value));
  }

  private async load(): Promise<void> {
    try {
      this.seats.set(await this.catalog.seats());

      const profile = this.auth.profile() ?? (await this.auth.loadProfile());
      if (profile) {
        this.form.setValue({
          firstName: profile.first_name,
          lastName: profile.last_name,
          mobile: profile.mobile,
          seatId: profile.seat_id ?? '',
        });
        this.form.markAsPristine();
        this.seatId.set(profile.seat_id ?? '');
      }
    } catch (err) {
      this.error.set((err as Error).message);
    }
  }

  protected invalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  protected async save(): Promise<void> {
    this.error.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const value = this.form.getRawValue();

    try {
      await this.auth.updateProfile({
        first_name: value.firstName,
        last_name: value.lastName,
        mobile: value.mobile,
        seat_id: value.seatId,
      });
      this.form.markAsPristine();
      this.toasts.success('پروفایل به‌روزرسانی شد.');
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  protected async changePassword(): Promise<void> {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.changingPassword.set(true);
    try {
      await this.auth.changePassword(this.passwordForm.getRawValue().newPassword);
      this.passwordForm.reset();
      this.toasts.success('رمز عبور به‌روزرسانی شد.');
    } catch (err) {
      this.toasts.error((err as Error).message);
    } finally {
      this.changingPassword.set(false);
    }
  }
}
