# Architecture — Parole Salariés By Cedmad

## 1. Vue d'ensemble

Le produit comprend **deux interfaces** partageant une même couche de données :

```
┌─────────────────────┐        ┌──────────────────────────┐
│  Portail salarié     │        │  Espace élus (dashboard) │
│  index.html (PWA)    │        │  elus.html               │
│  - dépôt sans compte │        │  - traitement / suivi    │
│  - suivi par code    │        │  - formulations / export │
└──────────┬──────────┘        └────────────┬─────────────┘
           │                                │
           └──────────────┬─────────────────┘
                          ▼
                 Couche de données (js/store.js)
        MVP : localStorage   →   Cible : API sécurisée + BDD chiffrée
```

- **Frontend** : HTML/CSS/JS *vanilla*, sans build. Portail salarié responsive **PWA** (§13).
- **Assistant** (`js/assistant.js`) : module **isolé et désactivable** (§13), déterministe, garde-fous §5.3 garantis par construction.
- **Exports** (`js/export.js`) : Word / PDF / copie, version anonymisée ou complète.

## 2. Modèle de données (§15)

Implémenté dans `js/store.js`. Entités principales :

| Entité | Champs clés | Note confidentialité |
|---|---|---|
| Organisation | nom, seuil anonymat, conservation | |
| Établissement | nom, org | périmètre des droits |
| Utilisateur élu | identité, rôle, périmètre, auth | |
| **Demande** | texte brut, résumé, catégorie, priorité, confidentialité, statut, dates | texte brut **conservé tel quel** |
| **Identité protégée** | nom, contact, niveau | **stockée séparément** de la demande |
| Message | auteur, contenu, date, visibilité, interne | notes internes ≠ messages salarié |
| Pièce jointe | nom, type, taille, empreinte | métadonnées (contenu non stocké en démo) |
| Question de réunion | format, instance, texte, statut | |
| Réponse direction | texte, date, auteur déclaré | |
| Action de suivi | responsable, échéance, état | |
| Journal | action, utilisateur, date, dossier | traçabilité §9 |

## 3. Sécurité & confidentialité (§9) — ce qui est implémenté

- Identité **séparée** du contenu ; accès **fonction du rôle + niveau** (`identityFor`).
- Niveau de confidentialité **explicite, modifiable avant envoi, affiché avant validation** (§3.4).
- Demande anonyme → **aucune identité** enregistrée ni exportée (§16).
- **Numéro public** = statut seul ; **code secret** requis pour les échanges (§3.6).
- **Périmètre** par établissement ; accès hors périmètre **refusé + journalisé** (§17).
- **Journalisation** des connexions, accès identité, modifications, clôtures, exports.
- Contrôle des **pièces jointes** : type + taille (§17).
- **Seuil anti-réidentification** paramétrable sur les statistiques (§6.2).
- Export complet des données (**anti-enfermement propriétaire**, §13).

## 4. Passage en production — à faire

| Domaine | MVP actuel | Cible production |
|---|---|---|
| Stockage | `localStorage` (navigateur) | API REST + **BDD relationnelle chiffrée** (héberg. UE) |
| Auth élus | mot de passe démo | **Auth forte + 2FA**, sessions, déconnexion auto |
| Code secret | stocké en clair | **hash** (argon2/bcrypt) |
| Pièces jointes | métadonnées | stockage séparé chiffré + **antivirus** |
| Assistant | règles déterministes | LLM **encadré** (mêmes garde-fous), isolé, désactivable |
| Transport | fichiers statiques | **HTTPS/TLS** obligatoire |
| Sauvegardes | export JSON manuel | sauvegardes **chiffrées** + restauration testée |
| Multi-organisation | une org démo | **séparation** stricte des données par client |

## 5. ⚖️ À valider avant mise en production (§9, §18)

Le cahier des charges le rappelle : **ce document n'est pas un avis juridique.**

- [ ] Bases légales RGPD, mentions légales, **registre des consentements**.
- [ ] **Durées de conservation** par nature de dossier.
- [ ] Procédures d'exercice des droits (accès, rectification, suppression) et traces associées.
- [ ] DPIA / analyse d'impact (données sensibles, témoignages).
- [ ] Hébergement UE + contrat de sous-traitance (art. 28).
- [ ] Politique de sécurité : chiffrement au repos, gestion des clés, tests de restauration.
- [ ] Validation par une **personne compétente** (juriste / DPO).

## 6. Correspondance avec les phases du cahier des charges

- **Phase 1 (MVP)** — ✅ implémentée : portail QR, dépôt sans compte, confidentialité, formulaire guidé, code de suivi, espace élus, fiche, classement assisté, échanges, génération de questions, export Word/PDF, suivi des statuts, journal.
- **Phase 2** — partiellement amorcée : détection de doublons (proposée, non auto), statistiques, préparation de réunions, multi-établissements (périmètres), relances (format), notifications *(à ajouter : file d'attente + canal réel)*.
- **Phase 3** — non incluse : applis natives, multilingue, hors-ligne complet, intégrations intranet/email/calendrier.

## 7. Écarts assumés vs cahier des charges

- **Notifications** (§10) : les déclencheurs sont modélisés (statuts, échéances) mais l'envoi réel (email/push) nécessite un backend — non inclus dans le MVP navigateur.
- **Assistant IA** : choix d'un moteur **déterministe** pour garantir les garde-fous sans dépendance externe ; un LLM reste branchable.
- **Pièces jointes** : seules les **métadonnées** sont gérées (pas de stockage binaire en démo).
