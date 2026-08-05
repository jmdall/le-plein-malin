#!/usr/bin/env bash
# scripts/deploy-vps.sh — Déploie le backend « Je fais le plein ou non ? »
# (Nitro + SQLite) sur le VPS via SSH + Docker + git.
#
# Le Dockerfile fait `COPY . .` puis `npm run build` : il a besoin du dépôt
# COMPLET (routes server/, domain/, shared/…). Le plus fiable est donc de
# tirer le dépôt git sur le VPS, puis de builder le conteneur. Le volume
# Docker nommé `sqlite-data` persiste la base entre les redéploiements.
#
# Prérequis :
#   - docker + docker compose sur le VPS (vérifié par le script)
#   - le VPS peut cloner le dépôt (clé SSH de déploiement, ou repo public)
#   - un fichier .env sur le VPS (copié une première fois par ce script,
#     protégé en 600, jamais committé)
#   - un sous-domaine HTTPS qui pointe vers le VPS (reverse proxy + Certbot)
#     qui sert le port 3000 (hors périmètre : config reverse proxy)
#
# Usage :
#   VPS_HOST=user@host.example.com ./scripts/deploy-vps.sh [ref]
#   ref : branche/tag à déployer (défaut : main)
#
# Variables d'environnement du script :
#   VPS_HOST            (requis)  cible SSH, ex. deploy@vps.example.com
#   VPS_DIR             (défaut)  ~/le-plein-malin (répertoire de travail)
#   VPS_GIT_URL         (défaut)  git@github.com:jmdall/le-plein-malin.git
#   BUILD_ARGS          (défaut)  --build (désactivable avec BUILD_ARGS="")

set -euo pipefail

# ——— Configuration ———
: "${VPS_HOST:?VPS_HOST requis (ex. deploy@vps.example.com)}"
VPS_DIR="${VPS_DIR:-/root/le-plein-malin}"
VPS_GIT_URL="${VPS_GIT_URL:-git@github.com:jmdall/le-plein-malin.git}"
BUILD_ARGS="${BUILD_ARGS:---build}"
REF="${1:-main}"
REMOTE_ENV="${VPS_DIR}/.env"

if [[ ! -f ".env" ]]; then
  echo "⚠️  .env local introuvable. Le premier déploiement poussera le .env du VPS uniquement s'il existe déjà." >&2
  echo "    Copiez .env.example vers .env et remplissez les valeurs AVANT de déployer." >&2
fi

echo "→ Déploiement de la ref '${REF}' sur ${VPS_HOST}:${VPS_DIR}"

# ——— 1. Initialiser ou mettre à jour le clone du dépôt ———
ssh "${VPS_HOST}" "
  set -e
  if [[ ! -d '${VPS_DIR}/.git' ]]; then
    git clone '${VPS_GIT_URL}' '${VPS_DIR}'
  fi
  cd '${VPS_DIR}'
  git fetch --all --prune
  git checkout '${REF}' 2>/dev/null || git checkout -B '${REF}' origin/'${REF}'
  git pull --ff-only origin '${REF}'
"

# ——— 2. Pousser le .env (premier déploiement) ———
if [[ -f ".env" ]]; then
  scp -q .env "${VPS_HOST}:${REMOTE_ENV}"
  ssh "${VPS_HOST}" "chmod 600 '${REMOTE_ENV}'"
fi

# ——— 3. Vérifier docker/compose sur le VPS ———
ssh "${VPS_HOST}" "
  command -v docker >/dev/null || { echo '❌ docker introuvable sur le VPS' >&2; exit 1; }
  docker compose version >/dev/null 2>&1 || { echo '❌ docker compose introuvable sur le VPS' >&2; exit 1; }
"

# ——— 4. Build + up (depuis le répertoire du dépôt) ———
ssh "${VPS_HOST}" "cd '${VPS_DIR}' && docker compose ${BUILD_ARGS} up -d"

echo "✅ Backend déployé : ${VPS_HOST}:${VPS_DIR} (ref ${REF})"
echo "   Vérifiez avec : curl https://votre-sous-domaine.fr/api/health"
