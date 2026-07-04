-- ===================================================================
-- Parole Salariés By Cedmad — Compte SUPER-ADMINISTRATEUR (propriétaire)
-- ===================================================================
-- Identifiant de connexion : Cedmad   (relié à l'email cedmad@hotmail.com)
--
-- 🔐 Le mot de passe n'est JAMAIS écrit ici ni dans le code : il est saisi
--    dans Supabase et n'y est stocké que CHIFFRÉ.
--
-- ÉTAPE 1 — Créer le compte (Supabase → Authentication → Users → Add user)
--   Email    : cedmad@hotmail.com
--   Password : (celui que tu as choisi)
--   ☑ Auto Confirm User
--   Le profil « elus » est créé automatiquement (rôle par défaut : lecteur).
--
-- ÉTAPE 2 — Exécuter ce script (SQL Editor → Run) pour élever le rôle :
-- ===================================================================

update elus e
set nom = 'Cedmad',
    role = 'super_admin',
    perimetre = array(select id from etablissements)   -- tous les établissements
from auth.users u
where u.id = e.id and u.email = 'cedmad@hotmail.com';

-- Vérification (doit afficher « Cedmad | super_admin ») :
select e.nom, e.role
from elus e join auth.users u on u.id = e.id
where u.email = 'cedmad@hotmail.com';

-- ===================================================================
-- 🛡️ Anti-vol de compte — recommandé ensuite :
--   • Authentication → Providers → active la double authentification (MFA/2FA).
--   • Utilise un mot de passe long et unique (non réutilisé ailleurs).
--   • Ne partage JAMAIS la clé « service_role » (la clé « anon » est publique, elle, c'est normal).
--
-- ℹ️ Accès : le super-administrateur (Cedmad) a l'ACCÈS TOTAL, y compris
--   aux identités des demandes « confidentiel élus » (comme le référent).
--   Seule exception technique : les demandes « anonyme total » n'enregistrent
--   AUCUNE identité — il n'y a donc rien à afficher, pour personne.
-- ===================================================================
