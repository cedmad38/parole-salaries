-- ===================================================================
-- Parole Salariés By Cedmad — Données de démonstration (Supabase)
-- À exécuter APRÈS schema.sql (SQL Editor → Run).
-- ===================================================================

-- 1) Fonction utilitaire de seed (créée d'abord)
create or replace function public.seed_demande(
  p_org uuid, p_etab uuid, p_type text, p_instance text, p_texte text, p_resume text,
  p_cat text, p_conf text, p_service text, p_prio text, p_statut text, p_nom text, p_contact text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_ref text; v_id uuid;
begin
  loop
    v_ref := 'PS-' || to_char(now(),'YYYY') || '-' || lpad((floor(random()*9000)+1000)::int::text,4,'0');
    exit when not exists (select 1 from demandes where public_ref = v_ref);
  end loop;
  insert into demandes (public_ref, secret_hash, org_id, type_id, instance, texte_brut, resume,
    categorie, confidentialite, etablissement_id, service, priorite, statut)
  values (v_ref, crypt(substr(md5(random()::text),1,6), gen_salt('bf')), p_org, p_type, p_instance,
    p_texte, p_resume, p_cat, p_conf, p_etab, p_service, p_prio, p_statut)
  returning id into v_id;
  if p_conf <> 'anonyme_total' and (coalesce(p_nom,'') <> '' or coalesce(p_contact,'') <> '') then
    insert into identites (demande_id, nom, contact, niveau) values (v_id, coalesce(p_nom,''), coalesce(p_contact,''), p_conf);
  end if;
  insert into journal (action, user_label, demande_id, detail) values ('Nouvelle demande déposée','salarié',v_id,p_type);
end $$;

-- 2) Organisation + établissements + demandes de démo
do $$
declare v_org uuid; v_et1 uuid; v_et2 uuid; v_et3 uuid;
begin
  select id into v_org from organisations where nom = 'Organisation de démonstration' limit 1;
  if v_org is null then
    insert into organisations (nom, seuil_anonymat, conservation_jours)
      values ('Organisation de démonstration', 5, 1095) returning id into v_org;
  end if;

  insert into etablissements (org_id, nom) values (v_org, 'Site Logistique Nord')  returning id into v_et1;
  insert into etablissements (org_id, nom) values (v_org, 'Siège administratif')   returning id into v_et2;
  insert into etablissements (org_id, nom) values (v_org, 'Atelier Production Sud') returning id into v_et3;

  perform seed_demande(v_org, v_et2, 'question_cse', 'CSE',
    'Ma prime d''ancienneté n''a pas été versée ce mois-ci alors qu''elle figurait sur mon contrat.',
    'Prime d''ancienneté contractuelle non versée, sans explication.', 'Rémunération', 'confidentiel_elus',
    'Comptabilité', 'Normale', 'En analyse', 'Julie Martin', 'julie.m@demo.fr');

  perform seed_demande(v_org, v_et1, 'danger', 'CSSCT',
    'Un chariot élévateur roule beaucoup trop vite dans l''allée centrale près du quai 3. Un collègue a failli être renversé hier.',
    'Chariot en excès de vitesse, presque-accident au quai 3.', 'Risque sécurité', 'anonyme_total',
    'Quai', 'Urgente', 'À compléter', null, null);

  perform seed_demande(v_org, v_et1, 'probleme_collectif', 'CSE',
    'Mon chef change encore mes horaires au dernier moment et je ne peux jamais m''organiser.',
    'Modifications répétées et tardives des horaires.', 'Temps de travail', 'confidentiel_elus',
    'Préparation', 'Normale', 'Nouvelle', 'Karim B.', '06 xx');

  perform seed_demande(v_org, v_et1, 'probleme_collectif', 'CSE',
    'Nos plannings changent sans arrêt à la dernière minute, impossible de prévoir la garde des enfants.',
    'Changements de planning de dernière minute.', 'Temps de travail', 'confidentiel_elus',
    'Expédition', 'Normale', 'Nouvelle', null, null);

  perform seed_demande(v_org, v_et1, 'probleme_collectif', 'CSE',
    'Les horaires sont modifiés très tard, parfois la veille pour le lendemain, c''est ingérable.',
    'Horaires modifiés la veille pour le lendemain.', 'Temps de travail', 'anonyme_total',
    'Préparation', 'Normale', 'Nouvelle', null, null);

  perform seed_demande(v_org, v_et3, 'rps', 'CSSCT',
    'Depuis la réorganisation, la charge de travail a explosé et plusieurs collègues sont en souffrance.',
    'Surcharge post-réorganisation, souffrance collective.', 'Risque psychosocial', 'identite_transmissible',
    'Ligne 2', 'Élevée', 'Affectée', 'Delphine N.', 'delphine@demo.fr');

  perform seed_demande(v_org, v_et2, 'amelioration', 'CSE',
    'Il faudrait un point d''eau et un micro-ondes supplémentaire en salle de pause.',
    'Équipement insuffisant en salle de pause.', 'Conditions matérielles', 'nominative',
    'Support', 'Normale', 'Prête pour réunion', 'Thomas Petit', 'thomas.p@demo.fr');
end $$;

-- ===================================================================
-- 3) COMPTES DE TEST — à exécuter APRÈS avoir créé les utilisateurs
-- -------------------------------------------------------------------
-- Dans Supabase : Authentication → Users → "Add user" (x4), emails ci-dessous,
-- mot de passe demo1234 (cochez "Auto Confirm User").
-- Le profil `elus` est créé automatiquement (trigger). Puis lancez ce bloc :
-- ===================================================================

update elus e set nom = 'Camille Roy',  role = 'elu_lecteur',
  perimetre = array(select id from etablissements)
  from auth.users u where u.id = e.id and u.email = 'lecteur@demo.fr';

update elus e set nom = 'Sonia Berger', role = 'elu_gestionnaire',
  perimetre = array(select id from etablissements where nom in ('Site Logistique Nord','Atelier Production Sud'))
  from auth.users u where u.id = e.id and u.email = 'gestion@demo.fr';

update elus e set nom = 'Marc Lefèvre', role = 'referent_confidentiel',
  perimetre = array(select id from etablissements)
  from auth.users u where u.id = e.id and u.email = 'referent@demo.fr';

update elus e set nom = 'Admin CSE',    role = 'admin_cse',
  perimetre = array(select id from etablissements)
  from auth.users u where u.id = e.id and u.email = 'admin@demo.fr';
