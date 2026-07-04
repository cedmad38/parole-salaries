# Parole Salariés By Cedmad

> Vos questions, nos actions.

Application permettant aux **salariés** de déposer une question, un signalement ou une proposition à leurs **élus CSE / CSSCT** via un simple QR code (sans compte ni téléchargement), et aux **élus** de traiter, classer, reformuler, suivre et préparer les réunions.

Développée d'après le cahier des charges *Parole Salariés By Cedmad*.

---

## 🧩 Deux interfaces

| Fichier | Public | Rôle |
|---|---|---|
| **`index.html`** | Tous les salariés | Portail web mobile (PWA) — déposer & suivre une demande |
| **`elus.html`** | Élus autorisés | Tableau de bord sécurisé — traiter, reformuler, suivre, exporter |

---

## ▶️ Lancer l'application en local

L'app est en **HTML/CSS/JavaScript pur** (aucune installation, aucun build).

**Option 1 — le plus simple :** ouvrez `index.html` dans un navigateur (double-clic).
> Le QR code et le mode PWA (service worker) nécessitent un vrai serveur (voir option 2).

**Option 2 — serveur local (recommandé) :** depuis le dossier du projet :

```bash
# Python (déjà installé sur Mac)
python3 -m http.server 8000
```
Puis ouvrez : <http://localhost:8000/index.html> (portail salarié) ou <http://localhost:8000/elus.html> (espace élus).

---

## 🔑 Comptes de test (espace élus)

Mot de passe pour tous : **`demo1234`**

| Email | Rôle | Ce qu'il peut faire |
|---|---|---|
| `lecteur@demo.fr` | Élu lecteur | Consultation seule |
| `gestion@demo.fr` | Élu gestionnaire | Traitement complet, **périmètre limité** (2 établissements) |
| `referent@demo.fr` | Référent confidentiel | Accès aux **identités protégées** (journalisé) |
| `admin@demo.fr` | Administrateur CSE | Paramètres, comptes, export, seuil anti-réidentification |

Un bouton « comptes de test » sur l'écran de connexion pré-remplit les identifiants.

---

## ✨ Fonctions du MVP (Phase 1)

**Portail salarié :** accueil rassurant · 11 types de demande · rédaction libre · **assistant conversationnel** (pose uniquement les questions utiles) · **4 niveaux de confidentialité** · pièces jointes contrôlées · récapitulatif + consentements · **numéro de suivi + code secret** · suivi et précisions sans compte.

**Espace élus :** tableau de bord (nouvelles, urgentes, à compléter, prêtes réunion, réponses à publier) · liste filtrable · **fiche complète** (texte original conservé, résumé, précisions) · **assistant de formulation** (7 formats : courte, développée, CSSCT, CSE, relance, chiffrée, centrale) · échanges & notes internes · statuts (workflow §7.1) · réponses direction & actions de suivi · **exports Word / PDF / email** (anonymisé ou complet) · **statistiques anonymisées** avec seuil anti-réidentification · **QR code** du portail · **journal des actions** · administration.

---

## 🔐 Confidentialité (points clés)

- L'**identité est stockée séparément** du contenu de la demande.
- Une demande **anonyme ne révèle jamais** d'identité, y compris dans les exports.
- Le **numéro public seul** n'affiche que le statut ; les échanges nécessitent le **code secret**.
- Le **référent confidentiel** est le seul à voir les identités protégées — **et c'est journalisé**.
- Un accès **hors périmètre** est refusé **et tracé** dans le journal.

---

## ⚠️ Statut & limites (à lire)

Ce dépôt est un **MVP fonctionnel de démonstration** :

- Les données sont stockées **localement dans le navigateur** (`localStorage`) — parfait pour tester, **à remplacer par une API + base chiffrée** pour la production.
- L'**assistant** est un moteur **déterministe** (règles). Il peut être remplacé par un LLM encadré par les mêmes garde-fous (§5.3).
- Le **code secret** est stocké en clair pour la démo — en production, stocker un **hash**.

👉 Voir **`ARCHITECTURE.md`** pour l'architecture cible et la **liste de ce qui reste à valider** (juridique / technique) avant mise en production.

---

## 📁 Structure

```
ParoleSalaries/
├── index.html            Portail salarié (PWA)
├── elus.html             Espace élus
├── manifest.webmanifest  PWA
├── service-worker.js     Cache offline
├── css/  styles.css · portal.css · elus.css
├── js/   ui.js · store.js · assistant.js · export.js · salarie.js · elus.js
│         vendor/qrcode.min.js
└── assets/  logo.png + icônes PWA
```
