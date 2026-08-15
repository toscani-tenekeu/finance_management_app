# Finance Management App

Version publiée : **v1.0.4**.

Application Node.js auto-hébergée pour suivre soldes, dépenses, revenus, épargne mensuelle, imprévus et prévisions. Toutes les données sont stockées localement dans SQLite.

## Prérequis

- Ubuntu 22.04 ou plus récent
- accès `root` ou `sudo`
- 1 Go de RAM minimum
- Git et accès Internet pendant l’installation
- port TCP `7410` disponible

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/toscani-tenekeu/finance_management_app/master/deploy.sh | sudo bash
```

L’installateur demande une installation neuve ou la restauration d’un backup complet, installe Node.js 22 si nécessaire, exécute tous les contrôles et démarre le service sur le port `7410`.

En cas de coupure temporaire du registre npm, l’installation réessaie automatiquement jusqu’à cinq fois. Après un échec complet, relancez simplement la même commande : l’installation reprend sans supprimer les données existantes.

Si UFW est déjà actif, l’installateur autorise `7410/tcp`. Il n’installe pas et n’active jamais UFW lorsqu’il est désactivé. Le firewall réseau du fournisseur VPS doit être configuré séparément si nécessaire.

> Il est fortement conseillé d’installer un certificat SSL avec Nginx ou Caddy avant d’exposer l’application sur Internet. Après activation de HTTPS, définissez `COOKIE_SECURE=true` dans `/etc/finance-management-app/app.env`, puis redémarrez le service.

## Commandes

```bash
finance-app help
finance-app create-user second-user
finance-app reset-password admin
finance-app backup-user second-user
finance-app restore-user backup.fmbak
finance-app backup-all
finance-app update
finance-app uninstall
```

Les commandes locales ne vérifient pas le rôle applicatif. Les permissions Linux du VPS s’appliquent. Dans l’interface, seul l’administrateur peut créer un autre utilisateur ; toutes les fonctions financières sont identiques pour les autres comptes.

## Développement

```bash
npm ci
DATABASE_PATH=./data/finance.db node scripts/cli.mjs init
npm run build
DATABASE_PATH=./data/finance.db npm start
```

Contrôle complet :

```bash
npm run check
```

Base de production : `/var/lib/finance-management-app/finance.db`  
Service : `finance-management-app.service`  
Licence : MIT
