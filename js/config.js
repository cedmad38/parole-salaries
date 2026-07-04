/* ===================================================================
   Parole Salariés By Cedmad — Configuration
   -------------------------------------------------------------------
   👉 C'EST LE SEUL FICHIER À MODIFIER pour connecter la base Supabase.

   Colle ci-dessous les 2 valeurs de ton projet Supabase :
   Supabase → Project Settings → API
     • "Project URL"        → SUPABASE_URL
     • "anon public" key    → SUPABASE_ANON_KEY

   ⚠️ La clé "anon public" est faite pour être publique (elle est protégée
      par les règles de sécurité de la base). NE COLLE JAMAIS ici la clé
      "service_role" : elle est secrète et donnerait tous les droits.

   Tant que ces champs sont vides, l'application fonctionne en MODE LOCAL
   (données dans le navigateur) — pratique pour tester sans base.
   =================================================================== */
window.PS = window.PS || {};
window.PS.config = {
  SUPABASE_URL: 'https://glcezsiyumbupzyzcdmb.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsY2V6c2l5dW1idXB6eXpjZG1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMDE3NDQsImV4cCI6MjA5ODY3Nzc0NH0.7wZs6df7l_gfNp1-_vi36qltrUvAhTXJUGng9jCF2Yw',   // clé « anon public » (publique par conception, protégée par la RLS)
};

// Mode « en ligne » activé automatiquement dès que les deux clés sont remplies.
window.PS.config.online = !!(window.PS.config.SUPABASE_URL && window.PS.config.SUPABASE_ANON_KEY);

// Connexion par identifiant court (sans @) → email réel du compte.
// Permet de se connecter en tapant « Cedmad » au lieu de l'email complet.
window.PS.config.usernameAliases = {
  cedmad: 'cedmad@hotmail.com',
};

// Secteurs de l'organisation (proposés au salarié dans le portail).
// Doivent correspondre aux « établissements » créés dans Supabase.
window.PS.config.secteurs = ['Logistique', 'Production', 'Administration', 'ADV', 'Maintenance'];
