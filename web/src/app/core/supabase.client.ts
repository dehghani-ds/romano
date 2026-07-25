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
  if (!error) return 'Something went wrong. Please try again.';

  const err = error as { message?: string; code?: string; details?: string };
  const raw = err.message ?? '';

  if (raw.includes('profiles_username_key')) {
    return 'That username is already taken. Pick another one.';
  }
  if (raw.includes('profiles_mobile_key')) {
    return 'That mobile number is already registered.';
  }
  if (raw.includes('profiles_username_check')) {
    return 'Username must be 3–30 characters, using lowercase letters, numbers or underscores.';
  }
  if (raw.includes('profiles_mobile_check')) {
    return 'Enter a valid mobile number, for example 09121234567.';
  }
  if (raw.toLowerCase().includes('invalid login credentials')) {
    return 'Wrong username or password.';
  }

  // Supabase Auth rejects an address whose domain does not resolve in DNS.
  // Usernames are mapped onto `usernameEmailDomain`, so this always means that
  // domain is misconfigured — never that the person typed something wrong.
  if (
    (err as { code?: string }).code === 'email_address_invalid' ||
    /email address .* is invalid/i.test(raw)
  ) {
    return (
      `Sign-up is not configured correctly: Supabase will not accept addresses at ` +
      `"${environment.usernameEmailDomain}" because that domain does not resolve in DNS. ` +
      `An administrator needs to set usernameEmailDomain in the app environment to a ` +
      `domain the organisation owns.`
    );
  }
  if (raw.toLowerCase().includes('failed to fetch')) {
    return 'Cannot reach the server. Check your connection and try again.';
  }

  // Anything raised by our own RPCs is already user-facing.
  return raw || 'Something went wrong. Please try again.';
}
