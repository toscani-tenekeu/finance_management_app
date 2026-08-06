#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/finance-management-app"
DATA_DIR="/var/lib/finance-management-app"
CONFIG_DIR="/etc/finance-management-app"
SERVICE_FILE="/etc/systemd/system/finance-management-app.service"
CLI_FILE="/usr/local/bin/finance-app"

if [[ ${EUID} -ne 0 ]]; then
  exec sudo "$0" "$@"
fi

if [[ -f "$CONFIG_DIR/app.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$CONFIG_DIR/app.env"
  set +a
fi

echo "Désinstallation de Finance Management App"
echo "1) Créer un backup complet chiffré, puis supprimer l’application et les données"
echo "2) Supprimer définitivement l’application et toutes les données sans backup"
read -r -p "Choix [1/2] : " choice </dev/tty

case "$choice" in
  1)
    default_backup="/root/finance-management-backup-$(date -u +%Y%m%dT%H%M%SZ).fmbak"
    read -r -p "Fichier de backup [$default_backup] : " backup_path </dev/tty
    backup_path="${backup_path:-$default_backup}"
    /usr/bin/node "$APP_DIR/scripts/cli.mjs" backup-all "$backup_path"
    echo "Backup vérifié : $backup_path"
    ;;
  2)
    read -r -p "Tapez exactement DELETE FINANCE : " confirmation </dev/tty
    [[ "$confirmation" == "DELETE FINANCE" ]] || { echo "Annulé."; exit 1; }
    ;;
  *)
    echo "Choix invalide."
    exit 1
    ;;
esac

systemctl disable --now finance-management-app.service 2>/dev/null || true
rm -f "$SERVICE_FILE" "$CLI_FILE"
systemctl daemon-reload

[[ "$APP_DIR" == "/opt/finance-management-app" ]] && rm -rf "$APP_DIR"
[[ "$DATA_DIR" == "/var/lib/finance-management-app" ]] && rm -rf "$DATA_DIR"
[[ "$CONFIG_DIR" == "/etc/finance-management-app" ]] && rm -rf "$CONFIG_DIR"

echo "Application et données locales supprimées."
