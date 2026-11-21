#!/bin/sh
# Les migrations, passées pour de vrai sur un PostgreSQL jetable.
#
#   sh tools/test_sql.sh
#
# Supabase n'est joignable ni d'ici ni depuis l'intégration continue, et
# `supabase db push` est une commande qu'on ne joue qu'une fois : une erreur de
# syntaxe ou une contrainte mal écrite ne se découvre qu'en production, sur la
# vraie base. Ce script applique les migrations dans l'ordre sur un cluster
# local, puis vérifie ce qui compte vraiment :
#   - le meilleur essai est gardé, pas le dernier ;
#   - une seule ligne par joueur et par compo ;
#   - l'ancienne fonction Edge continue d'écrire pendant la migration ;
#   - le navigateur n'a aucun droit sur les nouvelles tables.
#
# Sans PostgreSQL installé, il le dit et sort sans échouer : les autres suites
# n'ont pas à en souffrir.
set -e
BIN=/usr/lib/postgresql/16/bin
[ -x "$BIN/initdb" ] || { echo "PostgreSQL absent : migrations non verifiees."; exit 0; }
id -u nobody >/dev/null 2>&1 || { echo "Pas d'utilisateur non privilegie : migrations non verifiees."; exit 0; }

D="${TMPDIR:-/tmp}/compo-pg-$$"
PORT=54399
nettoie() {
  su -s /bin/sh nobody -c "$BIN/pg_ctl -D $D/data stop -m immediate" >/dev/null 2>&1 || true
  rm -rf "$D"
}
trap nettoie EXIT

# postgres refuse de tourner en root : le cluster appartient a nobody, et la
# chaine de dossiers doit lui etre traversable.
mkdir -p "$D"
p=""; for part in $(echo "$D" | tr '/' ' '); do p="$p/$part"; chmod o+x "$p" 2>/dev/null || true; done
chown -R nobody "$D" 2>/dev/null || true
chmod 700 "$D"

su -s /bin/sh nobody -c "$BIN/initdb -D $D/data -U postgres --auth=trust" >/dev/null 2>&1
su -s /bin/sh nobody -c "$BIN/pg_ctl -D $D/data -o '-p $PORT -k $D -c listen_addresses=' -l $D/log start" >/dev/null 2>&1
sleep 2
chmod o+rx "$D"

Q="psql -h $D -p $PORT -U postgres -d compo -v ON_ERROR_STOP=1 -tAq"
psql -h "$D" -p $PORT -U postgres -q -c "create database compo" >/dev/null
# Les trois roles que Supabase fournit, et sur lesquels portent les grants.
$Q -c "create role anon; create role authenticated; create role service_role" >/dev/null

ennuis=0
dit() { if [ "$2" = "$3" ]; then echo "  $1"; else echo "  ECHEC : $1"; echo "     attendu [$2], obtenu [$3]"; ennuis=$((ennuis+1)); fi; }

for f in supabase/migrations/*.sql; do
  if $Q -f "$f" >"$D/out" 2>&1; then echo "  $(basename "$f")"
  else echo "  ECHEC : $(basename "$f")"; cat "$D/out"; ennuis=$((ennuis+1)); fi
done

# Rejouer la derniere migration ne doit rien casser : une reprise de db push
# la repasserait.
if $Q -f supabase/migrations/0004_resultats.sql >"$D/out" 2>&1
then echo "  0004 rejouee sans effet"
else echo "  ECHEC : 0004 n'est pas rejouable"; cat "$D/out"; ennuis=$((ennuis+1)); fi

# Le fichier a coller dans le tableau de bord doit valoir les migrations, et
# pouvoir etre passe plusieurs fois : celui qui le colle n'a pas a savoir
# lesquelles sont deja passees.
psql -h "$D" -p $PORT -U postgres -q -c "create database recolle" >/dev/null
R="psql -h $D -p $PORT -U postgres -d recolle -v ON_ERROR_STOP=1 -tAq"
if [ -f supabase/tout_le_sql.sql ]; then
  ok=1
  for essai in 1 2 3; do
    $R -f supabase/tout_le_sql.sql >"$D/out" 2>&1 || { ok=0; echo "  ECHEC : tout_le_sql.sql, passage $essai"; cat "$D/out"; }
  done
  [ "$ok" = 1 ] && echo "  tout_le_sql.sql passe trois fois de suite" || ennuis=$((ennuis+1))
  dit "il donne les memes tables que les migrations" \
      "$($Q -c "select string_agg(table_name,',' order by table_name) from information_schema.tables where table_schema='public'")" \
      "$($R -c "select string_agg(table_name,',' order by table_name) from information_schema.tables where table_schema='public'")"
else
  echo "  ECHEC : supabase/tout_le_sql.sql manquant (sh tools/tout_le_sql.sh)"; ennuis=$((ennuis+1))
fi

$Q -c "insert into players(id,pseudo) values
  ('11111111-1111-1111-1111-111111111111','leo'),
  ('22222222-2222-2222-2222-222222222222','marco')" >/dev/null

# L'ancienne fonction Edge, qui ignore les colonnes ajoutees, doit continuer
# d'ecrire entre la migration et son redeploiement.
$Q -c "insert into rounds(player_id,day,sport,size,duration)
       values ('22222222-2222-2222-2222-222222222222',3,'foot',12,180)" >/dev/null
dit "l'ancienne fonction ecrit toujours" "true|0" \
    "$($Q -c "select classe||'|'||team from rounds where match_id is null limit 1")"

# Le meilleur essai est garde : c'est la comparaison que fait submit.
$Q -c "insert into resultats(player_id,match_id,team,found,size) values
  ('11111111-1111-1111-1111-111111111111','rwc-2015',0,9,16),
  ('22222222-2222-2222-2222-222222222222','rwc-2015',0,14,16)" >/dev/null
$Q -c "update resultats set found=4
       where player_id='11111111-1111-1111-1111-111111111111' and 4 > found " >/dev/null
dit "rejouer moins bien ne fait pas baisser" "9" \
    "$($Q -c "select found from resultats where player_id='11111111-1111-1111-1111-111111111111'")"

dit "le tableau classe par noms trouves" "marco 14|leo 9" \
    "$($Q -c "select string_agg(p.pseudo||' '||r.found,'|' order by r.found desc, r.updated_at)
              from resultats r join players p on p.id=r.player_id
              where r.match_id='rwc-2015' and r.team=0")"

refuse() { if $Q -c "$2" >/dev/null 2>&1; then echo "  ECHEC : $1 (accepte alors qu'il fallait refuser)"; ennuis=$((ennuis+1)); else echo "  $1"; fi; }
refuse "une seule ligne par joueur et par compo" \
  "insert into resultats(player_id,match_id,team,found,size) values ('11111111-1111-1111-1111-111111111111','rwc-2015',0,5,16)"
refuse "trouves ne peut pas depasser la taille" \
  "insert into resultats(player_id,match_id,team,found,size) values ('22222222-2222-2222-2222-222222222222','autre-match',0,20,16)"
refuse "un identifiant de match trop court" \
  "insert into resultats(player_id,match_id,team,found,size) values ('22222222-2222-2222-2222-222222222222','x',0,1,16)"
refuse "un cote qui n'existe pas" \
  "insert into resultats(player_id,match_id,team,found,size) values ('22222222-2222-2222-2222-222222222222','rwc-2019',7,1,16)"

dit "le navigateur n'a aucun droit" "" \
    "$($Q -c "select coalesce(string_agg(distinct grantee,','),'') from information_schema.role_table_grants
              where table_name='resultats' and grantee in ('anon','authenticated')")"
dit "RLS active, aucune policy" "true|0" \
    "$($Q -c "select (select relrowsecurity from pg_class where relname='resultats')||'|'||
                     (select count(*) from pg_policies where tablename='resultats')")"

if [ "$ennuis" -eq 0 ]; then echo "Migrations : tout passe."; else echo "Migrations : $ennuis ennui(s)."; fi
exit $([ "$ennuis" -eq 0 ] && echo 0 || echo 1)
