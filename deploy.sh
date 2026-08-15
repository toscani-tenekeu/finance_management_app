#!/usr/bin/env bash
set -Eeuo pipefail

REPOSITORY_URL="https://github.com/toscani-tenekeu/finance_management_app.git"
BRANCH="master"
APP_DIR="/opt/finance-management-app"
DATA_DIR="/var/lib/finance-management-app"
CONFIG_DIR="/etc/finance-management-app"
ENV_FILE="$CONFIG_DIR/app.env"
SERVICE_FILE="/etc/systemd/system/finance-management-app.service"
CLI_FILE="/usr/local/bin/finance-app"
UPDATE_ONLY=false
NPM_INSTALL_ATTEMPTS=5

[[ "${1:-}" == "--update" ]] && UPDATE_ONLY=true

npm_ci_with_retry() {
  local attempt delay

  for ((attempt = 1; attempt <= NPM_INSTALL_ATTEMPTS; attempt += 1)); do
    echo "Installation des dépendances npm (tentative $attempt/$NPM_INSTALL_ATTEMPTS)…"
    if npm ci \
      --no-audit \
      --no-fund \
      --fetch-retries=5 \
      --fetch-retry-factor=2 \
      --fetch-retry-mintimeout=10000 \
      --fetch-retry-maxtimeout=120000 \
      --fetch-timeout=300000; then
      return 0
    fi

    if (( attempt == NPM_INSTALL_ATTEMPTS )); then
      echo "Échec npm après $NPM_INSTALL_ATTEMPTS tentatives. Vérifiez l’accès à registry.npmjs.org, puis relancez la même commande."
      return 1
    fi

    delay=$((attempt * 10))
    echo "Connexion npm instable. Nouvelle tentative dans ${delay}s…"
    sleep "$delay"
  done
}

configure_firewall() {
  if ! command -v ufw >/dev/null 2>&1; then
    echo "UFW n’est pas installé : aucun firewall n’est modifié."
    return 0
  fi

  if ! ufw status 2>/dev/null | grep -q '^Status: active'; then
    echo "UFW est désactivé : il reste désactivé, aucune règle n’est ajoutée."
    return 0
  fi

  if ufw status 2>/dev/null | grep -q '^7410/tcp'; then
    echo "UFW autorise déjà le port 7410/tcp."
    return 0
  fi

  ufw allow 7410/tcp comment 'Finance Management App' >/dev/null
  echo "Règle UFW ajoutée : 7410/tcp."
}

if [[ ${EUID} -ne 0 ]]; then
  exec sudo "$0" "$@"
fi

if [[ ! -r /etc/os-release ]]; then
  echo "Ubuntu est requis."
  exit 1
fi
# shellcheck disable=SC1091
source /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then
  echo "Système non pris en charge : Ubuntu uniquement."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git build-essential

node_major=0
if command -v node >/dev/null 2>&1; then
  node_major="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
fi
if (( node_major < 22 )); then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

if ! id financeapp >/dev/null 2>&1; then
  useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin financeapp
fi

mkdir -p "$DATA_DIR" "$CONFIG_DIR"
chown financeapp:financeapp "$DATA_DIR"
chmod 750 "$DATA_DIR" "$CONFIG_DIR"

if [[ -d "$APP_DIR/.git" ]]; then
  local_changes="$(git -C "$APP_DIR" status --porcelain --untracked-files=all)"
  unexpected_changes="$(printf '%s\\n' "$local_changes" | grep -vE '^[ MARC?]{2}[[:space:]]+package-lock\\.json
  if [[ -e "$APP_DIR" ]]; then
    echo "$APP_DIR existe mais n’est pas un clone Git valide."
    exit 1
  fi
  git clone --branch "$BRANCH" --single-branch "$REPOSITORY_URL" "$APP_DIR"
fi

cd "$APP_DIR"
npm_ci_with_retry
npm run check

if [[ ! -f "$ENV_FILE" ]]; then
  install -m 640 -o root -g financeapp deploy/app.env "$ENV_FILE"
fi
install -m 644 deploy/finance-management-app.service "$SERVICE_FILE"
install -m 755 scripts/finance-app.sh "$CLI_FILE"
chmod 755 deploy.sh scripts/uninstall.sh scripts/cli.mjs

admin_credentials=""
if [[ ! -f "$DATA_DIR/finance.db" ]]; then
  mode="fresh"
  if [[ "$UPDATE_ONLY" == false ]]; then
    echo "Mode d’installation :"
    echo "1) Nouvelle installation"
    echo "2) Restaurer un backup complet .fmbak"
    read -r -p "Choix [1/2] : " choice </dev/tty
    [[ "$choice" == "2" ]] && mode="restore"
  fi

  if [[ "$mode" == "restore" ]]; then
    read -r -p "Chemin du backup complet : " backup_path </dev/tty
    [[ -f "$backup_path" ]] || { echo "Backup introuvable."; exit 1; }
    DATABASE_PATH="$DATA_DIR/finance.db" /usr/bin/node scripts/cli.mjs restore-all "$backup_path" --replace
  else
    admin_credentials="$(runuser -u financeapp -- env DATABASE_PATH="$DATA_DIR/finance.db" /usr/bin/node scripts/cli.mjs init --username admin --json)"
  fi
fi

chown -R root:root "$APP_DIR"
chown -R financeapp:financeapp "$DATA_DIR"
npm prune --omit=dev --no-audit --no-fund --package-lock=false

systemctl daemon-reload
systemctl enable --now finance-management-app.service
systemctl restart finance-management-app.service

healthy=false
for _ in {1..20}; do
  if curl -fsS "http://127.0.0.1:7410/api/health" >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 1
done
if [[ "$healthy" != true ]]; then
  systemctl status finance-management-app.service --no-pager || true
  echo "Le service n’a pas répondu sur le port 7410."
  exit 1
fi

configure_firewall

echo
echo "Installation terminée avec succès."
echo "Application : Finance Management App"
echo "Accès local : http://127.0.0.1:7410"
server_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [[ -n "$server_ip" ]]; then
  echo "Accès réseau : http://${server_ip}:7410"
fi
echo "Service : finance-management-app.service (actif)"
if [[ -n "$admin_credentials" ]]; then
  admin_password="$(FINANCE_INIT_JSON="$admin_credentials" /usr/bin/node -e "process.stdout.write(JSON.parse(process.env.FINANCE_INIT_JSON).password)")"
  echo
  echo "Compte administrateur initial"
  echo "  Utilisateur : admin"
  echo "  Mot de passe : $admin_password"
  echo "Conservez ce mot de passe maintenant. Vous pourrez ensuite le changer avec : finance-app reset-password admin"
fi
echo
echo "Commandes utiles : finance-app help | finance-app status"
echo "Avant une exposition publique, configurez un domaine, un reverse proxy et un certificat SSL."
 || true)"
  if [[ -n "$unexpected_changes" ]]; then
    echo "Modifications locales détectées dans $APP_DIR :"
    printf '%s\\n' "$unexpected_changes"
    echo "Supprimez ou sauvegardez ces modifications, puis relancez : sudo finance-app update"
    exit 1
  fi
  if [[ -n "$local_changes" ]]; then
    git -C "$APP_DIR" restore --source=HEAD --staged --worktree -- package-lock.json
    echo "Modification locale automatique de package-lock.json ignorée."
  fi
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
else
  if [[ -e "$APP_DIR" ]]; then
    echo "$APP_DIR existe mais n’est pas un clone Git valide."
    exit 1
  fi
  git clone --branch "$BRANCH" --single-branch "$REPOSITORY_URL" "$APP_DIR"
fi

cd "$APP_DIR"
npm_ci_with_retry
npm run check

if [[ ! -f "$ENV_FILE" ]]; then
  install -m 640 -o root -g financeapp deploy/app.env "$ENV_FILE"
fi
install -m 644 deploy/finance-management-app.service "$SERVICE_FILE"
install -m 755 scripts/finance-app.sh "$CLI_FILE"
chmod 755 deploy.sh scripts/uninstall.sh scripts/cli.mjs

admin_credentials=""
if [[ ! -f "$DATA_DIR/finance.db" ]]; then
  mode="fresh"
  if [[ "$UPDATE_ONLY" == false ]]; then
    echo "Mode d’installation :"
    echo "1) Nouvelle installation"
    echo "2) Restaurer un backup complet .fmbak"
    read -r -p "Choix [1/2] : " choice </dev/tty
    [[ "$choice" == "2" ]] && mode="restore"
  fi

  if [[ "$mode" == "restore" ]]; then
    read -r -p "Chemin du backup complet : " backup_path </dev/tty
    [[ -f "$backup_path" ]] || { echo "Backup introuvable."; exit 1; }
    DATABASE_PATH="$DATA_DIR/finance.db" /usr/bin/node scripts/cli.mjs restore-all "$backup_path" --replace
  else
    admin_credentials="$(runuser -u financeapp -- env DATABASE_PATH="$DATA_DIR/finance.db" /usr/bin/node scripts/cli.mjs init --username admin --json)"
  fi
fi

chown -R root:root "$APP_DIR"
chown -R financeapp:financeapp "$DATA_DIR"
npm prune --omit=dev --no-audit --no-fund

systemctl daemon-reload
systemctl enable --now finance-management-app.service
systemctl restart finance-management-app.service

healthy=false
for _ in {1..20}; do
  if curl -fsS "http://127.0.0.1:7410/api/health" >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 1
done
if [[ "$healthy" != true ]]; then
  systemctl status finance-management-app.service --no-pager || true
  echo "Le service n’a pas répondu sur le port 7410."
  exit 1
fi

configure_firewall

echo
echo "Installation terminée avec succès."
echo "Application : Finance Management App"
echo "Accès local : http://127.0.0.1:7410"
server_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [[ -n "$server_ip" ]]; then
  echo "Accès réseau : http://${server_ip}:7410"
fi
echo "Service : finance-management-app.service (actif)"
if [[ -n "$admin_credentials" ]]; then
  admin_password="$(FINANCE_INIT_JSON="$admin_credentials" /usr/bin/node -e "process.stdout.write(JSON.parse(process.env.FINANCE_INIT_JSON).password)")"
  echo
  echo "Compte administrateur initial"
  echo "  Utilisateur : admin"
  echo "  Mot de passe : $admin_password"
  echo "Conservez ce mot de passe maintenant. Vous pourrez ensuite le changer avec : finance-app reset-password admin"
fi
echo
echo "Commandes utiles : finance-app help | finance-app status"
echo "Avant une exposition publique, configurez un domaine, un reverse proxy et un certificat SSL."
