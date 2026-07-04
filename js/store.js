/* ===================================================================
   Parole Salariés By Cedmad — Couche de données (MVP)
   -------------------------------------------------------------------
   Persistance locale (localStorage) pour la démonstration du MVP.
   L'architecture respecte le modèle de données §15 du cahier des charges :
   l'IDENTITÉ PROTÉGÉE est stockée SÉPARÉMENT du contenu de la demande,
   et n'est accessible qu'en fonction du rôle et du niveau de confidentialité.

   ⚠️ Production : remplacer cette couche par une API sécurisée + base
      relationnelle chiffrée. Voir ARCHITECTURE.md.
   =================================================================== */
(function (global) {
  'use strict';

  const KEY = 'ps_data_v2';

  /* ---------------- Référentiels (partagés portail + élus) ------------- */

  const CONFIDENTIALITE = {
    anonyme_total:          { label: 'Anonyme total',            desc: "Aucune identité communiquée. Un code de suivi est généré.", color: 'success' },
    confidentiel_elus:      { label: 'Confidentiel élus',         desc: "Votre identité est visible uniquement des élus autorisés.", color: 'primary' },
    identite_transmissible: { label: 'Identité transmissible avec accord', desc: "Vous acceptez que votre identité soit communiquée dans un cadre déterminé.", color: 'warn' },
    nominative:             { label: 'Demande nominative',        desc: "Vous souhaitez être directement identifié·e et contacté·e.", color: 'warn' },
  };

  // Types de demande (portail salarié §3.2)
  const TYPES = [
    { id: 'question_cse',      label: 'Question destinée au CSE',        instance: 'CSE',   icon: '💬' },
    { id: 'question_cssct',    label: 'Question destinée à la CSSCT',     instance: 'CSSCT', icon: '🦺' },
    { id: 'reclamation',       label: 'Réclamation individuelle',         instance: 'CSE',   icon: '📌' },
    { id: 'probleme_collectif',label: 'Problème collectif',               instance: 'CSE',   icon: '👥' },
    { id: 'amelioration',      label: "Proposition d'amélioration",       instance: 'CSE',   icon: '💡' },
    { id: 'danger',            label: 'Situation dangereuse',             instance: 'CSSCT', icon: '⚠️', urgent: true },
    { id: 'accident',          label: 'Accident ou presque-accident',     instance: 'CSSCT', icon: '🚑', urgent: true },
    { id: 'rps',               label: 'Risque psychosocial',              instance: 'CSSCT', icon: '🧠' },
    { id: 'confidentiel',      label: 'Demande confidentielle',           instance: 'CSE',   icon: '🔒' },
    { id: 'rdv',               label: 'Demande de rendez-vous avec un élu',instance: 'CSE',   icon: '📅' },
    { id: 'autre',             label: 'Autre sujet',                      instance: 'CSE',   icon: '✏️' },
  ];

  // Catégories suggérées (§6.1)
  const CATEGORIES = [
    'CSE', 'CSSCT', 'Réclamation individuelle', 'Sujet collectif',
    'Risque sécurité', 'Risque psychosocial', 'Harcèlement allégué',
    'Discrimination alléguée', 'Organisation du travail', 'Temps de travail',
    'Rémunération', 'Effectifs', 'Formation', 'Égalité professionnelle',
    'Conditions matérielles', 'Entreprise extérieure', 'Intérim', 'Autre',
  ];

  // Statuts de traitement (§7.1) — ordre du workflow
  const STATUTS = [
    'Nouvelle', 'À compléter', 'En analyse', 'Affectée', 'Prête pour réunion',
    'Transmise à la direction', 'Réponse reçue', 'Réponse insuffisante',
    'Action à suivre', 'Résolue', 'Clôturée', 'Archivée',
  ];
  const STATUT_COLOR = {
    'Nouvelle': 'primary', 'À compléter': 'warn', 'En analyse': 'mute',
    'Affectée': 'mute', 'Prête pour réunion': 'primary', 'Transmise à la direction': 'mute',
    'Réponse reçue': 'success', 'Réponse insuffisante': 'danger', 'Action à suivre': 'warn',
    'Résolue': 'success', 'Clôturée': 'mute', 'Archivée': 'mute',
  };

  const PRIORITES = ['Normale', 'Élevée', 'Urgente'];

  // Rôles et droits (§8)
  const ROLES = {
    salarie:               { label: 'Salarié' },
    en_attente:            { label: 'En attente de validation' },
    elu_lecteur:           { label: 'Élu lecteur' },
    elu_gestionnaire:      { label: 'Élu gestionnaire' },
    referent_confidentiel: { label: 'Référent confidentiel' },
    admin_cse:             { label: 'Administrateur CSE' },
    super_admin:           { label: 'Super-administrateur technique' },
  };

  /* ---------------- Utilitaires ------------- */

  const now = () => new Date().toISOString();
  const uid = (p) => (p || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

  // Référence PUBLIQUE (numéro de dossier) — non sensible
  function makePublicRef() {
    const y = new Date().getFullYear();
    const n = Math.floor(1000 + Math.random() * 9000);
    return `PS-${y}-${n}`;
  }
  // Code SECRET distinct (§3.6) — requis pour lire les échanges / précisions
  function makeSecret() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans I,L,O,0,1 (lisibilité)
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  /* ---------------- Persistance ------------- */

  function blank() {
    return {
      version: 1,
      organisation: { id: 'org1', nom: 'Organisation de démonstration', seuilAnonymat: 5, conservationJours: 1095 },
      etablissements: [],
      users: [],
      demandes: [],
      identites: {},   // demandeId -> { nom, contact, ... }  (SÉPARÉ du contenu)
      messages: [],
      pieces: [],
      questions: [],   // questions de réunion
      reponses: [],
      actions: [],
      journal: [],
      reunions: [],
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function save(db) {
    db._savedAt = now();
    localStorage.setItem(KEY, JSON.stringify(db));
    return db;
  }
  function get() {
    let db = load();
    if (!db) { db = seed(); save(db); }
    return db;
  }

  /* ---------------- Journalisation (§9) ------------- */
  function log(db, action, opts) {
    opts = opts || {};
    db.journal.unshift({
      id: uid('log'), date: now(), action,
      user: opts.user || 'système',
      demandeId: opts.demandeId || null,
      detail: opts.detail || '',
    });
    return db;
  }

  /* ---------------- Création d'une demande (portail salarié) ------------- */
  function createDemande(input) {
    const db = get();
    const publicRef = makePublicRef();
    const secret = makeSecret();
    const type = TYPES.find(t => t.id === input.typeId) || TYPES[TYPES.length - 1];

    const demande = {
      id: uid('dem'),
      publicRef,
      secretHash: secret,           // ⚠️ démo : en production, stocker un HASH, pas le code en clair
      typeId: type.id,
      instance: type.instance,      // CSE / CSSCT (suggéré)
      texteBrut: input.texteBrut,   // conservé SANS modification (§4.2)
      resume: input.resume || '',
      categorie: input.categorie || '',
      confidentialite: input.confidentialite || 'confidentiel_elus',
      etablissement: input.etablissement || '',
      service: input.service || '',
      priorite: type.urgent ? 'Urgente' : 'Normale',
      statut: 'Nouvelle',
      reponses: input.reponses || {},  // réponses aux questions de l'assistant
      eluAffecte: null,
      notesInternes: '',
      reponsePubliee: '',
      motifCloture: '',
      groupeId: null,               // pour les fusions/regroupements
      createdAt: now(),
      updatedAt: now(),
    };
    db.demandes.unshift(demande);

    // Identité protégée stockée SÉPARÉMENT (§9 minimisation, §15)
    if (input.confidentialite !== 'anonyme_total' && (input.nom || input.contact)) {
      db.identites[demande.id] = {
        nom: input.nom || '',
        contact: input.contact || '',
        niveau: input.confidentialite,
        createdAt: now(),
      };
    }

    // Pièces jointes (métadonnées uniquement — pas de contenu binaire en démo)
    (input.pieces || []).forEach(p => {
      db.pieces.push({
        id: uid('pj'), demandeId: demande.id,
        nom: p.nom, type: p.type, taille: p.taille, empreinte: p.empreinte || '',
        createdAt: now(),
      });
    });

    log(db, 'Nouvelle demande déposée', { user: 'salarié', demandeId: demande.id, detail: `${type.label} — ${CONFIDENTIALITE[demande.confidentialite].label}` });
    save(db);
    return { publicRef, secret, id: demande.id };
  }

  /* ---------------- Suivi salarié (§3.6) ------------- */
  // Statut seul avec la référence publique ; échanges/précisions => code secret requis.
  function trackByRef(ref) {
    const db = get();
    const d = db.demandes.find(x => x.publicRef.toUpperCase() === (ref || '').trim().toUpperCase());
    if (!d) return null;
    return {
      publicRef: d.publicRef, statut: d.statut, createdAt: d.createdAt, updatedAt: d.updatedAt,
      type: (TYPES.find(t => t.id === d.typeId) || {}).label || '',
      reponsePubliee: d.reponsePubliee || '',
    };
  }
  function trackFull(ref, secret) {
    const db = get();
    const d = db.demandes.find(x => x.publicRef.toUpperCase() === (ref || '').trim().toUpperCase());
    if (!d) return { error: 'introuvable' };
    if ((d.secretHash || '').toUpperCase() !== (secret || '').trim().toUpperCase()) return { error: 'code' };
    const msgs = db.messages
      .filter(m => m.demandeId === d.id && m.visibleSalarie)
      .sort((a, b) => a.date.localeCompare(b.date));
    return { demande: d, messages: msgs };
  }
  function addSalariePrecision(ref, secret, texte) {
    const db = get();
    const d = db.demandes.find(x => x.publicRef.toUpperCase() === (ref || '').trim().toUpperCase());
    if (!d || (d.secretHash || '').toUpperCase() !== (secret || '').trim().toUpperCase()) return false;
    db.messages.push({
      id: uid('msg'), demandeId: d.id, auteur: 'Salarié', role: 'salarie',
      contenu: texte, date: now(), visibleSalarie: true, interne: false,
    });
    d.updatedAt = now();
    log(db, 'Précision ajoutée par le salarié', { user: 'salarié', demandeId: d.id });
    save(db);
    return true;
  }

  /* ---------------- Accès contrôlé à l'identité (§8, §9) ------------- */
  // Détermine ce qu'un rôle peut voir de l'identité selon le niveau de confidentialité.
  function identityFor(demande, role) {
    const db = get();
    const id = db.identites[demande.id];
    const c = demande.confidentialite;

    if (c === 'anonyme_total') return { visible: false, reason: 'Demande anonyme — aucune identité enregistrée.' };
    if (!id) return { visible: false, reason: 'Aucune coordonnée fournie.' };

    // Référent confidentiel + super-administrateur (propriétaire) : accès total, journalisé
    if (role === 'referent_confidentiel' || role === 'super_admin') {
      return { visible: true, data: id, sensitive: c === 'confidentiel_elus' };
    }
    // Autres élus (lecteur, gestionnaire, admin CSE) : pas d'accès aux identités confidentielles (§8)
    if (c === 'confidentiel_elus') {
      return { visible: false, reason: 'Identité réservée au référent confidentiel.' , protected: true };
    }
    if (c === 'identite_transmissible' || c === 'nominative') {
      return { visible: true, data: id };
    }
    return { visible: false, reason: 'Accès non autorisé.' };
  }

  /* ---------------- Actions élus (§4.3) ------------- */
  function updateDemande(id, patch, actor) {
    const db = get();
    const d = db.demandes.find(x => x.id === id);
    if (!d) return null;
    Object.assign(d, patch);
    d.updatedAt = now();
    if (patch._logAction) log(db, patch._logAction, { user: actor, demandeId: id, detail: patch._logDetail || '' });
    delete d._logAction; delete d._logDetail;
    save(db);
    return d;
  }
  function addEluMessage(demandeId, contenu, actor, opts) {
    opts = opts || {};
    const db = get();
    db.messages.push({
      id: uid('msg'), demandeId, auteur: actor, role: 'elu',
      contenu, date: now(),
      visibleSalarie: opts.interne ? false : true,
      interne: !!opts.interne,
    });
    const d = db.demandes.find(x => x.id === demandeId);
    if (d) d.updatedAt = now();
    log(db, opts.interne ? 'Note interne ajoutée' : 'Message envoyé au salarié', { user: actor, demandeId });
    save(db);
  }
  function messagesFor(demandeId) {
    return get().messages.filter(m => m.demandeId === demandeId).sort((a, b) => a.date.localeCompare(b.date));
  }
  function piecesFor(demandeId) {
    return get().pieces.filter(p => p.demandeId === demandeId);
  }

  // Fusion de demandes similaires (§4.3, §6.2) — conserve les originaux
  function mergeDemandes(masterId, ids, actor) {
    const db = get();
    const groupe = 'grp_' + masterId;
    [masterId, ...ids].forEach(i => {
      const d = db.demandes.find(x => x.id === i);
      if (d) { d.groupeId = groupe; d.updatedAt = now(); }
    });
    log(db, 'Demandes regroupées', { user: actor, demandeId: masterId, detail: `${ids.length + 1} demandes — originaux conservés` });
    save(db);
    return groupe;
  }

  /* ---------------- Réponses direction & actions de suivi ------------- */
  function addReponseDirection(demandeId, texte, actor) {
    const db = get();
    db.reponses.push({ id: uid('rep'), demandeId, texte, date: now(), auteur: 'Direction (déclaré)', qualite: null });
    updateDemande(demandeId, { statut: 'Réponse reçue', _logAction: 'Réponse de la direction enregistrée', _logDetail: '' }, actor);
    return db.reponses;
  }
  function addAction(demandeId, action, actor) {
    const db = get();
    db.actions.push({
      id: uid('act'), demandeId, responsable: action.responsable || '', echeance: action.echeance || '',
      etat: 'À faire', libelle: action.libelle || '', createdAt: now(),
    });
    log(db, "Action de suivi créée", { user: actor, demandeId, detail: action.libelle || '' });
    save(db);
  }
  function actionsFor(demandeId) { return get().actions.filter(a => a.demandeId === demandeId); }
  function reponsesFor(demandeId) { return get().reponses.filter(r => r.demandeId === demandeId); }

  /* ---------------- Questions de réunion (§7) ------------- */
  function addQuestionReunion(q, actor) {
    const db = get();
    const item = { id: uid('q'), ...q, createdAt: now() };
    db.questions.push(item);
    log(db, 'Question préparée pour une réunion', { user: actor, demandeId: q.demandeId, detail: q.instance });
    save(db);
    return item;
  }
  function questionsReunion() { return get().questions; }

  /* ---------------- Statistiques anonymisées (§6.2) ------------- */
  function stats() {
    const db = get();
    const ds = db.demandes;
    const seuil = db.organisation.seuilAnonymat || 5;
    const byCat = {}, byMonth = {}, byEtab = {};
    ds.forEach(d => {
      byCat[d.categorie || 'Non classé'] = (byCat[d.categorie || 'Non classé'] || 0) + 1;
      const m = (d.createdAt || '').slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + 1;
      byEtab[d.etablissement || '—'] = (byEtab[d.etablissement || '—'] || 0) + 1;
    });
    const sansReponse = ds.filter(d => !['Résolue', 'Clôturée', 'Archivée', 'Réponse reçue'].includes(d.statut)).length;
    const engagementsEchus = db.actions.filter(a => a.echeance && a.echeance < now().slice(0, 10) && a.etat !== 'Fait').length;
    return { total: ds.length, byCat, byMonth, byEtab, sansReponse, engagementsEchus, seuil };
  }

  /* ---------------- Authentification élus (démo) ------------- */
  function login(email, pass) {
    const db = get();
    const u = db.users.find(x => x.email.toLowerCase() === (email || '').toLowerCase() && x.pass === pass);
    if (!u || u.actif === false) return null;
    log(db, 'Connexion espace élus', { user: u.nom, detail: ROLES[u.role].label });
    save(db);
    return { id: u.id, nom: u.nom, role: u.role, perimetre: u.perimetre, email: u.email };
  }
  function listElus() {
    return get().users.map(u => ({ id: u.id, nom: u.nom, email: u.email, role: u.role, perimetre: u.perimetre || [], actif: u.actif !== false }));
  }
  function updateElu(id, patch, actor) {
    const db = get();
    const u = db.users.find(x => x.id === id);
    if (!u) return;
    if ('role' in patch) u.role = patch.role;
    if ('perimetre' in patch) u.perimetre = patch.perimetre;
    if ('actif' in patch) u.actif = patch.actif;
    if ('nom' in patch) u.nom = patch.nom;
    log(db, 'Élu mis à jour', { user: actor || 'admin', detail: patch.role || '' });
    save(db);
  }

  /* ---------------- Données de démonstration (§18) ------------- */
  function seed() {
    const db = blank();
    db.etablissements = [
      { id: 'et1', nom: 'Site Logistique Nord', orgId: 'org1' },
      { id: 'et2', nom: 'Siège administratif', orgId: 'org1' },
      { id: 'et3', nom: 'Atelier Production Sud', orgId: 'org1' },
    ];
    // Comptes de test — un par rôle (§18)
    db.users = [
      { id: 'u1', nom: 'Camille Roy',   email: 'lecteur@demo.fr',   pass: 'demo1234', role: 'elu_lecteur',           perimetre: ['et1', 'et2', 'et3'] },
      { id: 'u2', nom: 'Sonia Berger',  email: 'gestion@demo.fr',   pass: 'demo1234', role: 'elu_gestionnaire',      perimetre: ['et1', 'et3'] },
      { id: 'u3', nom: 'Marc Lefèvre',  email: 'referent@demo.fr',  pass: 'demo1234', role: 'referent_confidentiel', perimetre: ['et1', 'et2', 'et3'] },
      { id: 'u4', nom: 'Admin CSE',     email: 'admin@demo.fr',     pass: 'demo1234', role: 'admin_cse',             perimetre: ['et1', 'et2', 'et3'] },
      // Super-administrateur du propriétaire (identifiant « Cedmad »). En LOCAL (démo) : mot de passe demo1234.
      // En LIGNE : le vrai mot de passe est défini dans Supabase (chiffré), jamais dans le code.
      { id: 'u5', nom: 'Cedmad',        email: 'cedmad@hotmail.com', pass: 'demo1234', role: 'super_admin', perimetre: ['et1', 'et2', 'et3'] },
    ];

    // Quelques demandes de démonstration (dont un doublon collectif planning §17)
    const demos = [
      { typeId: 'question_cse', texteBrut: "Ma prime d'ancienneté n'a pas été versée ce mois-ci alors qu'elle figurait sur mon contrat. Personne ne sait m'expliquer pourquoi.", confidentialite: 'confidentiel_elus', etablissement: 'Siège administratif', service: 'Comptabilité', categorie: 'Rémunération', nom: 'Julie Martin', contact: 'julie.m@demo.fr', resume: "Prime d'ancienneté contractuelle non versée, sans explication.", statut: 'En analyse' },
      { typeId: 'danger', texteBrut: "Un chariot élévateur roule beaucoup trop vite dans l'allée centrale près du quai 3. Un collègue a failli être renversé hier.", confidentialite: 'anonyme_total', etablissement: 'Site Logistique Nord', service: 'Quai', categorie: 'Risque sécurité', resume: "Chariot en excès de vitesse, presque-accident au quai 3.", statut: 'À compléter' },
      { typeId: 'probleme_collectif', texteBrut: "Mon chef change encore mes horaires au dernier moment et je ne peux jamais m'organiser.", confidentialite: 'confidentiel_elus', etablissement: 'Site Logistique Nord', service: 'Préparation', categorie: 'Temps de travail', nom: 'Karim B.', contact: '06 xx', resume: "Modifications répétées et tardives des horaires.", statut: 'Nouvelle' },
      { typeId: 'probleme_collectif', texteBrut: "Nos plannings changent sans arrêt à la dernière minute, impossible de prévoir la garde des enfants.", confidentialite: 'confidentiel_elus', etablissement: 'Site Logistique Nord', service: 'Expédition', categorie: 'Temps de travail', resume: "Changements de planning de dernière minute.", statut: 'Nouvelle' },
      { typeId: 'probleme_collectif', texteBrut: "Les horaires sont modifiés très tard, parfois la veille pour le lendemain, c'est ingérable.", confidentialite: 'anonyme_total', etablissement: 'Site Logistique Nord', service: 'Préparation', categorie: 'Temps de travail', resume: "Horaires modifiés la veille pour le lendemain.", statut: 'Nouvelle' },
      { typeId: 'rps', texteBrut: "Depuis la réorganisation, la charge de travail a explosé et plusieurs collègues sont en souffrance. On ne prend plus de pauses.", confidentialite: 'identite_transmissible', etablissement: 'Atelier Production Sud', service: 'Ligne 2', categorie: 'Risque psychosocial', nom: 'Delphine N.', contact: 'delphine@demo.fr', resume: "Surcharge post-réorganisation, souffrance collective, pauses supprimées.", statut: 'Affectée' },
      { typeId: 'amelioration', texteBrut: "Il faudrait un point d'eau et un micro-ondes supplémentaire en salle de pause, on est trop nombreux à midi.", confidentialite: 'nominative', etablissement: 'Siège administratif', service: 'Support', categorie: 'Conditions matérielles', nom: 'Thomas Petit', contact: 'thomas.p@demo.fr', resume: "Équipement insuffisant en salle de pause.", statut: 'Prête pour réunion' },
    ];

    demos.forEach((x, i) => {
      const type = TYPES.find(t => t.id === x.typeId);
      const d = {
        id: uid('dem'), publicRef: makePublicRef(), secretHash: makeSecret(),
        typeId: x.typeId, instance: type.instance, texteBrut: x.texteBrut, resume: x.resume,
        categorie: x.categorie, confidentialite: x.confidentialite,
        etablissement: x.etablissement, service: x.service,
        priorite: type.urgent ? 'Urgente' : (x.categorie === 'Risque psychosocial' ? 'Élevée' : 'Normale'),
        statut: x.statut, reponses: {}, eluAffecte: x.statut === 'Affectée' ? 'Sonia Berger' : null,
        notesInternes: '', reponsePubliee: '', motifCloture: '', groupeId: null,
        createdAt: new Date(Date.now() - (i + 1) * 86400000 * 2).toISOString(),
        updatedAt: new Date(Date.now() - i * 86400000).toISOString(),
      };
      db.demandes.push(d);
      if (x.confidentialite !== 'anonyme_total' && (x.nom || x.contact)) {
        db.identites[d.id] = { nom: x.nom || '', contact: x.contact || '', niveau: x.confidentialite, createdAt: d.createdAt };
      }
      db.journal.push({ id: uid('log'), date: d.createdAt, action: 'Nouvelle demande déposée', user: 'salarié', demandeId: d.id, detail: type.label });
    });

    return db;
  }

  function deleteDemande(id, actor) {
    const db = get();
    const d = db.demandes.find(x => x.id === id);
    log(db, 'Demande supprimée', { user: actor || 'élu', demandeId: null, detail: d ? d.publicRef : '' });
    db.demandes = db.demandes.filter(x => x.id !== id);
    delete db.identites[id];
    db.messages = db.messages.filter(m => m.demandeId !== id);
    db.pieces = db.pieces.filter(p => p.demandeId !== id);
    db.questions = db.questions.filter(q => q.demandeId !== id);
    db.reponses = db.reponses.filter(r => r.demandeId !== id);
    db.actions = db.actions.filter(a => a.demandeId !== id);
    save(db);
    return true;
  }
  function resetDemo() { localStorage.removeItem(KEY); return save(seed()); }
  function exportAll() { return JSON.stringify(get(), null, 2); }

  /* ---------------- API publique ------------- */
  global.PS = global.PS || {};
  global.PS.store = {
    // référentiels
    CONFIDENTIALITE, TYPES, CATEGORIES, STATUTS, STATUT_COLOR, PRIORITES, ROLES,
    // accès
    get, save, resetDemo, exportAll, log,
    // salarié
    createDemande, trackByRef, trackFull, addSalariePrecision,
    // élus
    login, listElus, updateElu, updateDemande, addEluMessage, messagesFor, piecesFor, identityFor,
    mergeDemandes, deleteDemande, addReponseDirection, addAction, actionsFor, reponsesFor,
    addQuestionReunion, questionsReunion, stats,
    // helpers
    uid, now,
  };

})(window);
