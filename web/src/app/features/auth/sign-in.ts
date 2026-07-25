import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Icon } from '../../shared/icon';
import { Spinner } from '../../shared/spinner';

@Component({
  selector: 'app-sign-in',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, Icon, Spinner],
  template: `
    <div class="container container--narrow page">
      <div class="card">
        <h1 class="title">خوش آمدید</h1>
        <p class="muted text-sm intro">با همان نام کاربری که هنگام ثبت‌نام انتخاب کردید وارد شوید.</p>

        @if (error(); as message) {
          <div class="alert alert--error" role="alert">
            <app-icon name="alert" [size]="18" />
            <span>{{ message }}</span>
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="stack" novalidate>
          <div class="field">
            <label class="field__label" for="username">نام کاربری</label>
            <input
              id="username"
              class="field__control"
              dir="ltr"
              formControlName="username"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              [attr.aria-invalid]="showError('username') ? 'true' : null"
              [attr.aria-describedby]="showError('username') ? 'username-error' : null"
            />
            @if (showError('username')) {
              <p class="field__error" id="username-error" role="alert">
                <app-icon name="alert" [size]="14" />
                نام کاربری خود را وارد کنید.
              </p>
            }
          </div>

          <div class="field">
            <label class="field__label" for="password">رمز عبور</label>
            <div class="password">
              <input
                id="password"
                class="field__control"
                [type]="showPassword() ? 'text' : 'password'"
                formControlName="password"
                autocomplete="current-password"
                [attr.aria-invalid]="showError('password') ? 'true' : null"
                [attr.aria-describedby]="showError('password') ? 'password-error' : null"
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
            @if (showError('password')) {
              <p class="field__error" id="password-error" role="alert">
                <app-icon name="alert" [size]="14" />
                رمز عبور خود را وارد کنید.
              </p>
            }
          </div>

          <button type="submit" class="btn btn--primary btn--block btn--lg" [disabled]="busy()">
            @if (busy()) {
              <app-spinner [size]="18" label="در حال ورود" />
            } @else {
              ورود
            }
          </button>
        </form>

        <p class="text-sm muted footer">
          هنوز حساب ندارید؟ <a routerLink="/signup">یکی بسازید</a>
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
export class SignIn {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  /** Errors appear only once the user has finished with the field. */
  protected showError(control: 'username' | 'password'): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.touched || this.form.touched);
  }

  protected async submit(): Promise<void> {
    this.error.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstInvalid();
      return;
    }

    this.busy.set(true);
    const { username, password } = this.form.getRawValue();

    try {
      await this.auth.signIn(username, password);
      const redirect = this.route.snapshot.queryParamMap.get('redirect');
      await this.router.navigateByUrl(redirect ?? '/order');
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  private focusFirstInvalid(): void {
    const name = Object.keys(this.form.controls).find(
      (key) => this.form.get(key)?.invalid,
    );
    if (name) document.getElementById(name)?.focus();
  }
}
