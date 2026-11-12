#!/bin/sh
# Assemble le dossier a mettre en ligne. Appele par le workflow GitHub Pages
# et par les tests, pour qu'ils voient exactement le meme site.
#
#   sh tools/site.sh [dossier]      (defaut : site)
#
# La page est recopiee en 404.html pour que n'importe quelle adresse du site
# ouvre le jeu plutot qu'une page d'erreur.
set -e
dest="${1:-site}"
rm -rf "$dest"
mkdir -p "$dest"
# __VERSION__ devient la date de mise en ligne, affichee en bas du profil :
# c'est la seule facon de savoir d'un coup d'oeil si l'app ouverte sur un
# telephone est bien la derniere, ou une version gardee en cache.
horo="$(date -u '+%d/%m/%Y %H:%M UTC')"
sed "s|__VERSION__|$horo|" index.html > "$dest/index.html"
cp "$dest/index.html" "$dest/404.html"
# Le meme tampon dans un fichier de quelques octets : l'app le relit sans
# passer par le cache pour savoir si elle tourne en version perimee.
printf '%s' "$horo" > "$dest/version.txt"
cp -R public/. "$dest/"
