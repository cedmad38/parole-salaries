/* ===================================================================
   Parole Salariés By Cedmad — Pilote Supabase (mode « en ligne »)
   -------------------------------------------------------------------
   Même forme que js/store.js mais ASYNCHRONE (chaque méthode renvoie une
   Promise). Utilisé quand js/config.js contient les clés Supabase.

   Le portail salarié appelle uniquement des fonctions contrôlées
   (submit_demande, track_*, add_precision). Les élus lisent via RLS.
   L'identité protégée passe toujours par reveal_identity.
   =================================================================== */
(function (global) {
  'use strict';
  const S = () => global.PS.store; // référentiels statiques (labels, couleurs…)
  let client = null;

  function init() {
    if (client) return client;
    const cfg = global.PS.config || {};
    if (!cfg.online) throw new Error('Configuration Supabase absente (js/config.js).');
    if (!global.supabase || !global.supabase.createClient) throw new Error('Librairie Supabase non chargée.');
    client = global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ps_auth' },
    });
    return client;
  }
  const db = () => init();

  /* ---------------- Portail salarié (anonyme) ---------------- */
  async function createDemande(input) {
    const { data, error } = await db().rpc('submit_demande', { payload: input });
    if (error) throw error;
    // Classification IA (Gemini) déclenchée automatiquement en arrière-plan (§5) —
    // ne bloque jamais la confirmation affichée au salarié, échec silencieux si indisponible.
    classifyDemande(data.public_ref).catch(() => {});
    return { publicRef: data.public_ref, secret: data.secret };
  }
  // Appel de la fonction IA (Edge Function). `force` (retraitement manuel) n'a d'effet
  // que pour un élu authentifié — la fonction serveur revérifie ce droit.
  async function classifyDemande(publicRef, force) {
    const { data, error } = await db().functions.invoke('classify-demande', { body: { public_ref: publicRef, force: !!force } });
    if (error) throw error;
    return data;
  }
  async function trackByRef(ref) {
    const { data, error } = await db().rpc('track_status', { p_ref: ref });
    if (error) throw error;
    if (!data || !data.found) return null;
    const type = S().TYPES.find(t => t.id === data.type_id) || {};
    return { publicRef: data.public_ref, statut: data.statut, type: type.label || '',
             createdAt: data.created_at, reponsePubliee: data.reponse_publiee || '' };
  }
  async function trackFull(ref, secret) {
    const { data, error } = await db().rpc('track_full', { p_ref: ref, p_secret: secret });
    if (error) throw error;
    if (data && data.error) return { error: data.error };
    return { demande: data.demande, messages: (data.messages || []).map(m => ({ auteur: m.auteur, contenu: m.contenu, date: m.date })) };
  }
  async function addSalariePrecision(ref, secret, texte) {
    const { data, error } = await db().rpc('add_precision', { p_ref: ref, p_secret: secret, p_contenu: texte });
    if (error) throw error;
    return !!data;
  }

  /* ---------------- Authentification élus ---------------- */
  async function login(email, pass) {
    const { data, error } = await db().auth.signInWithPassword({ email, password: pass });
    if (error || !data.user) return null;
    return sessionFromUser(data.user);
  }
  async function sessionFromUser(user) {
    const { data: elu } = await db().from('elus').select('*').eq('id', user.id).single();
    if (!elu || elu.actif === false) return null;   // compte désactivé => accès refusé
    return { id: user.id, nom: elu.nom, role: elu.role, perimetre: elu.perimetre || [], email: user.email };
  }
  async function currentSession() {
    const { data } = await db().auth.getUser();
    if (!data || !data.user) return null;
    return sessionFromUser(data.user);
  }
  async function logout() { await db().auth.signOut(); }

  // Auto-inscription (§8) : le compte est créé avec le rôle « en_attente » par défaut
  // (voir table elus, DEFAULT 'en_attente') — aucun accès tant qu'un admin ne l'a pas validé.
  async function signUp(email, password, nom) {
    const { data, error } = await db().auth.signUp({ email, password, options: { data: { nom: nom || '' } } });
    if (error) throw error;
    return data;
  }
  // Envoi d'un email de réinitialisation (auto-service ou déclenché par un admin pour un élu)
  async function resetPasswordForEmail(email, redirectTo) {
    const { error } = await db().auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  }
  // Définition du nouveau mot de passe, après avoir cliqué le lien reçu par email
  async function updatePassword(newPassword) {
    const { error } = await db().auth.updateUser({ password: newPassword });
    if (error) throw error;
  }
  // Écoute des évènements d'authentification (utilisé pour détecter le lien de récupération)
  function onAuthStateChange(cb) {
    return db().auth.onAuthStateChange((event, sess) => cb(event, sess));
  }

  // Gestion des élus (admin) — la RLS n'autorise que les admins
  async function listElus() {
    const { data } = await db().from('elus').select('id,nom,email,role,perimetre,actif').order('nom');
    return (data || []).map(e => ({ id: e.id, nom: e.nom, email: e.email, role: e.role, perimetre: e.perimetre || [], actif: e.actif !== false }));
  }
  async function updateElu(id, patch) {
    const row = {};
    if ('role' in patch) row.role = patch.role;
    if ('perimetre' in patch) row.perimetre = patch.perimetre;
    if ('actif' in patch) row.actif = patch.actif;
    if ('nom' in patch) row.nom = patch.nom;
    const { error } = await db().from('elus').update(row).eq('id', id);
    if (error) throw error;
  }

  /* ---------------- Lecture / écriture élus ---------------- */
  const mapRow = (r) => ({
    id: r.id, publicRef: r.public_ref, typeId: r.type_id, instance: r.instance,
    texteBrut: r.texte_brut, resume: r.resume, categorie: r.categorie,
    confidentialite: r.confidentialite, etablissement: r._etab_nom || '', etablissementId: r.etablissement_id,
    service: r.service, priorite: r.priorite, statut: r.statut, reponses: r.reponses || {},
    eluAffecte: r.elu_affecte, notesInternes: r.notes_internes, reponsePubliee: r.reponse_publiee,
    motifCloture: r.motif_cloture, groupeId: r.groupe_id, createdAt: r.created_at, updatedAt: r.updated_at,
    iaFormulations: r.ia_formulations || null, iaConfiance: r.ia_categorie_confiance || null, iaTraiteAt: r.ia_traite_at || null,
    iaDoublons: r.ia_doublons || null, eluFormulation: r.elu_formulation || '',
  });

  async function getEtabMap() {
    const { data } = await db().from('etablissements').select('id,nom');
    const m = {}; (data || []).forEach(e => m[e.id] = e.nom); return m;
  }
  async function getDemandes() {
    const [{ data, error }, etabs] = await Promise.all([
      db().from('demandes').select('*').order('created_at', { ascending: false }),
      getEtabMap(),
    ]);
    if (error) throw error;
    return (data || []).map(r => mapRow(Object.assign(r, { _etab_nom: etabs[r.etablissement_id] || '' })));
  }
  async function getDemande(id) {
    const { data } = await db().from('demandes').select('*').eq('id', id).single();
    if (!data) return null;
    const etabs = await getEtabMap();
    return mapRow(Object.assign(data, { _etab_nom: etabs[data.etablissement_id] || '' }));
  }
  async function updateDemande(id, patch) {
    const map = { statut: 'statut', categorie: 'categorie', priorite: 'priorite', eluAffecte: 'elu_affecte',
      etablissementId: 'etablissement_id', eluFormulation: 'elu_formulation',
      notesInternes: 'notes_internes', reponsePubliee: 'reponse_publiee', motifCloture: 'motif_cloture', groupeId: 'groupe_id' };
    const row = {}; for (const k in map) if (k in patch) row[map[k]] = patch[k];
    const { error } = await db().from('demandes').update(row).eq('id', id);
    if (error) throw error;
  }
  async function addEluMessage(demandeId, contenu, actor, opts) {
    opts = opts || {};
    const { error } = await db().from('messages').insert({
      demande_id: demandeId, auteur: actor, role: 'elu', contenu,
      visible_salarie: !opts.interne, interne: !!opts.interne,
    });
    if (error) throw error;
  }
  async function messagesFor(demandeId) {
    const { data } = await db().from('messages').select('*').eq('demande_id', demandeId).order('created_at');
    return (data || []).map(m => ({ id: m.id, demandeId: m.demande_id, auteur: m.auteur, role: m.role,
      contenu: m.contenu, date: m.created_at, visibleSalarie: m.visible_salarie, interne: m.interne }));
  }
  async function piecesFor(demandeId) {
    const { data } = await db().from('pieces').select('*').eq('demande_id', demandeId);
    return data || [];
  }
  async function revealIdentity(demandeId) {
    const { data, error } = await db().rpc('reveal_identity', { p_demande: demandeId });
    if (error) throw error;
    if (data && data.visible) return { visible: true, data: { nom: data.nom, contact: data.contact }, sensitive: data.sensitive };
    return { visible: false, reason: (data && data.reason) || 'Non accessible.', protected: data && data.protected };
  }
  async function mergeDemandes(masterId, ids, actor) {
    const groupe = 'grp_' + masterId;
    await db().from('demandes').update({ groupe_id: groupe }).in('id', [masterId, ...ids]);
    return groupe;
  }
  async function deleteDemande(id) {
    const { data, error } = await db().rpc('delete_demande', { p_id: id });
    if (error) throw error;
    return !!data;
  }
  async function addReponseDirection(demandeId, texte, actor) {
    await db().from('reponses_direction').insert({ demande_id: demandeId, texte });
    await updateDemande(demandeId, { statut: 'Réponse reçue' });
  }
  async function addAction(demandeId, action, actor) {
    await db().from('actions_suivi').insert({ demande_id: demandeId, libelle: action.libelle,
      responsable: action.responsable || '', echeance: action.echeance || null });
  }
  async function actionsFor(demandeId) { const { data } = await db().from('actions_suivi').select('*').eq('demande_id', demandeId); return data || []; }
  async function updateAction(demandeId, id, patch, actor) {
    const row = {};
    if (patch.etat !== undefined) row.etat = patch.etat;
    if (patch.libelle !== undefined) row.libelle = patch.libelle;
    if (patch.responsable !== undefined) row.responsable = patch.responsable;
    if (patch.echeance !== undefined) row.echeance = patch.echeance || null;
    const { error } = await db().from('actions_suivi').update(row).eq('id', id);
    if (error) throw error;
  }
  async function reponsesFor(demandeId) { const { data } = await db().from('reponses_direction').select('*').eq('demande_id', demandeId); return data || []; }

  // Chargements groupés (RLS filtre à ce que l'élu a le droit de voir)
  async function messagesAll() {
    const { data } = await db().from('messages').select('*').order('created_at');
    return (data || []).map(m => ({ id: m.id, demandeId: m.demande_id, auteur: m.auteur, role: m.role,
      contenu: m.contenu, date: m.created_at, visibleSalarie: m.visible_salarie, interne: m.interne }));
  }
  async function actionsAll() { const { data } = await db().from('actions_suivi').select('*'); return (data || []).map(a => ({ id: a.id, demandeId: a.demande_id, libelle: a.libelle, responsable: a.responsable, echeance: a.echeance, etat: a.etat })); }
  async function reponsesAll() { const { data } = await db().from('reponses_direction').select('*'); return (data || []).map(r => ({ id: r.id, demandeId: r.demande_id, texte: r.texte, date: r.created_at })); }

  async function addQuestionReunion(q, actor) {
    const { data } = await db().from('questions_reunion').insert({
      demande_id: q.demandeId, public_ref: q.publicRef, instance: q.instance, format: q.format, texte: q.texte, statut: 'À inscrire',
    }).select().single();
    return data;
  }
  // Une seule formulation « choisie » à la fois par demande — un nouveau choix remplace le
  // précédent. Les actions de suivi (format « Action de suivi ») ne sont jamais concernées.
  async function replaceQuestionReunion(q, actor) {
    await db().from('questions_reunion').delete().eq('demande_id', q.demandeId).neq('format', 'Action de suivi');
    return addQuestionReunion(q, actor);
  }
  async function removeFromReunion(demandeId) {
    await db().from('questions_reunion').delete().eq('demande_id', demandeId).neq('format', 'Action de suivi');
  }
  async function deleteQuestionReunion(id) {
    await db().from('questions_reunion').delete().eq('id', id);
  }
  async function questionsReunion() {
    const { data } = await db().from('questions_reunion').select('*').order('created_at');
    return (data || []).map(q => ({ id: q.id, demandeId: q.demande_id, publicRef: q.public_ref, instance: q.instance, format: q.format, texte: q.texte }));
  }

  async function stats() {
    const ds = await getDemandes();
    const { data: org } = await db().from('organisations').select('*').limit(1).single();
    const seuil = (org && org.seuil_anonymat) || 5;
    const byCat = {}, byMonth = {}, byEtab = {};
    ds.forEach(d => {
      byCat[d.categorie || 'Non classé'] = (byCat[d.categorie || 'Non classé'] || 0) + 1;
      byMonth[(d.createdAt || '').slice(0, 7)] = (byMonth[(d.createdAt || '').slice(0, 7)] || 0) + 1;
      byEtab[d.etablissement || '—'] = (byEtab[d.etablissement || '—'] || 0) + 1;
    });
    const sansReponse = ds.filter(d => !['Résolue', 'Clôturée', 'Archivée', 'Réponse reçue'].includes(d.statut)).length;
    return { total: ds.length, byCat, byMonth, byEtab, sansReponse, engagementsEchus: 0, seuil };
  }
  async function etablissements() { const { data } = await db().from('etablissements').select('*'); return data || []; }
  async function organisation() { const { data } = await db().from('organisations').select('*').limit(1).single(); return data; }

  global.PS = global.PS || {};
  global.PS.api = {
    init, online: true,
    createDemande, trackByRef, trackFull, addSalariePrecision, classifyDemande,
    login, logout, currentSession, listElus, updateElu,
    signUp, resetPasswordForEmail, updatePassword, onAuthStateChange,
    getDemandes, getDemande, updateDemande, addEluMessage, messagesFor, piecesFor,
    revealIdentity, mergeDemandes, deleteDemande, addReponseDirection, addAction, updateAction, actionsFor, reponsesFor,
    messagesAll, actionsAll, reponsesAll,
    addQuestionReunion, replaceQuestionReunion, removeFromReunion, deleteQuestionReunion, questionsReunion, stats, etablissements, organisation,
  };
})(window);
