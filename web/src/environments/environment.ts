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
   * Sign-up collects a username, not an email. The username is mapped onto an
   * address in this domain so Supabase Auth can be used unchanged.
   *
   * IMPORTANT — this must be a domain you own that RESOLVES IN DNS.
   * Supabase Auth rejects sign-ups whose email domain has no DNS record with
   * `email_address_invalid`, so an invented domain does not work. The domain
   * never has to receive mail (keep "Confirm email" off); it only has to exist.
   * A dedicated subdomain of a domain you own, with a single A or MX record,
   * is the tidiest option.
   */
  usernameEmailDomain: 'romano.app',
};
