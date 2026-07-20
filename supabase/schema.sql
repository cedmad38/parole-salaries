-- ===================================================================
-- Parole Salariés By Cedmad — Schéma Supabase (PostgreSQL)
-- -------------------------------------------------------------------
-- À exécuter UNE FOIS dans Supabase : SQL Editor → coller → Run.
-- Implémente le modèle de données §15 + la sécurité §8 :
--   • l'identité protégée est dans une table séparée, VERROUILLÉE
--     (accessible uniquement via la fonction reveal_identity) ;
--   • le portail salarié (anonyme) n'a AUCUN accès direct aux tables :
--     il passe par des fonctions contrôlées (submit_demande, track_*) ;
--   • les élus ne voient que leur périmètre ; le référent seul voit les
--     identités confidentielles.
-- ===================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------
-- 1. TABLES (§15)
-- ------------------------------------------------------------------

create table if not exists organisations (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  seuil_anonymat int not null default 5,
  conservation_jours int not null default 1095,
  prochaine_reunion date,        -- date de la prochaine réunion CSE/CSSCT, affichée aux salariés
  date_limite_questions date,    -- date limite pour poser une question qui sera traitée à cette réunion
  created_at timestamptz not null default now()
);

create table if not exists etablissements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  nom text not null,
  created_at timestamptz not null default now()
);

-- Profil élu, lié au compte Supabase Auth (auth.users)
create table if not exists elus (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid references organisations(id),
  nom text not null default 'Élu',
  email text,
  role text not null default 'en_attente'
    check (role in ('en_attente','elu_lecteur','elu_gestionnaire','referent_confidentiel','admin_cse','super_admin')),
  perimetre uuid[] not null default '{}',   -- établissements autorisés
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists demandes (
  id uuid primary key default gen_random_uuid(),
  public_ref text unique not null,          -- numéro public (non sensible)
  secret_hash text not null,                -- HASH du code secret (jamais en clair)
  org_id uuid references organisations(id),
  type_id text not null,
  instance text not null default 'CSE',
  texte_brut text not null,                 -- conservé tel quel (§4.2)
  resume text default '',
  categorie text default '',
  confidentialite text not null default 'confidentiel_elus'
    check (confidentialite in ('anonyme_total','confidentiel_elus','identite_transmissible','nominative')),
  etablissement_id uuid references etablissements(id),
  service text default '',
  priorite text not null default 'Normale' check (priorite in ('Normale','Élevée','Urgente')),
  statut text not null default 'Nouvelle',
  reponses jsonb not null default '{}'::jsonb,
  elu_affecte text,
  notes_internes text default '',
  reponse_publiee text default '',
  motif_cloture text default '',
  groupe_id text,
  ia_formulations jsonb,           -- formulations générées par l'IA (§5), null tant que non traité
  ia_categorie_confiance text,     -- 'élevée' | 'moyenne' | 'faible' | null
  ia_traite_at timestamptz,        -- horodatage du dernier traitement IA
  ia_doublons jsonb,                -- doublons potentiels suggérés par l'IA (§6.2), jamais une fusion auto
  elu_formulation text default '', -- reformulation libre écrite par un élu (§5, distincte de l'IA)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Identité protégée : SÉPARÉE du contenu, table verrouillée (aucune policy select)
create table if not exists identites (
  demande_id uuid primary key references demandes(id) on delete cascade,
  nom text default '',
  contact text default '',
  niveau text not null,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  demande_id uuid not null references demandes(id) on delete cascade,
  auteur text not null,
  role text not null default 'elu',         -- 'elu' | 'salarie'
  contenu text not null,
  visible_salarie boolean not null default true,
  interne boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists pieces (
  id uuid primary key default gen_random_uuid(),
  demande_id uuid not null references demandes(id) on delete cascade,
  nom text not null,
  type text,
  taille bigint,
  empreinte text,
  storage_path text,
  created_at timestamptz not null default now()
);

create table if not exists questions_reunion (
  id uuid primary key default gen_random_uuid(),
  demande_id uuid references demandes(id) on delete cascade,
  public_ref text,
  instance text,
  format text,
  texte text not null,
  statut text default 'À inscrire',
  created_at timestamptz not null default now()
);

create table if not exists reponses_direction (
  id uuid primary key default gen_random_uuid(),
  demande_id uuid not null references demandes(id) on delete cascade,
  texte text not null,
  auteur_declare text default 'Direction (déclaré)',
  qualite text,
  created_at timestamptz not null default now()
);

create table if not exists actions_suivi (
  id uuid primary key default gen_random_uuid(),
  demande_id uuid not null references demandes(id) on delete cascade,
  libelle text not null,
  responsable text default '',
  echeance date,
  etat text not null default 'À faire',
  created_at timestamptz not null default now()
);

-- Mise à jour automatique de updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_demandes_touch on demandes;
create trigger trg_demandes_touch before update on demandes
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------
-- 2. FONCTIONS D'AIDE (sécurité) — security definer = contournent la RLS
-- ------------------------------------------------------------------

create or replace function public.elu_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from public.elus where id = auth.uid() and actif; $$;

create or replace function public.elu_nom() returns text
  language sql stable security definer set search_path = public as $$
  select nom from public.elus where id = auth.uid(); $$;

create or replace function public.elu_perimetre() returns uuid[]
  language sql stable security definer set search_path = public as $$
  select coalesce(perimetre,'{}') from public.elus where id = auth.uid(); $$;

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin_cse','super_admin') from public.elus where id = auth.uid() and actif), false); $$;

create or replace function public.is_referent() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'referent_confidentiel' from public.elus where id = auth.uid() and actif), false); $$;

-- Un dossier est-il dans le périmètre de l'élu connecté ?
create or replace function public.can_see_etab(p_etab uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_referent() or p_etab is null
      or p_etab = any(public.elu_perimetre()); $$;

-- ------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ------------------------------------------------------------------
alter table organisations     enable row level security;
alter table etablissements    enable row level security;
alter table elus              enable row level security;
alter table demandes          enable row level security;
alter table identites         enable row level security;  -- verrouillée : AUCUNE policy select
alter table messages          enable row level security;
alter table pieces            enable row level security;
alter table questions_reunion enable row level security;
alter table reponses_direction enable row level security;
alter table actions_suivi     enable row level security;

-- Référentiels lisibles par les élus connectés
create policy org_read   on organisations  for select to authenticated using (true);
create policy etab_read  on etablissements  for select to authenticated using (true);

-- Seul un admin (CSE ou super) peut modifier les paramètres de l'organisation
-- (seuil anti-réidentification, conservation, prochaine réunion, date limite).
create policy org_admin_upd on organisations for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Profils élus : chacun voit le sien ; l'admin voit tout ; l'admin gère
create policy elu_self   on elus for select to authenticated using (id = auth.uid() or public.is_admin());
create policy elu_admin_upd on elus for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy elu_admin_ins on elus for insert to authenticated with check (public.is_admin());

-- Demandes : lecture/écriture limitées au périmètre (§8)
create policy dem_read on demandes for select to authenticated
  using (public.can_see_etab(etablissement_id));
create policy dem_update on demandes for update to authenticated
  using ((public.is_admin() or public.is_referent() or public.elu_role() = 'elu_gestionnaire')
         and public.can_see_etab(etablissement_id))
  with check (public.can_see_etab(etablissement_id));

-- Messages : visibles si le dossier parent l'est ; écriture par gestionnaire/référent/admin
create policy msg_read on messages for select to authenticated
  using (exists (select 1 from demandes d where d.id = messages.demande_id and public.can_see_etab(d.etablissement_id)));
create policy msg_insert on messages for insert to authenticated
  with check ((public.is_admin() or public.is_referent() or public.elu_role() = 'elu_gestionnaire')
              and exists (select 1 from demandes d where d.id = messages.demande_id and public.can_see_etab(d.etablissement_id)));

-- Pièces jointes : lecture si dossier visible
create policy pieces_read on pieces for select to authenticated
  using (exists (select 1 from demandes d where d.id = pieces.demande_id and public.can_see_etab(d.etablissement_id)));

-- Questions de réunion
create policy qr_read on questions_reunion for select to authenticated
  using (demande_id is null or exists (select 1 from demandes d where d.id = questions_reunion.demande_id and public.can_see_etab(d.etablissement_id)));
create policy qr_write on questions_reunion for insert to authenticated
  with check (public.is_admin() or public.is_referent() or public.elu_role() = 'elu_gestionnaire');
create policy qr_delete on questions_reunion for delete to authenticated
  using ((public.is_admin() or public.is_referent() or public.elu_role() = 'elu_gestionnaire')
         and (demande_id is null or exists (select 1 from demandes d where d.id = questions_reunion.demande_id and public.can_see_etab(d.etablissement_id))));

-- Réponses direction
create policy rep_read on reponses_direction for select to authenticated
  using (exists (select 1 from demandes d where d.id = reponses_direction.demande_id and public.can_see_etab(d.etablissement_id)));
create policy rep_write on reponses_direction for insert to authenticated
  with check (public.is_admin() or public.is_referent() or public.elu_role() = 'elu_gestionnaire');

-- Actions de suivi
create policy act_read on actions_suivi for select to authenticated
  using (exists (select 1 from demandes d where d.id = actions_suivi.demande_id and public.can_see_etab(d.etablissement_id)));
create policy act_write on actions_suivi for insert to authenticated
  with check (public.is_admin() or public.is_referent() or public.elu_role() = 'elu_gestionnaire');
create policy act_update on actions_suivi for update to authenticated
  using (public.is_admin() or public.is_referent() or public.elu_role() = 'elu_gestionnaire');

-- NB : la table `identites` reste sans policy select => accès direct refusé.
-- Elle n'est lue que via reveal_identity() (security definer).

-- ------------------------------------------------------------------
-- 4. CRÉATION AUTO DU PROFIL ÉLU à l'inscription
-- ------------------------------------------------------------------
create or replace function public.handle_new_elu()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.elus (id, org_id, nom, email)
  values (new.id,
          (select id from public.organisations order by created_at limit 1),
          coalesce(new.raw_user_meta_data->>'nom', split_part(new.email, '@', 1)),
          new.email);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_elu();

-- ------------------------------------------------------------------
-- 5. FONCTIONS PORTAIL SALARIÉ (anonyme, accès contrôlé)
-- ------------------------------------------------------------------

-- Dépôt d'une demande (le salarié n'écrit jamais directement dans les tables)
create or replace function public.submit_demande(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_org uuid; v_etab uuid; v_ref text; v_secret text; v_id uuid;
  v_type text := coalesce(payload->>'typeId','autre');
  v_conf text := coalesce(payload->>'confidentialite','confidentiel_elus');
  v_instance text; v_priorite text; v_piece jsonb;
begin
  select id into v_org from public.organisations order by created_at limit 1;

  if coalesce(payload->>'etablissement','') <> '' then
    select id into v_etab from public.etablissements
      where org_id = v_org and nom = payload->>'etablissement' limit 1;
  end if;

  v_instance := case when v_type in ('question_cssct','danger','accident','rps') then 'CSSCT' else 'CSE' end;
  v_priorite := case when v_type in ('danger','accident') then 'Urgente' else 'Normale' end;

  -- numéro public unique
  loop
    v_ref := 'PS-' || to_char(now(),'YYYY') || '-' || lpad((floor(random()*9000)+1000)::int::text, 4, '0');
    exit when not exists (select 1 from public.demandes where public_ref = v_ref);
  end loop;

  -- code secret 6 caractères (alphabet lisible), stocké HASHÉ
  v_secret := array_to_string(array(
    select substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', floor(random()*30 + 1)::int, 1)
    from generate_series(1,6)), '');

  insert into public.demandes (public_ref, secret_hash, org_id, type_id, instance, texte_brut,
      resume, categorie, confidentialite, etablissement_id, service, priorite, reponses)
  values (v_ref, crypt(v_secret, gen_salt('bf')), v_org, v_type, v_instance,
      coalesce(payload->>'texteBrut',''), coalesce(payload->>'resume',''),
      coalesce(payload->>'categorie',''), v_conf, v_etab,
      coalesce(payload->>'service',''), v_priorite, coalesce(payload->'reponses','{}'::jsonb))
  returning id into v_id;

  -- identité protégée (jamais pour un dépôt anonyme)
  if v_conf <> 'anonyme_total'
     and (coalesce(payload->>'nom','') <> '' or coalesce(payload->>'contact','') <> '') then
    insert into public.identites (demande_id, nom, contact, niveau)
    values (v_id, coalesce(payload->>'nom',''), coalesce(payload->>'contact',''), v_conf);
  end if;

  -- pièces jointes (métadonnées)
  if payload ? 'pieces' then
    for v_piece in select * from jsonb_array_elements(payload->'pieces') loop
      insert into public.pieces (demande_id, nom, type, taille, empreinte)
      values (v_id, v_piece->>'nom', v_piece->>'type',
              nullif(v_piece->>'taille','')::bigint, v_piece->>'empreinte');
    end loop;
  end if;

  return jsonb_build_object('public_ref', v_ref, 'secret', v_secret);
end $$;

-- Prochaine réunion CSE/CSSCT + date limite pour y poser une question — lecture publique,
-- ne renvoie que ces deux dates (aucune autre donnée de l'organisation).
create or replace function public.next_reunion()
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_build_object(
    'prochaine_reunion', prochaine_reunion,
    'date_limite_questions', date_limite_questions
  ), '{}'::jsonb)
  from public.organisations order by created_at limit 1;
$$;

-- Suivi par numéro seul : statut uniquement (aucune donnée sensible)
create or replace function public.track_status(p_ref text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d record;
begin
  select public_ref, type_id, statut, reponse_publiee, created_at, updated_at
    into d from public.demandes where upper(public_ref) = upper(trim(p_ref));
  if not found then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true, 'public_ref', d.public_ref, 'type_id', d.type_id,
    'statut', d.statut, 'reponse_publiee', d.reponse_publiee, 'created_at', d.created_at);
end $$;

-- Suivi complet : nécessite le code secret (échanges visibles du salarié)
create or replace function public.track_full(p_ref text, p_secret text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare d record; v_msgs jsonb;
begin
  select * into d from public.demandes where upper(public_ref) = upper(trim(p_ref));
  if not found then return jsonb_build_object('error','introuvable'); end if;
  if d.secret_hash is null or crypt(trim(p_secret), d.secret_hash) <> d.secret_hash then
    return jsonb_build_object('error','code');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('auteur',m.auteur,'contenu',m.contenu,'date',m.created_at)
           order by m.created_at), '[]'::jsonb)
    into v_msgs from public.messages m where m.demande_id = d.id and m.visible_salarie;
  return jsonb_build_object('demande', jsonb_build_object('public_ref',d.public_ref,'statut',d.statut,
      'created_at',d.created_at,'reponse_publiee',d.reponse_publiee), 'messages', v_msgs);
end $$;

-- Ajout d'une précision par le salarié (protégé par le code secret)
create or replace function public.add_precision(p_ref text, p_secret text, p_contenu text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare d record;
begin
  select * into d from public.demandes where upper(public_ref) = upper(trim(p_ref));
  if not found or crypt(trim(p_secret), d.secret_hash) <> d.secret_hash then return false; end if;
  insert into public.messages (demande_id, auteur, role, contenu, visible_salarie, interne)
  values (d.id, 'Salarié', 'salarie', p_contenu, true, false);
  return true;
end $$;

-- ------------------------------------------------------------------
-- 6. RÉVÉLATION D'IDENTITÉ (élus) — contrôlée (§8)
-- ------------------------------------------------------------------
create or replace function public.reveal_identity(p_demande uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_conf text; v_nom text; v_contact text; v_role text;
begin
  v_role := public.elu_role();
  if v_role is null then raise exception 'Non autorisé'; end if;

  select confidentialite into v_conf from public.demandes where id = p_demande;
  if v_conf is null then raise exception 'Demande introuvable'; end if;

  if v_conf = 'anonyme_total' then
    return jsonb_build_object('visible', false, 'reason', 'Demande anonyme — aucune identité.');
  end if;
  -- confidentiel élus : réservé au référent + au super-administrateur (accès total propriétaire)
  if v_conf = 'confidentiel_elus' and v_role not in ('referent_confidentiel', 'super_admin') then
    return jsonb_build_object('visible', false, 'protected', true,
      'reason', 'Identité réservée au référent confidentiel.');
  end if;

  select nom, contact into v_nom, v_contact from public.identites where demande_id = p_demande;
  if not found then return jsonb_build_object('visible', false, 'reason', 'Aucune coordonnée fournie.'); end if;

  return jsonb_build_object('visible', true, 'nom', v_nom, 'contact', v_contact,
    'sensitive', v_conf = 'confidentiel_elus');
end $$;

-- Suppression d'une demande « farfelue » / spam — réservé référent, admin & super-admin
create or replace function public.delete_demande(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_role text; v_ref text;
begin
  v_role := public.elu_role();
  if v_role is null or v_role not in ('referent_confidentiel', 'admin_cse', 'super_admin') then raise exception 'Non autorisé'; end if;
  select public_ref into v_ref from public.demandes where id = p_id;
  if v_ref is null then return false; end if;
  delete from public.demandes where id = p_id;  -- cascade : identités, messages, pièces, etc.
  return true;
end $$;

-- ------------------------------------------------------------------
-- 7. DROITS D'EXÉCUTION
-- ------------------------------------------------------------------
grant execute on function public.next_reunion()          to anon, authenticated;
grant execute on function public.submit_demande(jsonb) to anon, authenticated;
grant execute on function public.track_status(text)     to anon, authenticated;
grant execute on function public.track_full(text, text)  to anon, authenticated;
grant execute on function public.add_precision(text, text, text) to anon, authenticated;
grant execute on function public.reveal_identity(uuid)   to authenticated;
grant execute on function public.delete_demande(uuid)    to authenticated;

-- Fin du schéma.
