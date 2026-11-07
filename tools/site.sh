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
cp index.html "$dest/index.html"
cp index.html "$dest/404.html"
cp public/* "$dest/"
