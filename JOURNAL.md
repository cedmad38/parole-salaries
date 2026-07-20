# Journal — Parole Salariés By Cedmad

## Nouvelle carte « Version Élu » sur la fiche demande — 2026-07-19
**Statut : en cours**

Demande utilisateur : pouvoir reformuler soi-même une question (à partir de
plusieurs échanges, librement), en plus des 7 formulations générées par
l'IA — et pouvoir choisir cette version pour la réunion comme les autres.

Ajouté sur la fiche demande, une nouvelle carte « ✍️ Version Élu » à côté de
l'assistant de formulation IA :
- Un champ texte vide au départ (jamais généré par l'IA), modifiable par
  n'importe quel élu ayant les droits d'édition.
- Bouton **Enregistrer** : sauvegarde le texte sur la demande (nouveau champ
  `elu_formulation`), visible par tous les élus qui ouvrent la fiche.
- Bouton **→ Réunion** : enregistre puis choisit cette version pour la
  réunion, avec le même mécanisme que les formulations IA (un seul choix
  actif à la fois par demande — choisir la Version Élu retire automatiquement
  toute formulation IA précédemment choisie, et inversement via « Retirer de
  la réunion »).

Nécessite une nouvelle colonne `elu_formulation` sur `demandes` (migration
appliquée en direct sur Supabase). Champ mappé dans `js/api.js`
(`mapRow` + `updateDemande`) ; `js/store.js` n'a rien nécessité de
particulier car `updateDemande` y fusionne déjà n'importe quel champ.

## Export réunion : le titre affichait encore la question de base — 2026-07-19
**Statut : en cours**

Retour utilisateur (capture du .doc généré) : le corps du texte affichait bien
la formulation choisie (ex. Version CSSCT), mais le TITRE de chaque section
(`<h2>`) affichait toujours la question brute d'origine du salarié. Cause :
`js/export.js` utilisait `d.resume || q.format` pour le titre — `resume`
correspond souvent au texte brut, jamais à la formulation retenue. Une
première correction a introduit un titre tronqué dérivé de `q.texte`, mais
retour utilisateur immédiat : il ne voulait aucun doublon ni aucune méta
(pas de réf, pas de catégorie, pas d'établissement, pas de « Formulation
retenue » ni de citation en double) — juste la question entière et
complète, numérotée, et rien d'autre. `buildHTML` et `toClipboard` ne
produisent plus qu'une ligne par question : « N. [texte intégral de la
formulation choisie] ». Toutes les méta-informations (réf, catégorie,
priorité, établissement, identité) ont été retirées de l'export.

Retour utilisateur immédiat (encore) : même la ligne d'en-tête « Questions de
réunion · Généré le [date] · Version anonymisée à communiquer » était de
trop. Retirée du document Word/PDF — il ne reste que le titre « Parole
Salariés By Cedmad » suivi directement des questions numérotées.

## Réunions : retrait des demandes brutes automatiques — 2026-07-19
**Statut : en cours**

Retour utilisateur sur la section « Nouvelles demandes à présenter » ajoutée
précédemment (statut « Nouvelle » automatique) : non souhaitée. Retirée
entièrement — l'onglet Réunions ne contient plus désormais QUE les questions
explicitement choisies par un élu (formulation, texte original, ou action de
suivi via « → Réunion »), plus jamais de demande brute affichée d'office.

## Choix de formulation pour les réunions + corrections — 2026-07-19
**Statut : en cours**

Quatre points corrigés suite à un retour utilisateur :

1. **Texte original du salarié envoyable en réunion.** Jusqu'ici seules les
   7 formulations IA avaient un bouton « → Réunion » ; le texte brut n'en
   avait pas. Ajouté, avec le même mécanisme de choix que les formulations.

2. **« Réponse insuffisante » compte maintenant dans « En attente de
   réponse »** sur le tableau de bord (auparavant seul « Transmise à la
   direction » comptait — un dossier avec une réponse jugée insuffisante
   disparaissait à tort des compteurs).

3. **Une seule formulation choisie par demande pour la réunion.** Avant,
   cliquer « → Réunion » sur plusieurs formulations de la même demande les
   empilait toutes. Maintenant, choisir une formulation (ou le texte
   original) **remplace** le choix précédent pour cette demande — jamais
   plus d'une à la fois. Un bouton « Retirer de la réunion » permet
   d'annuler le choix. Nécessite une nouvelle policy RLS (`qr_delete`,
   absente jusqu'ici — sans elle, aucune suppression n'était possible côté
   base).

4. **Bug corrigé : le fichier exporté contenait le texte original même
   quand une formulation IA précise avait été choisie.** Cause : l'export
   reconstruisait son contenu à partir de la demande elle-même
   (`texteBrut`), pas de la formulation réellement sélectionnée
   (`questions_reunion.texte`) — la sélection de l'élu était silencieusement
   ignorée. `js/export.js` prend désormais directement le texte choisi.
   Effet de bord positif : l'ancien code dédoublonnait aussi par demande,
   perdant toute deuxième ligne (ex. une formulation + une action de suivi
   sur la même demande) ; ce n'est plus le cas, chaque élément choisi
   apparaît sur sa propre ligne dans l'export.

Vérifié : syntaxe validée (`node --check`) sur tous les fichiers touchés.
Bug additionnel repéré et corrigé au passage : `badge(..., 'ok')` sur la
carte Archives ne correspondait à aucune classe CSS (`.badge-success`
existe, `.badge-ok` non) — rendu sans couleur, corrigé.

## Onglet Archives + Échéances allégée — 2026-07-16
**Statut : en cours**

Réorganisation demandée : les actions de suivi doivent rester visibles dans
Échéances tant qu'elles ne sont pas faites (jamais masquées derrière un
« Afficher »), puis basculer dans un nouvel onglet **Archives** une fois
clôturées — avec, en dessous, les demandes elles-mêmes clôturées/résolues.

- **Échéances** : ne montre plus que les actions actives, triées par
  urgence. Le bloc « Faites » repliable a disparu — une action marquée
  faite quitte directement la vue au lieu de rester cachée dedans.
- **Nouvel onglet Archives** : deux sections — « Actions de suivi faites »
  en haut, « Demandes clôturées » (statuts Clôturée/Archivée/Résolue) en
  bas. Le KPI « Faites » d'Échéances et celui des Statistiques pointent
  maintenant vers Archives.
- Gabarit de ligne d'action factorisé (`actionRow`) pour éviter la
  duplication entre Échéances et Archives.

Vérifié : syntaxe validée (`node --check`). Pas de serveur de prévisualisation
local disponible cette fois — à tester en ligne après déploiement.

## Suppression du Journal + flux automatique pour les réunions — 2026-07-16
**Statut : en cours**

Le Journal (§9, historique brut des actions) a été jugé peu utile au quotidien
et retiré **entièrement** — menu, vue, table en base et tout le code qui
l'alimentait — à la demande explicite de l'utilisateur (choix éclairé :
option « retirer du menu seulement, garder les données » proposée et
refusée).

**Suppression complète :**
- Table `journal` supprimée en base (+ ses policies), plus aucun insert nulle
  part : 4 fonctions Postgres (`submit_demande`, `add_precision`,
  `reveal_identity`, `delete_demande`) redéployées sans les insertions
  journal, edge function `classify-demande` idem.
- Code client (`js/api.js`, `js/store.js`, `js/data.js`, `js/elus.js`) :
  fonctions `logAction`/`log()`, tous leurs appels, la vue « Journal » et
  l'entrée de menu retirés.
- Un vrai bug latent corrigé au passage : `openFiche()` (mode local) et le
  bouton « Enregistrer » des paramètres organisation appelaient encore
  `store.log(...)`, qui aurait planté après la suppression de cette fonction.

**Nouveau flux pour les réunions (remplace l'usage du Journal comme pense-bête) :**
- Les **nouvelles demandes** apparaissent désormais automatiquement dans
  « Préparation des réunions » (statut « Nouvelle »), sans action manuelle —
  elles sortent seules de la liste dès qu'un élu change leur statut.
  Complète la vue « Réunions » existante (questions ajoutées depuis les
  fiches), qui reste inchangée.
- Les **actions de suivi** (vue Échéances), elles, doivent être ajoutées
  manuellement à la réunion via un nouveau bouton « → Réunion » sur chaque
  action en attente — pas d'automatisme ici, l'élu choisit lesquelles sont
  prêtes à être présentées.

Vérifié : syntaxe validée sur les 4 fichiers JS + l'edge function (aucune
référence résiduelle à `journal`/`logAction`/`_logAction` dans tout le
dépôt). Migration SQL confirmée en base (table absente). Edge function
redéployée et confirmée en ligne (longueur du fichier vérifiée avant/après
injection). Pas de vérification visuelle en direct de la nouvelle UI
Réunions/Échéances cette fois (pas de compte élu de test disponible dans
cette session) — à confirmer par l'utilisateur.

## Correction définitive du cache navigateur figé — 2026-07-16
**Statut : validé**

Cause racine trouvée du problème récurrent « je ne vois pas la mise à jour »
après un déploiement (déjà rencontré avec le secteur Laboratoire, puis en
essayant de corriger le secteur oublié d'une demande) : le service worker
disait bien « réseau d'abord », mais son `fetch()` respectait quand même le
cache HTTP natif du navigateur (`max-age=600` envoyé par GitHub Pages) — une
réponse pouvait donc être servie « pas assez fraîche » sans jamais retoucher
le réseau.

- `service-worker.js` : ajout de `{ cache: 'no-store' }` sur le fetch réseau,
  qui force désormais un vrai aller-retour serveur à chaque requête,
  indépendamment du cache HTTP du navigateur.
- `CACHE` passé à `v6` pour forcer l'installation du nouveau service worker.

Correctif définitif, pas une consigne à refaire manuellement à chaque
déploiement : plus besoin de vider le cache/réinstaller l'app après une mise
à jour. Le fichier `service-worker.js` lui-même reste soumis aux mécanismes
de mise à jour propres du navigateur (vérification à chaque navigation ou au
plus toutes les 24h) — un premier chargement après ce déploiement peut donc
encore nécessiter un simple rechargement, mais plus jamais après.

## Statistiques en camembert coloré — 2026-07-16
**Statut : en cours**

Les cartes « Sujets les plus fréquents » et « Répartition par secteur » de la
page Statistiques passent de barres à un camembert coloré (conic-gradient CSS,
sans librairie externe) avec légende (couleur, libellé, valeur + %).

- Même règle d'anonymisation que le reste de la page : une valeur en dessous
  du seuil est masquée dans la légende (« ••• »), la part du camembert reste
  visible en taille réelle (même principe déjà appliqué aux barres et à la
  heatmap : la magnitude reste visible, le chiffre exact est masqué).
- « Évolution par mois » reste en barres (un camembert n'a pas de sens pour
  une tendance dans le temps).

Vérifié : syntaxe validée (`node --check`). Pas de vérification visuelle en
direct possible cette fois (connecteur navigateur indisponible pendant la
session) — à confirmer visuellement par l'utilisateur.

## Secteur modifiable manuellement sur une demande — 2026-07-16
**Statut : validé**

Nouveau champ « Secteur » dans la carte Actions de la fiche demande — pour
corriger le secteur quand le salarié l'a oublié (notamment via « Question
rapide », qui n'impose pas cette étape).

- Menu déroulant alimenté par les établissements réels de l'organisation.
- Un élu gestionnaire ne voit et ne peut choisir que dans **son propre
  périmètre** ; référent/admin/super-admin voient tous les secteurs.
  Cohérent avec la règle déjà en place côté base (RLS) qui refuserait de
  toute façon l'écriture d'un secteur hors périmètre.
- Message d'erreur clair si l'enregistrement échoue (ex. droit refusé),
  au lieu d'un échec silencieux.

## Comparaison inter-secteurs (Statistiques) — 2026-07-16
**Statut : en cours**

Nouvelle carte « Comparaison par secteur » sur la page Statistiques : un
tableau croisé secteur × catégorie (heatmap), pour repérer d'un coup d'œil
quel secteur remonte le plus tel type de problème et prioriser où porter
l'effort syndical.

- Secteurs triés par volume total décroissant, catégories triées pareil.
- Intensité de couleur proportionnelle à la valeur de la cellule.
- Mêmes règles d'anonymisation que le reste de la page Statistiques : une
  cellule en dessous du seuil anti-réidentification est masquée (« ••• »),
  jamais affichée en clair.

Vérifié : gabarit HTML testé avec des données simulées (tri, masquage,
intensité de couleur), rendu visuel confirmé en local. Pas de compte élu
disponible dans cette session pour un test en conditions réelles complet.

## Ajout du secteur « Laboratoire » — 2026-07-09
**Statut : validé**

Secteur oublié à la création de l'organisation. Ajouté aux deux endroits
nécessaires (le commentaire de `js/config.js` précise que les deux doivent
rester synchronisés) :
- Table `etablissements` en base (pour l'affectation de périmètre aux élus).
- Liste `window.PS.config.secteurs` (menu déroulant proposé au salarié).

Liste finale des secteurs : Logistique, Production, Administration, ADV,
Maintenance, Laboratoire. Vérifié dans le menu « Question rapide ».

## Alerte email personnelle à l'arrivée d'une demande — 2026-07-09
**Statut : en cours**

Cedmad reçoit désormais un email dès qu'une nouvelle demande est déposée par un
salarié — pour pouvoir réagir vite sans avoir à surveiller le tableau de bord.

- Envoi via Resend (service gratuit, ~3000 emails/mois offerts) depuis l'edge
  function `classify-demande`, qui tournait déjà à chaque nouvelle demande.
  Clé `RESEND_API_KEY` en secret Supabase, jamais côté navigateur.
- **Uniquement à vous** (cedmad@hotmail.com) — jamais aux autres élus, qui ne
  configurent rien et ne reçoivent rien.
- **Uniquement au premier dépôt** de la demande, jamais sur une relance IA
  manuelle (sinon vous recevriez un email à chaque clic sur « Régénérer »).
- Best-effort : si l'envoi échoue (service indisponible, quota…), la
  classification IA continue normalement — l'email n'est jamais bloquant.

Testé : appel direct à l'API Resend confirmé (email accepté, HTTP 200) ; demande
de test réelle vérifiée en base (classification IA toujours fonctionnelle après
l'ajout du code d'envoi). Donnée de test nettoyée.

## Vue « Échéances » (§4.3) — 2026-07-08
**Statut : en cours**

Nouvel onglet dédié « 📅 Échéances » dans l'espace élus : regroupe toutes les actions
de suivi (engagements pris sur une demande — libellé, responsable, échéance) de tout
le périmètre, sur un seul écran, triées par urgence :
- **⏰ En retard** (échéance dépassée), **🟠 Bientôt** (< 7 jours), **🗓️ À venir**,
  **sans échéance**, puis **faites** (repliées par défaut).
- Chaque ligne pointe vers la fiche de la demande d'origine, et peut être marquée
  « Fait » / rouverte en un clic (nouvelle fonction `updateAction`, jusqu'ici les
  actions ne pouvaient qu'être créées, jamais modifiées ni closes).
- Badge sur le menu (nombre d'actions en retard) et sur le KPI « Engagements échus »
  des statistiques, qui pointait vers une liste générique jusqu'ici.

Aucune migration de base nécessaire (table `actions_suivi` et droits déjà en place).
Logique de tri/urgence et gabarit HTML vérifiés avec des données simulées (pas de
compte élu disponible dans cette session pour un test en conditions réelles complet).

## Détection de doublons via IA (§6.2) — 2026-07-07 / 2026-07-08
**Statut : en cours** (déployé et testé en ligne — en attente de validation)

Ajout (2026-07-08) : la carte dédiée sur la fiche demande n'était visible qu'en ouvrant
chaque dossier un par un. Ajout de deux repères pour les repérer sans naviguer partout :
- Badge « 🔗 doublon possible » directement sur la carte de chaque demande, dans la liste
  des demandes et dans « Dernières demandes » du tableau de bord.
- Nouvelle carte « 🔗 Doublons potentiels détectés par l'IA » sur le tableau de bord,
  listant en un coup d'œil toutes les demandes non closes concernées, cliquables vers
  leur fiche (n'apparaît que s'il y en a au moins une).

À chaque classification automatique (dépôt d'une nouvelle demande ou relance manuelle
super-admin), l'IA compare désormais le sujet de la demande aux demandes existantes non
closes (30 plus récentes) et signale celles qui semblent concerner la même situation
concrète — jamais une simple même catégorie.

- Nouveau champ `ia_doublons` (jsonb) sur `demandes`, rempli par l'edge function
  `classify-demande` : tableau de `{ public_ref, raison }`.
- Garde-fous : suggestion uniquement, **aucune fusion automatique** ; en cas de doute
  l'IA ne signale rien ; toute référence renvoyée qui ne correspond pas à une demande
  réellement fournie dans le prompt est filtrée côté serveur (protection anti-hallucination) ;
  l'IA ne prétend jamais qu'il s'agit du même salarié, seulement du même sujet.
- Côté élus : nouvelle carte « 🔗 Doublons potentiels » sur la fiche demande (visible
  uniquement si l'IA a signalé quelque chose), avec lien « Voir le dossier » et bouton
  « Regrouper » (réutilise le regroupement existant, réservé aux rôles habilités à éditer).

Testé en conditions réelles : deux demandes de test volontairement similaires (panne
récurrente d'un même monte-charge) → la seconde a correctement été liée à la première
avec une raison pertinente ; référence IA vérifiée non hallucinée. Gabarit HTML de la
carte élus vérifié directement (échappement correct, boutons présents). Données de test
nettoyées (demandes + entrées journal).

## Bouton « Question rapide » (portail salarié) — 2026-07-06
**Statut : en cours**

Nouveau premier bouton de l'accueil salarié : un parcours minimal en un seul écran —
texte de la question + choix du secteur + Envoyer, sans aucune autre étape (pas de
type, pas de questions de l'assistant, pas d'écran de confidentialité séparé, pas de
récapitulatif). Objectif : le salarié qui ne veut pas se prendre la tête peut poser sa
question en quelques secondes.

- Toujours **anonyme total** (aucune identité demandée) — affiché clairement dans un
  bandeau avant l'envoi, pour rester transparent malgré l'absence d'étape dédiée (§3.4).
  Un renvoi vers « Poser une question » est proposé pour qui veut être identifié·e,
  préciser des détails ou joindre un document.
- Réutilise le même chemin d'envoi (`PS.data.createDemande`) que le parcours complet :
  la classification automatique par IA (Gemini) se déclenche donc aussi pour les
  questions rapides.
- Écran de confirmation (numéro de suivi + code secret) inchangé.

Testé en conditions réelles : **6/6** — anonymat respecté (aucune ligne dans `identites`),
secteur correctement lié, classification IA automatique fonctionnelle (ex. « Conditions
matérielles » suggérée correctement pour un micro-ondes en panne). Donnée de test nettoyée.

## Classification & formulations générées par IA (Gemini) — 2026-07-06
**Statut : en cours**

Intégration d'une vraie IA (Google Gemini, gratuit) pour classer automatiquement chaque
demande et proposer des formulations dès son arrivée, sans exposer aucune clé côté navigateur.

- **Architecture** : nouvelle Supabase Edge Function `classify-demande` (Deno). La clé
  `GEMINI_API_KEY` est stockée **uniquement** comme secret de la fonction (jamais dans le
  code, jamais commit sur GitHub, jamais visible côté client).
- **Déclenchement automatique** : dès qu'un salarié dépose une demande (`api.js
  createDemande`), la classification IA se lance en tâche de fond (fire-and-forget),
  sans bloquer ni ralentir la confirmation affichée au salarié.
- **Garde-fous embarqués dans le prompt** (§5.3/§9) : n'utilise que les faits fournis,
  marque « [à préciser] » ce qui manque plutôt que de l'inventer, ne qualifie jamais
  automatiquement harcèlement/discrimination/danger grave, catégorie strictement limitée
  à la liste fermée (18 valeurs, revérifiée côté serveur), style **court et humain**
  (1 à 3 phrases, pas de ton robotique).
- **Sortie structurée** : `responseSchema` Gemini garantit un JSON fiable (catégorie,
  confiance, 7 formulations : courte/développée/CSSCT/CSE/relance/chiffrée/centrale).
- **Relance manuelle réservée à Cedmad (super-admin) uniquement** : le bouton
  « 🔄 Régénérer avec l'IA » n'apparaît que pour le super-administrateur (côté client
  ET revérifié côté serveur via le rôle dans la table `elus`) — protège le quota gratuit
  partagé d'un usage excessif par les autres élus.
- **Résultat affiché** dans la fiche demande : badge « ✨ IA · Gemini », niveau de
  confiance, formulations marquées individuellement « IA » quand générées par le modèle
  (repli automatique sur le système déterministe existant si l'IA n'a pas encore traité
  ou est indisponible).
- Migration DB : colonnes `ia_formulations` (jsonb), `ia_categorie_confiance`, `ia_traite_at`.

**Incident résolu pendant le déploiement** : le copier-coller (presse-papier macOS) vers
l'éditeur Supabase corrompait les caractères accentués (mojibake UTF-8→MacRoman, ex.
« appliquée » → « appliqu√©e »). Contournement : injection du code directement via
`monaco.editor.setValue()` en JavaScript (bytes UTF-8 corrects, vérifié caractère par
caractère) plutôt que par le presse-papier. Risque identifié : les tout premiers scripts
SQL collés en tout début de session ont pu subir la même corruption dans des commentaires
ou libellés — impact réel nul (données de démo depuis supprimées, aucune donnée
fonctionnelle actuelle affectée), mais à garder en tête pour tout futur collage de texte
accentué dans l'éditeur Supabase.

**Modèle** : `gemini-2.0-flash` avait un quota gratuit à 0 sur la clé fournie (erreur
Google explicite « limit: 0 ») → basculé sur `gemini-2.5-flash`, qui dispose d'un vrai
quota gratuit (vérifié par tests directs). Redéfinissable via le secret `GEMINI_MODEL`
si besoin.

Tests réels effectués (bout en bout, sur la vraie base) : **6/6** — classification
correcte (« Risque sécurité », confiance élevée), formulation courte et naturelle (95
caractères, aucun fait inventé), un anonyme ne peut pas forcer un nouveau traitement
(quota protégé), Cedmad (super-admin) peut forcer une relance. Données de test nettoyées
après vérification.

## Rôle super-administrateur verrouillé — 2026-07-05
**Statut : en cours**

Dans Administration → Gestion des élus, le rôle **super-administrateur** est désormais **verrouillé** : sélecteur désactivé, figé sur « Super-administrateur technique » pour tout compte ayant ce rôle (aujourd'hui : Cedmad, seul concerné). Effet de bord voulu : ce rôle a aussi été retiré des options proposées pour les AUTRES élus — impossible de promouvoir quelqu'un « super-admin » depuis cette interface (seule la procédure manuelle documentée dans `supabase/superadmin.sql` le permet). Protège contre une démotion ou une promotion accidentelle. Vérifié dans le navigateur : sélecteur `disabled`, une seule option pour Cedmad ; option `super_admin` absente pour les autres élus.

## Adaptation mobile (espace élus + portail) — 2026-07-05
**Statut : en cours**

Test réel en vue téléphone (375px) via Chrome preview, deux bugs critiques trouvés et corrigés :
- **Barre du haut de l'espace élus débordait** (509px sur un écran de 375px), forçant **toute la page** à défiler horizontalement — le pire bug mobile possible. Cause : `.elus-topbar` en flex sans wrap, avec nom/rôle + 3 boutons sur une seule ligne impossible à faire tenir. Corrigé : restructuration en `.topbar-actions` (nom/rôle en pleine largeur, boutons en icônes seules avec `<span class="lbl">` masqué sous 640px, `flex-wrap` sur le conteneur). Vérifié : 0 débordement (375=375), rendu intact en tablette (768px, labels complets) et desktop (1280px, barre latérale).
- **Bouton flottant "Installer l'application" chevauchait le contenu** en bas de chaque page sur mobile (grand bandeau texte fixe). Corrigé : classe `.pwa-install-btn` (au lieu de style inline), devient un petit rond icône-seule sous 640px + `padding-bottom` ajouté à `.elus-main` pour ne plus jamais couvrir la dernière carte.
- Portail salarié : champs "Secteur" / "Zone-poste" trop serrés côte à côte sur petit écran (texte tronqué) → empilés en pleine largeur sous 420px.
- Reste du portail salarié et de l'espace élus (fiche demande, formulations, gestion des élus, détail des rôles) déjà bien adaptés — vérifiés sans changement nécessaire.

## Suppression étendue au référent + repères juridiques par demande — 2026-07-05
**Statut : en cours**

- **Suppression des demandes farfelues étendue au référent confidentiel** (en plus d'admin/super-admin) : `canDelete()` (elus.js) + fonction `delete_demande` (schema.sql, migrée en live) + bloc « Détail des rôles » mis à jour. Testé en conditions réelles : le référent supprime ✅, l'élu gestionnaire reste bloqué ✅ (5/5).
- **Nouveau module `js/legal.js`** : repères du Code du travail (et Code pénal ponctuellement) par catégorie de demande — références écrites à la main (jamais générées/inventées), avec avertissement systématique « à titre indicatif, non exhaustif, ne remplace pas une analyse juridique » (cohérent avec les garde-fous §5.3/§9). Nouvelle carte « 📚 Repères juridiques » dans la fiche demande, entre le texte original et l'assistant de formulation. Testé : 17/17 catégories couvertes (dont génériques CSE/CSSCT/Autre).
- Découverte en testant : **2 vrais élus se sont déjà auto-inscrits** via la fonctionnalité (david.contet72@gmail.com, o.enrique38@gmail.com) — comptes en attente de validation, à traiter par l'utilisateur dans Administration → Gestion des élus.
- Nettoyage : 5 comptes de test créés pour la vérification supprimés via le dashboard Supabase (les 2 vrais comptes élus et 1 demande de test de l'utilisateur non touchés).

## Comptes élus : auto-inscription, mot de passe oublié, détail des rôles — 2026-07-04
**Statut : en cours**

- **Auto-inscription avec validation (§8)** : un élu peut créer son compte (écran « Créer un compte élu ») ; rôle par défaut `en_attente` (migration DB : défaut + contrainte + trigger). Aucun accès (RLS) tant qu'un admin ne lui attribue pas un rôle réel. Écran « compte en attente de validation » après connexion.
- **Mot de passe oublié** : lien self-service sur l'écran de connexion (email Supabase) ; l'admin peut aussi envoyer un lien par élu ; bouton « 🔑 Mot de passe » dans la barre du haut ; écran « nouveau mot de passe » sur détection de `PASSWORD_RECOVERY`.
- **Config Auth Supabase** : Site URL + Redirect URLs (GitHub Pages + localhost:8000).
- **Écran de connexion** : suppression des boutons « Comptes de test » (démo). `demoAccounts()` retiré.
- **Administration → détail des rôles** : bloc dépliable décrivant, pour chaque rôle, ce qu'il peut / ne peut pas faire (cohérent avec canEdit/canDelete/identityFor + RLS).
- Tests locaux : régression 4/4, gestion élus 5/5. Rôle par défaut `en_attente` confirmé côté base.

✅ Déploiement GitHub Pages RÉSOLU : la file était bloquée (runs coincés en « queued » ~30 min, côté GitHub — pas notre code). Débloqué en annulant les runs coincés puis en repoussant : le run frais a réussi en ~40 s. Site public à jour et vérifié (détail des rôles, comptes démo retirés, auto-inscription, mot de passe oublié, bouton supprimer, SW v5).
Limite emails Supabase (SMTP intégré) : **2 emails/h** (verrouillé, lu sur la page Rate Limits). Résolu pour l'inscription : **« Confirm email » désactivé** dans Supabase → l'auto-inscription n'envoie plus d'email (inscriptions illimitées) ; la validation admin par attribution de rôle reste le contrôle de sécurité. Message d'inscription de l'app mis à jour en conséquence.
Reste limité par le quota 2/h : le « mot de passe oublié » (rare ; sinon reset par l'admin dans Supabase, 0 email). Pour un usage à grande échelle des emails → brancher un SMTP dédié gratuit (Brevo/Resend).

## Gestion des élus, refresh, cache & retouches — 2026-07-04
**Statut : en cours**

- **Cache PWA** : passage du service worker en « réseau d'abord » (v5) → les mises à jour s'affichent immédiatement (c'était la cause du « je ne vois pas le bouton Supprimer »).
- **Gestion des élus** (Administration) : attribuer rôle + secteurs, activer/désactiver un compte (bloque la connexion). Colonne `email` ajoutée sur `elus` + trigger + backfill. `listElus`/`updateElu` (api/data/store). Test live 3/3 (Cedmad lit, anon bloqué).
- **Comptes** : création / suppression définitive / réinitialisation de mot de passe via lien vers Supabase Auth (le plus sûr) ; le rôle se règle dans l'app.
- **Portail salarié** : lien « Espace élus » retiré du pied de page.
- **Bouton « ↻ Actualiser »** dans le tableau de bord (voir les nouvelles demandes en direct).
- `super_admin` ajouté à `canEdit`.
- Tests locaux : gestion élus 5/5. Poussé sur GitHub, site redéployé et vérifié (marqueurs présents en ligne).

⚠️ Pour voir la mise à jour côté navigateur : **recharge en forçant** (Cmd+Maj+R) une fois. Ensuite les màj suivantes s'afficheront normalement.

## Suppression des demandes farfelues/spam — 2026-07-04
**Statut : en cours**

- Fonction `delete_demande(uuid)` (schema.sql) : sécurité definer, réservée `admin_cse`/`super_admin`, journalisée, cascade sur les données liées. Installée dans la base live.
- **Bug de sécurité détecté et corrigé par les tests** : `role NULL not in (...)` vaut NULL en SQL → le garde-fou ne bloquait pas un appel anonyme. Corrigé avec `if v_role is null or v_role not in (...)`. Re-test : anon **bloqué** ✓, Cedmad supprime ✓, tracé au journal sous « Cedmad » ✓.
- Frontend : bouton « 🗑️ Supprimer la demande » sur la fiche (admin/super-admin), confirmation + toast. `super_admin` ajouté aux droits d'édition (`canEdit`). `deleteDemande` dans api.js / data.js / store.js.
- Poussé sur GitHub → site redéployé.

Note : 1 demande de test déposée par l'utilisateur via le portail live (PS-2026-4656) — conservée, à supprimer par l'utilisateur avec le nouveau bouton.

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

Hébergement GitHub Pages — EN LIGNE :
- Dépôt public : https://github.com/cedmad38/parole-salaries (compte cedmad38).
- Site en ligne : https://cedmad38.github.io/parole-salaries/
  - Portail salarié : .../index.html (accès QR, sans compte)
  - Espace élus : .../elus.html (connexion Cedmad)
- Vérifié : tous les fichiers servis en 200 (https), config en mode en ligne.
- Aucun secret publié (seule la clé anon, publique par nature).

⚙️ Mise à jour du site : modifier les fichiers puis `git push` → GitHub Pages redéploie automatiquement.

À faire quand tu veux : activer la 2FA sur le compte Cedmad (Supabase → Authentication), définir des zones/postes plus fins si besoin.

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
