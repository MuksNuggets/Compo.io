-- Les fonctions Edge travaillent sous le rôle service_role. Comme l'exposition
-- automatique des nouvelles tables a été désactivée à la création du projet,
-- ce rôle n'hérite d'aucun droit : il faut les lui donner explicitement.
-- Les rôles du navigateur, eux, restent dehors.

grant usage on schema public to service_role;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
