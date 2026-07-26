import { InjectionToken } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';


/**
 * A single Supabase client for the whole app. Injected rather than imported so
 * tests can swap it out.
 */
export const SUPABASE = new InjectionToken<SupabaseClient>('SUPABASE_CLIENT', {
  providedIn: 'root',
  factory: () =>
    createClient(environment.supabaseUrl, environment.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'romano-auth',
      },
    }),
});

/**
 * Turn a Postgres/Supabase error into something a person can act on.
 *
 * Our RPCs raise messages that are already written for end users, so those are
 * passed through; constraint violations are translated by name.
 */
export function toUserMessage(error: unknown): string {
  if (!error) return 'مشکلی پیش آمد. دوباره تلاش کنید.';

  const err = error as { message?: string; code?: string; details?: string };
  const raw = err.message ?? '';

  if (raw.includes('profiles_username_key')) {
    return 'این نام کاربری قبلاً گرفته شده است. یکی دیگر انتخاب کنید.';
  }
  if (raw.includes('profiles_mobile_key')) {
    return 'این شمارهٔ موبایل قبلاً ثبت شده است.';
  }
  if (raw.includes('profiles_username_check')) {
    return 'نام کاربری باید ۳ تا ۳۰ نویسه باشد: حروف کوچک انگلیسی، عدد یا زیرخط.';
  }
  if (raw.includes('profiles_mobile_check')) {
    return 'یک شمارهٔ موبایل معتبر وارد کنید، مثلاً ۰۹۱۲۱۲۳۴۵۶۷.';
  }
  if (raw.toLowerCase().includes('invalid login credentials')) {
    return 'نام کاربری یا رمز عبور نادرست است.';
  }

  // Sign-up creates the account, but GoTrue withholds the session while
  // "Confirm email" is on. Nothing ever reads the synthetic mailbox, so this
  // is always a project misconfiguration — never something the person typed.
  if (
    (err as { code?: string }).code === 'email_not_confirmed' ||
    raw.toLowerCase().includes('email not confirmed')
  ) {
    return (
      'این حساب هنوز فعال نشده است. مدیر باید گزینهٔ «Confirm email» را در پروژهٔ ' +
      'Supabase خاموش کند (Authentication ← Sign In / Providers ← Email) — ورود با ' +
      'نام کاربری به تأیید ایمیل نیازی ندارد.'
    );
  }

  // Supabase Auth rejects an address whose domain does not resolve in DNS.
  // Usernames are mapped onto `usernameEmailDomain`, so this always means that
  // domain is misconfigured — never that the person typed something wrong.
  if (
    (err as { code?: string }).code === 'email_address_invalid' ||
    /email address .* is invalid/i.test(raw)
  ) {
    return (
      `ثبت‌نام درست پیکربندی نشده است: Supabase نشانی‌های دامنهٔ ` +
      `«${environment.usernameEmailDomain}» را نمی‌پذیرد، چون این دامنه در DNS ثبت نشده. ` +
      `مدیر باید usernameEmailDomain را در تنظیمات برنامه روی دامنه‌ای بگذارد که ` +
      `سازمان مالک آن است.`
    );
  }
  if (raw.toLowerCase().includes('failed to fetch')) {
    return 'ارتباط با سرور برقرار نشد. اتصال خود را بررسی کنید و دوباره تلاش کنید.';
  }

  // Anything raised by our own RPCs is already user-facing, and already Persian
  // — see supabase/migrations/*_persian_messages.sql.
  return raw || 'مشکلی پیش آمد. دوباره تلاش کنید.';
}
