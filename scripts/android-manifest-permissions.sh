#!/usr/bin/env bash
# scripts/android-manifest-permissions.sh — Ajoute les permissions de
# géolocalisation à l'AndroidManifest.xml de l'app Capacitor.
#
# Le dossier android/ n'est pas versionné : il est régénéré à chaque build
# (CI : `npx cap add android` + `npx cap sync android`). Le plugin
# @capacitor/geolocation ne déclare PAS ces permissions dans son propre
# manifest ; sans elles, la requête native échoue avec
# « Missing the following permissions in AndroidManifest.xml » (Bridge.java,
# validatePermissions) et la géolocalisation ne fonctionne pas sur l'APK
# (ticket 024). Ce script est idempotent (ne duplique jamais les lignes).
set -euo pipefail

MANIFEST="android/app/src/main/AndroidManifest.xml"

if [ ! -f "$MANIFEST" ]; then
  echo "AndroidManifest.xml introuvable : $MANIFEST" >&2
  exit 1
fi

# Insère les permissions juste après la balise <manifest ...> si absentes.
for perm in \
  "android.permission.ACCESS_COARSE_LOCATION" \
  "android.permission.ACCESS_FINE_LOCATION"; do
  if grep -q "android:name=\"$perm\"" "$MANIFEST"; then
    echo "Permission déjà présente : $perm"
    continue
  fi
  # Écrit la permission juste avant </manifest> pour rester simple et sûr.
  perl -0pi -e "s{(</manifest>)}{\n    <uses-permission android:name=\"$perm\" />\n\$1}" "$MANIFEST"
  echo "Permission ajoutée : $perm"
done

echo "Manifest final :"
grep -n "uses-permission" "$MANIFEST"
