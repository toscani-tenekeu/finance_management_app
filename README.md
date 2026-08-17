# Finance Management App

> Application web de gestion financière personnelle, auto-hébergée, simple à exploiter et conçue pour conserver les données localement.

[![CI](https://github.com/toscani-tenekeu/finance_management_app/actions/workflows/ci.yml/badge.svg)](https://github.com/toscani-tenekeu/finance_management_app/actions/workflows/ci.yml)
[![Version](https://img.shields.io/github/v/release/toscani-tenekeu/finance_management_app)](https://github.com/toscani-tenekeu/finance_management_app/releases)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

Version publiée : **v1.0.4**.

## État actuel

- Déploiement de référence : [`https://fi.toscani-tenekeu.com`](https://fi.toscani-tenekeu.com)
- Accès public : Nginx sur HTTPS uniquement
- Application : service `systemd`, écoute interne sur `127.0.0.1:7410`
- Stockage : SQLite local, sans base de données externe
- Sauvegardes : export utilisateur ou complet, chiffré par phrase secrète

## Fonctionnalités

- Tableau de bord des soldes, revenus, dépenses et épargne
- Comptes, transactions, charges fixes et sources de revenus
- Événements imprévus, objectifs d’épargne et prévisions graphiques
- Comptes multi-utilisateurs avec rôles `admin` et `user`
- Sessions sécurisées, limitation des tentatives de connexion et protection Same-Origin
- Mise à jour temps réel de l’interface via Server-Sent Events
- Sauvegarde/restauration par utilisateur ou de toute l’installation
- Endpoint de supervision : `GET /api/health`

## Stack

| Couche | Technologies |
| --- | --- |
| Interface | React `19.2.8`, TypeScript `6.0.3`, Vite `8.2.0` |
| Visualisation | Chart.js `4.5.1`, react-chartjs-2 `5.3.1` |
| Composants | Lucide React `1.28.0`, CSS natif |
| Serveur | Node.js `>=22.13.0`, Express `5.2.1` |
| Données | SQLite embarqué via better-sqlite3 `13.0.3` |
| Sécurité serveur | Helmet `8.3.0`, compression `1.8.1`, validation Zod `4.4.3` |
| Qualité | ESLint `10.8.0`, Vitest `4.1.10`, TypeScript strict |
| Production | Ubuntu, systemd, Nginx, Let’s Encrypt, UFW |

Les versions complètes et leurs transitive dependencies sont verrouillées dans `package.json` et `package-lock.json`.

## Prérequis

### Production

- Ubuntu 22.04 ou plus récent
- accès `root` ou `sudo`
- Git, curl et `build-essential`
- Node.js 22.x (installé automatiquement si nécessaire)
- 1 Go de RAM recommandé
- un domaine pointant vers le serveur pour activer HTTPS

### Développement

- Node.js `>=22.13.0`
- npm fourni avec Node.js
- outils de compilation natifs pour `better-sqlite3`

## Installation sur un serveur

Cloner le dépôt permet de vérifier le script avant son exécution :

```bash
git clone https://github.com/toscani-tenekeu/finance_management_app.git
cd finance_management_app
sudo ./deploy.sh
```

L’installateur :

1. installe les dépendances système et Node.js 22 si nécessaire ;
2. installe les dépendances avec `npm ci` ;
3. exécute lint, vérification TypeScript, tests et build ;
4. crée le service `finance-management-app.service` ;
5. initialise une nouvelle base ou restaure un backup complet ;
6. vérifie la disponibilité de `/api/health`.

Une installation existante se met à jour avec :

```bash
sudo finance-app update
```

L’installation rapide reste disponible :

```bash
curl -fsSL https://raw.githubusercontent.com/toscani-tenekeu/finance_management_app/master/deploy.sh | sudo bash
```

## HTTPS et exposition publique

Pour une production sécurisée :

1. faire pointer le record `A` du domaine vers le serveur ;
2. configurer Nginx pour faire suivre HTTPS vers `http://127.0.0.1:7410` ;
3. installer un certificat Let’s Encrypt avec Certbot ;
4. définir `HOST=127.0.0.1` et `COOKIE_SECURE=true` ;
5. retirer l’autorisation pare-feu directe de `7410/tcp`.

La configuration actuellement en production suit ce modèle : le port `7410` n’est pas accessible depuis Internet et seul `https://fi.toscani-tenekeu.com` est public.

## Configuration

Le fichier de production est `/etc/finance-management-app/app.env` :

```dotenv
DATABASE_PATH=/var/lib/finance-management-app/finance.db
PORT=7410
HOST=127.0.0.1
COOKIE_SECURE=true
TRUST_PROXY=loopback
NODE_ENV=production
```

Pour une installation locale, utilisez par exemple `DATABASE_PATH=./data/finance.db`. Le fichier `deploy/app.env` contient les valeurs initiales prévues par l’installateur ; adaptez `HOST` et `COOKIE_SECURE` après la mise en place du reverse proxy.

## Commandes d’exploitation

```bash
finance-app help
finance-app status
finance-app list-users
finance-app create-user second-user
finance-app reset-password admin
finance-app set-role second-user user
finance-app delete-user second-user --yes
finance-app backup-user second-user backup.fmbak
finance-app restore-user backup.fmbak --replace
finance-app backup-all backup-complet.fmbak
finance-app restore-all backup-complet.fmbak --replace
finance-app update
finance-app uninstall
```

Les fichiers `.fmbak` sont chiffrés avec AES-256-GCM et une phrase secrète d’au moins 12 caractères. Conservez les sauvegardes et leurs phrases secrètes hors du serveur.

## Développement

```bash
npm ci
npm run build
DATABASE_PATH=./data/finance.db node scripts/cli.mjs init --username admin
DATABASE_PATH=./data/finance.db HOST=127.0.0.1 PORT=7410 npm start
```

L’application est alors disponible sur `http://127.0.0.1:7410`.

Commandes utiles :

```bash
npm run dev          # serveur Vite pour l’interface
npm run dev:server   # serveur Node en mode watch
npm run lint
npm run typecheck
npm test
npm run build
npm run check        # lint + types + tests + build
```

La CI GitHub exécute ces contrôles sur les pull requests et les pushes vers `master`, puis réalise un audit des dépendances de production.

## Architecture

```text
Navigateur
   │ HTTPS
   ▼
Nginx / Let’s Encrypt
   │ http://127.0.0.1:7410
   ▼
Express + React buildée
   │
   ▼
SQLite : /var/lib/finance-management-app/finance.db
```

Les données applicatives restent sur le serveur. Aucun service cloud ou fournisseur de base de données n’est requis.

## Sécurité

Avant la production, utilisez HTTPS, protégez SSH, limitez les ports exposés, conservez des backups hors du VPS et appliquez régulièrement `finance-app update`. Pour signaler une vulnérabilité, consultez [SECURITY.md](SECURITY.md) plutôt que d’ouvrir une issue publique.

## Licence

Distribué sous licence [MIT](LICENSE).
