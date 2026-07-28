#!/usr/bin/env bash
#
# One-time server provisioning for Romano (chayinabat.ir).
#
# This is NOT part of the deploy loop — deploys happen via .github/workflows/deploy.yml.
# Run this once against a fresh server, and again only when prerequisites change.
# Every step is idempotent and safe to re-run.
#
# The target server also hosts digfon and gamschools; nothing here touches those
# vhosts, their PM2 processes, or their files.
#
#   Usage: ./deploy/provision.sh <ssh-target> [ci-public-key-path]
#   e.g.   ./deploy/provision.sh root@185.58.240.72 ~/.ssh/romano_ci_ed25519.pub

set -euo pipefail

SSH_TARGET="${1:-}"
CI_PUBKEY="${2:-$HOME/.ssh/romano_ci_ed25519.pub}"
if [[ -z "$SSH_TARGET" ]]; then
  echo "usage: $0 <ssh-target> [ci-public-key-path]" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Provisioning $SSH_TARGET"

# ── CI deploy key ────────────────────────────────────────────────────────────
# Appended only if absent, so re-running never duplicates the entry.
if [[ -f "$CI_PUBKEY" ]]; then
  echo "==> Installing CI deploy key"
  ssh "$SSH_TARGET" 'mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
    key=$(cat); grep -qF "$key" ~/.ssh/authorized_keys \
      && echo "--> CI key already authorized" \
      || { echo "$key" >> ~/.ssh/authorized_keys; echo "--> CI key added"; }' < "$CI_PUBKEY"
else
  echo "!! CI public key not found at $CI_PUBKEY — skipping (GitHub Actions will not be able to connect)"
fi

# ── Node, PM2, Docker ────────────────────────────────────────────────────────
NPM_VERSION="$(node -p "require('$REPO_ROOT/package.json').packageManager.split('@')[1]")"

ssh "$SSH_TARGET" NPM_VERSION="$NPM_VERSION" bash -euo pipefail <<'REMOTE'
export DEBIAN_FRONTEND=noninteractive

# package.json pins engines.node >= 22.22.3.
node_major() { command -v node >/dev/null 2>&1 && node -p 'process.versions.node.split(".")[0]' || echo 0; }

if [ "$(node_major)" -lt 22 ]; then
  echo "--> upgrading Node (found $(node -v 2>/dev/null || echo none))"
  # `n` installs into /usr/local/bin, which shadows the apt/nodesource node in
  # /usr/bin. If it's managing node here, upgrade through it — otherwise the
  # nodesource package installs fine but stays masked.
  if command -v n >/dev/null 2>&1; then
    echo "--> 'n' detected, upgrading via: n 22"
    n 22
    hash -r
  else
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  fi
  echo "--> node now: $(node -v)"
  if [ "$(node_major)" -lt 22 ]; then
    echo "!! node is still $(node -v) — something else is shadowing it in PATH" >&2
    exit 1
  fi
else
  echo "--> node present: $(node -v)"
fi

# Node 22 ships npm 10, which rejects this repo's lockfile ("Missing:
# chokidar@4.0.3 from lock file"). The lockfile is correct; npm 10 just resolves
# hoisting differently. The API deploy runs `npm ci` here, so it needs the match.
if [ "$(npm -v | cut -d. -f1)" -lt "${NPM_VERSION%%.*}" ]; then
  echo "--> upgrading npm $(npm -v) -> $NPM_VERSION"
  npm install -g "npm@$NPM_VERSION"
  hash -r
  echo "--> npm now: $(npm -v)"
else
  echo "--> npm present: $(npm -v)"
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "--> installing pm2"
  npm install -g pm2
  pm2 startup systemd -u root --hp /root >/dev/null
else
  echo "--> pm2 present: $(pm2 -v | tail -1)"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "--> installing docker"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  echo "--> docker present: $(docker --version)"
fi

mkdir -p /var/www/chayinabat/web /var/www/chayinabat/admin \
         /var/www/chayinabat-api/uploads /var/www/chayinabat-db
chown -R www-data:www-data /var/www/chayinabat

# Port 3000 is digfon-api's. Romano's API is on 3100 and the vhost proxies there;
# fail loudly now rather than after a deploy has already swapped the binary in.
if ss -tlnp 2>/dev/null | grep -q ':3100 '; then
  echo "!! something already listens on :3100 — the API deploy will collide" >&2
fi
REMOTE

# ── nginx vhost ──────────────────────────────────────────────────────────────
# Applied only if absent. certbot rewrites this in place to add TLS, so we never
# clobber an existing copy — diff and edit by hand if it needs to change.
echo "==> nginx vhost"
if ssh "$SSH_TARGET" 'test -f /etc/nginx/sites-available/chayinabat'; then
  echo "--> /etc/nginx/sites-available/chayinabat exists; showing diff, not overwriting"
  ssh "$SSH_TARGET" 'cat /etc/nginx/sites-available/chayinabat' \
    | diff -u - "$REPO_ROOT/deploy/nginx/chayinabat.conf" || true
else
  scp "$REPO_ROOT/deploy/nginx/chayinabat.conf" "$SSH_TARGET:/etc/nginx/sites-available/chayinabat"
  ssh "$SSH_TARGET" bash -euo pipefail <<'REMOTE'
ln -sfn /etc/nginx/sites-available/chayinabat /etc/nginx/sites-enabled/chayinabat
nginx -t
systemctl reload nginx
echo "--> chayinabat vhost enabled"
REMOTE
fi

cat <<'DONE'

==> Provisioning complete.

Remaining manual steps:

  1. Add to GitHub -> Settings -> Secrets -> Actions:
       SSH_PRIVATE_KEY, SERVER_HOST, SSH_USER,
       DATABASE_URL, JWT_SECRET, POSTGRES_PASSWORD

     DATABASE_URL is written into the API's .env verbatim and is also rewritten
     by CI to point at the migration tunnel, so its host:port must be the one the
     API uses on the box:
       postgresql://romano:<POSTGRES_PASSWORD>@127.0.0.1:5432/romano?schema=public

     JWT_SECRET:        openssl rand -base64 48
     POSTGRES_PASSWORD: openssl rand -hex 24     (must match DATABASE_URL)

     -hex, not -base64, on purpose: base64 emits / and +, and an unencoded / in
     a connection URL is parsed as the start of the path. Percent-encode it if
     you pick your own password with /, ?, # or @ in it.

  2. Push to main (or run the Deploy workflow manually) to deploy the apps.

  3. Once chayinabat.ir resolves and the apps respond over HTTP, add TLS:
       certbot --nginx -d chayinabat.ir -d www.chayinabat.ir -d admin.chayinabat.ir

  4. Seed the product and the admin account ONCE, after the first deploy. This is
     deliberately not in the deploy loop. From a checkout, with a tunnel open:
       ssh -f -N -L 55432:127.0.0.1:5432 <ssh-target>
       DATABASE_URL="postgresql://romano:<pw>@127.0.0.1:55432/romano?schema=public" \
         ADMIN_USERNAME=... ADMIN_PASSWORD=... npm run db:seed

DONE
