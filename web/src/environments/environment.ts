/**
 * Supabase connection settings.
 *
 * The publishable key is safe to ship to the browser — it only ever grants the
 * `anon` role, and every table is protected by row level security. Never put
 * the service-role key in this file.
 */
export const environment = {
  production: false,
  supabaseUrl: 'https://mhyizhxbsujhlaahnrjc.supabase.co',
  supabasePublishableKey: 'sb_publishable_PlkkHp60MYxi6kQ3yfr8cA_W5ROm9br',

  /**
   * Sign-up collects a username, not an email. We map the username onto a
   * synthetic address in this domain so Supabase Auth can be used unchanged.
   * The domain does not need to exist or receive mail.
   */
  usernameEmailDomain: 'users.romano.app',
};
