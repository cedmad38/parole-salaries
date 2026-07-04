# Journal — Parole Salariés By Cedmad

## Mise en ligne Supabase + passage en réel — 2026-07-04
**Statut : en cours**

Installation réalisée directement dans le projet Supabase de l'utilisateur (via pilotage Chrome) :
- `schema.sql` exécuté (correctif : `search_path = public, extensions` ajouté à `submit_demande`, `track_full`, `add_precision`, `seed_demande` — les fonctions pgcrypto `crypt`/`gen_salt` vivent dans le schéma `extensions` sur Supabase).
- Compte super-admin **Cedmad** créé (auth `cedmad@hotmail.com`, mot de passe saisi côté Supabase, jamais dans le code) puis élevé en `super_admin` via `superadmin.sql`. Accès total (voit aussi les identités confidentielles).
- Clé **anon publique** renseignée dans `js/config.js` → application en mode EN LIGNE.
- Tests de bout en bout contre la base réelle : **10/10** (dépôt anonyme, suivi n°/code secret, connexion Cedmad, lecture RLS, anon bloqué en lecture directe, révélation identité confidentielle).
- **Données de démo supprimées** à la demande (« on y va directement ») : toutes les demandes/établissements de démonstration effacés ; schéma, sécurité, organisation et compte Cedmad conservés. Vérif base propre : **4/4** (0 demande, 0 établissement, 1 organisation, connexion OK).

Structure réelle configurée :
- Organisation renommée « CGT Prysmian Charvieu ».
- 1 site différencié en 5 secteurs (= « établissements ») : Logistique, Production, Administration, ADV, Maintenance.
- Périmètre de Cedmad = les 5 secteurs.
- Frontend : « Établissement » relabellisé « Secteur », champ du portail transformé en liste déroulante (`config.secteurs`), libellés du tableau de bord mis à jour (Secteur / Zone-poste / Répartition par secteur).

RESTE POUR ÊTRE PLEINEMENT EN LIGNE :
- Héberger le frontend (index.html / elus.html) sur GitHub Pages (choix utilisateur) pour l'accès salarié par QR depuis leur téléphone. Aujourd'hui le frontend n'est accessible qu'en local (localhost) sur le Mac.

## Compte super-administrateur « Cedmad » — 2026-07-04
**Statut : en cours**

Accès propriétaire relié à l'email réel `cedmad@hotmail.com` (récupération + 2FA possibles).
- `js/config.js` — alias d'identifiant : « Cedmad » (sans @) → `cedmad@hotmail.com`.
- `js/elus.js` — résolution de l'alias avant connexion ; champ identifiant en type text (« Cedmad ou email »).
- `js/store.js` — compte local super_admin (u5, Cedmad) ; clé de stockage passée en `ps_data_v2` (re-seed auto). Mot de passe LOCAL = demo1234 (le vrai mot de passe n'est jamais écrit dans le code).
- `supabase/superadmin.sql` — élève `cedmad@hotmail.com` en `super_admin` après création du compte dans Supabase (mot de passe saisi côté Supabase, stocké chiffré).

Sécurité : mot de passe jamais en clair dans les fichiers ; recommandations anti-vol (2FA, mot de passe unique, ne pas partager la clé service_role) documentées dans superadmin.sql.
Vérifié : `node --check` OK ; test connexion « Cedmad » super-admin en local **5/5** (alias, connexion, rôle, refus mauvais mot de passe).

## Branchement des écrans sur Supabase (façade async) — 2026-07-04
**Statut : en cours**

Projet Supabase de l'utilisateur créé (région West EU / Paris — RGPD). URL renseignée dans `js/config.js` (`https://glcezsiyumbupzyzcdmb.supabase.co`) ; il reste à coller la clé anon.

- `js/data.js` (nouveau) — façade de données async `PS.data` : bascule automatique local ↔ Supabase selon `config.js`. Instantané (snapshot) pour garder les écrans élus simples ; identité protégée chargée à la demande.
- `js/api.js` — ajout des chargements groupés `messagesAll`/`actionsAll`/`reponsesAll`.
- `js/salarie.js` — dépôt, suivi et précisions passés en async via `PS.data` (bouton d'envoi avec état + gestion d'erreur).
- `js/elus.js` — réécrit pour lire via l'instantané `PS.data` et écrire en async (login Supabase, révélation d'identité asynchrone et journalisée, périmètre géré par la RLS en ligne). Fonctionnalités inchangées.
- `index.html` / `elus.html` — chargent supabase + config + api + data.
- `service-worker.js` — cache v3 (+ data.js).

Vérifications : `node --check` OK sur les 9 fichiers JS ; test de flux façade en mode local **11/11** (dépôt, snapshot, stats, login, confidentialité par rôle, suivi) ; tous les fichiers servis 200.

Prochaine étape (utilisateur) : exécuter `supabase/schema.sql` puis `supabase/seed.sql`, créer les 4 comptes de test, coller la clé anon dans `js/config.js` → test du flux réel téléphone → base → Mac. Le mode local reste fonctionnel entre-temps.

## Backend Supabase + structure « deux PWA » — 2026-07-04
**Statut : en cours**

Architecture demandée : espace élus = PWA installable sur Mac (Dock + fenêtre indépendante) ET navigateur ; portail salarié séparé (QR, sans installation) ; base Supabase commune sécurisée.

Backend Supabase préparé (à exécuter dans le projet de l'utilisateur) :
- `supabase/schema.sql` — modèle §15 (tables), RLS complète (§8 périmètres, §9), identité protégée dans une table VERROUILLÉE (accès uniquement via `reveal_identity`, journalisé), fonctions salarié anonymes contrôlées (`submit_demande`, `track_status`, `track_full`, `add_precision`), code secret HASHÉ (pgcrypto), création auto du profil élu à l'inscription.
- `supabase/seed.sql` — organisation + 3 établissements + 7 demandes de démo + attribution des rôles/périmètres aux 4 comptes de test.
- `SETUP_SUPABASE.md` — guide débutant pas à pas (compte, région UE, SQL, comptes, clés, test, installation Mac).

Code adapté (prêt à brancher) :
- `js/vendor/supabase.min.js` — client Supabase vendu localement (offline).
- `js/config.js` — SEUL fichier à éditer (URL + clé anon) ; bascule auto local ↔ en ligne.
- `js/api.js` — pilote Supabase asynchrone, même forme que `store.js`.

Structure PWA :
- `elus.webmanifest` — app élus autonome (display standalone, id dédié).
- `manifest.webmanifest` — id dédié pour le portail salarié.
- `elus.html` — lien manifest, enregistrement service worker, bouton « Installer l'application » (Chrome/Edge) + indice « Ajouter au Dock » (Safari).
- `service-worker.js` — cache v2 incluant les nouveaux fichiers.

Vérifications : `node --check` OK (config.js, api.js) ; logique locale toujours verte (tests Node) ; les 12 fichiers clés (dont schema.sql, seed.sql, supabase.min.js, elus.webmanifest) répondent 200.

RESTE À FAIRE (prochaine étape, avec test réel) : brancher les écrans (`salarie.js`, `elus.js`) sur `PS.api` via une façade async, une fois le projet Supabase créé par l'utilisateur — pour vérifier le flux de bout en bout en conditions réelles. Le mode local reste fonctionnel entre-temps.


## Création du MVP complet (portail salarié + espace élus) — 2026-07-03
**Statut : en cours**

Application développée d'après le cahier des charges `Parole_Salaries_By_Cedmad_Cahier_des_charges_Claude.docx`.
Choix d'architecture : application web PWA autonome (vanilla JS, sans build), conforme au §13 (portail installable PWA + tableau de bord). Persistance locale (localStorage) pour le MVP — à remplacer par une API + base chiffrée en production (voir ARCHITECTURE.md).

Fichiers créés :
- `assets/` — logo fourni (`logo.png`) + icônes PWA 192/512/180 générées.
- `js/vendor/qrcode.min.js` — librairie QR vendue localement (accès portail par QR code).
- `css/styles.css` — design system partagé (palette bleu profond/clair/blanc + accent orange, identité dégradé du logo, WCAG AA).
- `css/portal.css` — mise en page du portail salarié (mobile-first).
- `js/store.js` — couche de données (§15) : entités, référentiels (types, catégories, statuts, rôles, confidentialité), identité protégée stockée séparément, journalisation, stats anonymisées, comptes de test, données de démo.
- `js/assistant.js` — moteur d'assistance déterministe (§3.3, §5) : questions contextuelles, suggestion de catégorie, résumé, 7 formulations, garde-fous §5.3.
- `js/export.js` — exports Word/PDF/copie (§7), version anonymisée vs complète.
- `js/ui.js` — helpers UI partagés (toast, DOM, formats).
- `index.html` + `js/salarie.js` — portail salarié : accueil, type, rédaction, assistant, confidentialité (4 niveaux), validation, code de suivi, suivi, pages confidentialité/urgence.
- `manifest.webmanifest` + `service-worker.js` — PWA installable, offline shell.

Espace élus créé :
- `css/elus.css` + `elus.html` + `js/elus.js` — login (4 comptes de test), tableau de bord (§4.1), liste filtrable, fiche complète (§4.2), actions §4.3, assistant de formulation 7 formats (§5), réunions + exports Word/PDF/copie (§7), statistiques anonymisées + seuil (§6.2), QR code du portail, journal (§9), administration.
- Périmètre par établissement : accès hors périmètre refusé + journalisé (§17).

Documentation :
- `README.md` — installation locale, comptes de test, fonctions, limites MVP.
- `ARCHITECTURE.md` — architecture cible, modèle de données §15, sécurité §9, liste des points à valider juridiquement/techniquement (§18).

Vérifications effectuées :
- `node --check` OK sur les 6 fichiers JS.
- Harness de tests §17 (Node) : **26/26 réussis** — anonymat, code de suivi vs code secret, confidentialité par rôle/niveau, fusion conservant les originaux, journalisation, stats/seuil, garde-fous assistant §5.3.
- Serveur statique : les 17 fichiers référencés répondent 200 (aucun chemin cassé).

Note : la vérification via navigateur (Preview) n'était pas disponible dans cette session ; validation faite par tests Node + contrôle des chemins servis.
