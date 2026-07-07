/* ===================================================================
   Parole Salariés By Cedmad — Façade de données (local ↔ Supabase)
   -------------------------------------------------------------------
   Les écrans (salarie.js, elus.js) n'appellent QUE PS.data.
   • Si js/config.js contient les clés → mode EN LIGNE (PS.api / Supabase).
   • Sinon → mode LOCAL (PS.store / navigateur), pour tester sans base.

   Pour garder les écrans élus simples, un « instantané » (snapshot) est
   chargé (loadElus) : demandes, journal, établissements + détails
   (messages/actions/réponses) préchargés. L'identité protégée reste,
   elle, chargée à la demande (et journalisée) via revealIdentity.
   =================================================================== */
(function (global) {
  'use strict';
  const store = () => global.PS.store;
  const api = () => global.PS.api;
  const online = () => !!(global.PS.config && global.PS.config.online && global.PS.api);

  const snap = {
    demandes: [], journal: [], etablissements: [], organisation: { seuilAnonymat: 5 },
    questions: [], _msgs: {}, _acts: {}, _reps: {},
  };

  function groupBy(arr, key) {
    const m = {}; (arr || []).forEach(x => { (m[x[key]] = m[x[key]] || []).push(x); }); return m;
  }
  function normOrg(o) {
    if (!o) return { nom: '', seuilAnonymat: 5, conservationJours: 1095 };
    return {
      nom: o.nom || '',
      seuilAnonymat: o.seuilAnonymat != null ? o.seuilAnonymat : (o.seuil_anonymat != null ? o.seuil_anonymat : 5),
      conservationJours: o.conservationJours != null ? o.conservationJours : (o.conservation_jours != null ? o.conservation_jours : 1095),
    };
  }

  /* ---------------- Portail salarié (async) ---------------- */
  async function createDemande(i)          { return online() ? api().createDemande(i)            : store().createDemande(i); }
  async function trackByRef(r)             { return online() ? api().trackByRef(r)               : store().trackByRef(r); }
  async function trackFull(r, s)           { return online() ? api().trackFull(r, s)             : store().trackFull(r, s); }
  async function addSalariePrecision(r, s, t) { return online() ? api().addSalariePrecision(r, s, t) : store().addSalariePrecision(r, s, t); }

  /* ---------------- Authentification élus ---------------- */
  async function login(email, pass)  { return online() ? api().login(email, pass) : store().login(email, pass); }
  async function logout()            { if (online()) await api().logout(); }
  async function currentSession()    { return online() ? api().currentSession() : null; }
  async function listElus()          { return online() ? api().listElus() : store().listElus(); }
  async function updateElu(id, patch, actor) { return online() ? api().updateElu(id, patch) : store().updateElu(id, patch, actor); }

  // Auto-inscription, mot de passe oublié / réinitialisation — nécessitent la base en ligne (email)
  async function signUp(email, pass, nom) {
    if (!online()) throw new Error("Fonction disponible uniquement en mode en ligne.");
    return api().signUp(email, pass, nom);
  }
  async function resetPasswordForEmail(email, redirectTo) {
    if (!online()) throw new Error("Fonction disponible uniquement en mode en ligne.");
    return api().resetPasswordForEmail(email, redirectTo);
  }
  async function updatePassword(newPassword) {
    if (!online()) throw new Error("Fonction disponible uniquement en mode en ligne.");
    return api().updatePassword(newPassword);
  }
  function onAuthStateChange(cb) {
    if (!online()) return { data: { subscription: { unsubscribe() {} } } };
    return api().onAuthStateChange(cb);
  }

  /* ---------------- Chargement de l'instantané élus ---------------- */
  async function loadElus() {
    if (online()) {
      const [demandes, journal, etabs, org, questions, msgs, acts, reps] = await Promise.all([
        api().getDemandes(), api().journal(), api().etablissements(), api().organisation(),
        api().questionsReunion(), api().messagesAll(), api().actionsAll(), api().reponsesAll(),
      ]);
      snap.demandes = demandes; snap.journal = journal;
      snap.etablissements = (etabs || []).map(e => ({ id: e.id, nom: e.nom }));
      snap.organisation = normOrg(org); snap.questions = questions;
      snap._msgs = groupBy(msgs, 'demandeId'); snap._acts = groupBy(acts, 'demandeId'); snap._reps = groupBy(reps, 'demandeId');
    } else {
      const db = store().get();
      snap.demandes = db.demandes.slice();
      snap.journal = db.journal.slice();
      snap.etablissements = db.etablissements.map(e => ({ id: e.id, nom: e.nom }));
      snap.organisation = normOrg(db.organisation);
      snap.questions = db.questions.slice();
      snap._msgs = groupBy(db.messages, 'demandeId'); snap._acts = groupBy(db.actions, 'demandeId'); snap._reps = groupBy(db.reponses, 'demandeId');
    }
  }

  // Lectures synchrones depuis l'instantané
  const demandes        = () => snap.demandes;
  const demandeById     = (id) => snap.demandes.find(d => d.id === id);
  const journal         = () => snap.journal;
  const etablissements  = () => snap.etablissements;
  const organisation    = () => snap.organisation;
  const questionsReunion = () => snap.questions;
  const messagesFor     = (id) => (snap._msgs[id] || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const actionsFor      = (id) => snap._acts[id] || [];
  const reponsesFor     = (id) => snap._reps[id] || [];

  // Identité protégée : chargée à la demande (et journalisée en ligne)
  async function revealIdentity(d, role) {
    return online() ? api().revealIdentity(d.id) : store().identityFor(d, role);
  }

  /* ---------------- Écritures (async) ---------------- */
  async function updateDemande(id, patch, actor)        { if (online()) await api().updateDemande(id, patch); else store().updateDemande(id, patch, actor); }
  async function addEluMessage(id, contenu, actor, o)    { if (online()) await api().addEluMessage(id, contenu, actor, o); else store().addEluMessage(id, contenu, actor, o); delete snap._msgs[id]; }
  async function addReponseDirection(id, texte, actor)   { if (online()) await api().addReponseDirection(id, texte, actor); else store().addReponseDirection(id, texte, actor); delete snap._reps[id]; }
  async function addAction(id, action, actor)            { if (online()) await api().addAction(id, action, actor); else store().addAction(id, action, actor); delete snap._acts[id]; }
  async function addQuestionReunion(q, actor)            { return online() ? api().addQuestionReunion(q, actor) : store().addQuestionReunion(q, actor); }
  async function mergeDemandes(m, ids, actor)            { return online() ? api().mergeDemandes(m, ids, actor) : store().mergeDemandes(m, ids, actor); }
  async function deleteDemande(id, actor)                { const r = online() ? await api().deleteDemande(id) : store().deleteDemande(id, actor); delete snap._msgs[id]; delete snap._acts[id]; delete snap._reps[id]; return r; }
  // Relance manuelle de la classification IA (Gemini) — mode local : indisponible (retourne un message clair)
  async function classifyDemande(publicRef, force) {
    if (!online()) throw new Error("La classification IA nécessite le mode en ligne.");
    return api().classifyDemande(publicRef, force);
  }

  /* ---------------- Statistiques (depuis l'instantané) ---------------- */
  function stats() {
    const ds = snap.demandes, seuil = snap.organisation.seuilAnonymat || 5;
    const byCat = {}, byMonth = {}, byEtab = {};
    ds.forEach(d => {
      byCat[d.categorie || 'Non classé'] = (byCat[d.categorie || 'Non classé'] || 0) + 1;
      byMonth[(d.createdAt || '').slice(0, 7)] = (byMonth[(d.createdAt || '').slice(0, 7)] || 0) + 1;
      byEtab[d.etablissement || '—'] = (byEtab[d.etablissement || '—'] || 0) + 1;
    });
    const today = new Date().toISOString().slice(0, 10);
    const sansReponse = ds.filter(d => !['Résolue', 'Clôturée', 'Archivée', 'Réponse reçue'].includes(d.statut)).length;
    let engagementsEchus = 0;
    Object.values(snap._acts).forEach(list => list.forEach(a => { if (a.echeance && a.echeance < today && a.etat !== 'Fait') engagementsEchus++; }));
    return { total: ds.length, byCat, byMonth, byEtab, sansReponse, engagementsEchus, seuil };
  }

  // Export JSON (mode local seulement ; en ligne, export via Supabase)
  function exportAll() { return online() ? JSON.stringify({ demandes: snap.demandes, note: 'Export instantané — export complet via Supabase.' }, null, 2) : store().exportAll(); }

  global.PS = global.PS || {};
  global.PS.data = {
    online,
    createDemande, trackByRef, trackFull, addSalariePrecision,
    login, logout, currentSession, listElus, updateElu,
    signUp, resetPasswordForEmail, updatePassword, onAuthStateChange,
    loadElus, demandes, demandeById, journal, etablissements, organisation, questionsReunion,
    messagesFor, actionsFor, reponsesFor, revealIdentity,
    updateDemande, addEluMessage, addReponseDirection, addAction, addQuestionReunion, mergeDemandes, deleteDemande, classifyDemande,
    stats, exportAll,
  };
})(window);
