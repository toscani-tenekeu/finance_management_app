#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/finance-management-app"
ENV_FILE="/etc/finance-management-app/app.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

case "${1:-help}" in
  uninstall)
    shift
    exec sudo "$APP_DIR/scripts/uninstall.sh" "$@"
    ;;
  update)
    shift
    exec sudo "$APP_DIR/deploy.sh" --update "$@"
    ;;
  *)
    if [[ ${EUID} -eq 0 ]]; then
      exec /usr/bin/node "$APP_DIR/scripts/cli.mjs" "$@"
    fi
    exec sudo -E /usr/bin/node "$APP_DIR/scripts/cli.mjs" "$@"
    ;;
esac
