#!/usr/bin/env bash
# scripts/deploy-vps.sh — Déploie le backend « Je fais le plein ou non ? »
# (Nitro + SQLite) sur le VPS via SSH + Docker + git.
#
# Le Dockerfile fait `COPY . .` puis `npm run build` : il a besoin du dépôt
# COMPLET (routes server/, domain/, shared/…). Le plus fiable est donc de
# tirer le dépôt git sur le VPS, puis de builder le conteneur. Le volume
# Docker nommé `sqlite-data` persiste la base entre les redéploiements.
#
# Le dépôt est PUBLIC : le clone se fait en HTTPS, sans clé SSH ni deploy key.
#
# Prérequis :
#   - docker + docker compose sur le VPS (vérifié par le script)
#   - un fichier .env sur le VPS : copié par ce script à la première exécution
#     depuis le .env local (jamais écrasé ensuite, jamais committé). Le .env
#     du VPS doit contenir les valeurs de PRODUCTION (voir .env.example).
#   - un sous-domaine HTTPS qui pointe vers le VPS (reverse proxy + Certbot)
#     qui sert le port 3000 (hors périmètre : config reverse proxy)
#
# Usage :
#   VPS_HOST=user@host.example.com ./scripts/deploy-vps.sh [ref]
#   ref : branche/tag à déployer (défaut : main)
#
# Variables d'environnement du script :
#   VPS_HOST            (requis)  cible SSH, ex. root@203.0.113.10
#   VPS_DIR             (défaut)  /root/le-plein-malin (répertoire de travail)
#   VPS_GIT_URL         (défaut)  https://github.com/jmdall/le-plein-malin.git
#   BUILD_ARGS          (défaut)  --build (désactivable avec BUILD_ARGS="")
#   FORCE_ENV           (défaut)  false — si true, écrase le .env distant

set -euo pipefail

# ——— Configuration ———
: "${VPS_HOST:?VPS_HOST requis (ex. root@203.0.113.10)}"
VPS_DIR="${VPS_DIR:-/root/le-plein-malin}"
VPS_GIT_URL="${VPS_GIT_URL:-https://github.com/jmdall/le-plein-malin.git}"
BUILD_ARGS="${BUILD_ARGS:---build}"
FORCE_ENV="${FORCE_ENV:-false}"
REF="${1:-main}"
REMOTE_ENV="${VPS_DIR}/.env"

# ——— 0. Pré-vérifications locales ———
if [[ ! -f "docker-compose.yml" || ! -f "Dockerfile" ]]; then
  echo "❌ docker-compose.yml / Dockerfile introuvables. Lancez depuis la racine du dépôt." >&2
  exit 1
fi

echo "→ Déploiement de la ref '${REF}' sur ${VPS_HOST}:${VPS_DIR}"
echo "  (dépôt : ${VPS_GIT_URL})"

# ——— 1. Initialiser ou mettre à jour le clone du dépôt (HTTPS, public) ———
ssh "${VPS_HOST}" "
  set -e
  if [[ ! -d '${VPS_DIR}/.git' ]]; then
    git clone '${VPS_GIT_URL}' '${VPS_DIR}'
  fi
  cd '${VPS_DIR}'
  git fetch --all --prune
  git checkout '${REF}' 2>/dev/null || git checkout -B '${REF}' origin/'${REF}'
  git pull --ff-only origin '${REF}'
  echo '✔ Dépôt à jour'
"

# ——— 2. Gérer le .env sur le VPS ———
# Le .env contient des secrets : jamais committé, jamais écrasé sans demande.
# À la première exécution on le copie depuis le local ; ensuite on le laisse.
ENV_EXISTS="$(ssh "${VPS_HOST}" "test -f '${REMOTE_ENV}' && echo yes || echo no")"
if [[ "${ENV_EXISTS}" == "yes" ]] && [[ "${FORCE_ENV}" != "true" ]]; then
  echo "→ .env distant présent — conservé (FORCE_ENV=true pour l'écraser)"
elif [[ -f ".env" ]]; then
  scp -q .env "${VPS_HOST}:${REMOTE_ENV}"
  ssh "${VPS_HOST}" "chmod 600 '${REMOTE_ENV}'"
  echo "→ .env copié depuis le local (protégé en 600)"
else
  echo "⚠️  Aucun .env local : le conteneur utilisera ses valeurs par défaut." >&2
fi

# ——— 3. Vérifier docker/compose sur le VPS ———
ssh "${VPS_HOST}" "
  command -v docker >/dev/null || { echo '❌ docker introuvable sur le VPS' >&2; exit 1; }
  docker compose version >/dev/null 2>&1 || { echo '❌ docker compose introuvable sur le VPS' >&2; exit 1; }
  echo '✔ docker compose OK'
"

# ——— 4. Build + up (depuis le répertoire du dépôt) ———
# Syntaxe : `docker compose up --build -d` (l'ordre --build après `up` est
# requis par Compose v2/v5 ; `docker compose --build up` est invalide).
ssh "${VPS_HOST}" "cd '${VPS_DIR}' && docker compose up ${BUILD_ARGS} -d"

echo "✅ Backend déployé : ${VPS_HOST}:${VPS_DIR} (ref ${REF})"
echo "   Vérifiez avec : curl https://api.example.com/api/health"
