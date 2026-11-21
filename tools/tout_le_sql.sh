#!/bin/sh
# Rassemble les migrations en un seul fichier a coller dans le SQL Editor de
# Supabase. Le CLI n'est pas toujours a portee — un telephone n'a pas de
# terminal — et le tableau de bord, lui, l'est toujours.
set -e
cd "$(dirname "$0")/.."
{ echo "-- Compo.io — tout le schema, a coller dans le SQL Editor de Supabase."
  echo "-- Ce fichier est la concatenation des migrations, dans l'ordre. Il est"
  echo "-- rejouable : le passer deux fois ne casse rien et ne duplique rien, ce qui"
  echo "-- evite d'avoir a savoir lesquelles sont deja passees."
  echo "-- Genere par tools/tout_le_sql.sh — ne pas editer a la main."
  echo
  for f in supabase/migrations/*.sql; do
    echo "-- ========== $(basename "$f") =========="; cat "$f"; echo
  done; } > supabase/tout_le_sql.sql
echo "supabase/tout_le_sql.sql : $(wc -l < supabase/tout_le_sql.sql) lignes"
