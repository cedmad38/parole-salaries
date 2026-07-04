# Connecter la base Supabase — guide pas à pas

Ce guide te fait passer du **mode local** (données dans le navigateur) au **mode en ligne** (base partagée : les réponses des salariés arrivent chez les élus, depuis n'importe quel appareil).

> ⏱️ Compte ~15 minutes. Aucune carte bancaire (offre gratuite).

---

## 1. Créer le compte et le projet

1. Va sur **[supabase.com](https://supabase.com)** → **Start your project** → connecte-toi (GitHub ou email).
2. **New project**.
   - **Name** : `parole-salaries`
   - **Database Password** : choisis-en un et **note-le** (important).
   - **Region** : choisis **West EU (Paris)** ou **Central EU (Frankfurt)** → 🇪🇺 *données en Europe (exigence RGPD §9)*.
3. Clique **Create new project** et patiente ~2 min (le temps que la base se crée).

---

## 2. Installer la base de données

1. Menu de gauche → **SQL Editor** → **New query**.
2. Ouvre le fichier **`supabase/schema.sql`** (dans le dossier du projet), **copie tout**, colle dans l'éditeur → **Run** (en bas à droite).
   → Doit afficher *Success*. Ça crée les tables + toute la sécurité.
3. Nouvelle requête → ouvre **`supabase/seed.sql`**, copie/colle → **Run**.
   → Ça crée l'organisation, les 3 établissements et 7 demandes de démonstration.
   *(Les 4 lignes `update elus…` tout en bas ne modifient rien pour l'instant : c'est normal, on y revient à l'étape 3.)*

---

## 3. Créer les comptes élus de test

1. Menu de gauche → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Crée ces **4 utilisateurs** (coche **Auto Confirm User** à chaque fois) :

   | Email | Mot de passe |
   |---|---|
   | `lecteur@demo.fr` | `demo1234` |
   | `gestion@demo.fr` | `demo1234` |
   | `referent@demo.fr` | `demo1234` |
   | `admin@demo.fr` | `demo1234` |

3. Retourne dans **SQL Editor**, recolle **la fin de `supabase/seed.sql`** (les 4 blocs `update elus…`) → **Run**.
   → Ça attribue les rôles et les périmètres (`4 rows affected` attendu).

---

## 4. Récupérer les 2 clés

1. Menu de gauche → **Project Settings** (roue crantée) → **API**.
2. Copie :
   - **Project URL** (ex. `https://abcd1234.supabase.co`)
   - **Project API keys → `anon` `public`** (une longue chaîne `eyJ…`)

> 🔐 La clé **`anon public`** est **faite pour être publique** (protégée par les règles de sécurité de la base). ✅ OK de la mettre dans le code.
> ⛔ **NE COPIE JAMAIS** la clé **`service_role`** dans le code : elle est secrète et donne tous les droits.

---

## 5. Coller les clés dans l'application

1. Ouvre **`js/config.js`**.
2. Colle tes 2 valeurs :
   ```js
   SUPABASE_URL: 'https://abcd1234.supabase.co',
   SUPABASE_ANON_KEY: 'eyJhbGciOi....(ta clé anon)',
   ```
3. Enregistre. L'application passe automatiquement en **mode en ligne**.

---

## 6. Tester

Depuis le dossier du projet :
```bash
python3 -m http.server 8000
```
- **Espace élus** : <http://localhost:8000/elus.html> → connecte-toi avec `gestion@demo.fr` / `demo1234`.
- **Portail salarié** : <http://localhost:8000/index.html> → dépose une demande.
- Rafraîchis l'espace élus : **la nouvelle demande apparaît** → la base partagée fonctionne. 🎉

---

## 7. Installer l'espace élus comme application sur le Mac

Sur `elus.html` :
- **Chrome / Edge** : un bouton **« Installer l'application »** apparaît (en bas à droite), ou icône d'installation dans la barre d'adresse → l'app obtient une **icône dans le Dock** et une **fenêtre indépendante**.
- **Safari** : menu **Fichier → Ajouter au Dock…**

Le **portail salarié** reste, lui, un simple lien à ouvrir (accès par **QR code**, sans installation) — page **« QR portail »** dans l'espace élus pour l'afficher/imprimer.

---

## ⚠️ Avant un usage réel (rappel)

Le technique est prêt, mais pour des données sensibles (témoignages de salariés), la **conformité RGPD/juridique** reste à valider par une personne compétente : bases légales, durées de conservation, registre des consentements, information des personnes. Voir `ARCHITECTURE.md` §5.

Sécurité recommandée ensuite : activer la **double authentification (2FA)** pour les élus (Supabase → Authentication), et restreindre les inscriptions.
