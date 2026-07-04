/* ===================================================================
   Parole Salariés By Cedmad — Espace élus (tableau de bord sécurisé)
   Données via PS.data (mode local OU Supabase, transparent).
   =================================================================== */
(function () {
  'use strict';
  const { $, el, toast, badge, fmtDate, fmtDay, escapeHTML } = PS.ui;
  const store = PS.store;      // référentiels statiques (types, catégories, rôles…)
  const data = PS.data;        // couche de données (async)
  const assistant = PS.assistant, exporter = PS.exporter;
  const appRoot = () => document.getElementById('elus-app');

  let session = null;
  let state = { view: 'dashboard', currentId: null, filters: { statut: '', cat: '', etab: '', q: '' } };
  const SESSION_KEY = 'ps_session';

  async function reload() { await data.loadElus(); }

  /* -------- Périmètre & droits (§8) -------- */
  function etabNamesFor(user) {
    const etabs = data.etablissements();
    return (user.perimetre || []).map(id => (etabs.find(e => e.id === id) || {}).nom).filter(Boolean);
  }
  function canSeeDemande(d) {
    if (['referent_confidentiel', 'admin_cse', 'super_admin'].includes(session.role)) return true;
    if (!d.etablissement) return true;
    return etabNamesFor(session).includes(d.etablissement);
  }
  function canEdit() { return ['elu_gestionnaire', 'referent_confidentiel', 'admin_cse', 'super_admin'].includes(session.role); }
  function canDelete() { return ['admin_cse', 'super_admin'].includes(session.role); }
  function visibleDemandes() {
    const ds = data.demandes();
    return data.online() ? ds : ds.filter(canSeeDemande); // en ligne : la RLS a déjà filtré
  }

  /* ======================= LOGIN ======================= */
  function renderLogin() {
    const box = el('div', { class: 'login-wrap' });
    box.innerHTML = `
      <div class="login-card">
        <div class="brand">
          <img src="assets/logo.png" alt="Logo Parole Salariés By Cedmad">
          <h1 style="margin:10px 0 2px;font-size:1.2rem">Espace élus</h1>
          <p class="muted small mt-0">CSE · CSSCT · Représentants syndicaux</p>
        </div>
        <div class="field"><label for="email">Identifiant</label><input id="email" type="text" autocapitalize="none" autocomplete="username" placeholder="Cedmad ou email"></div>
        <div class="field"><label for="pass">Mot de passe</label><input id="pass" type="password" placeholder="••••••••"></div>
        <button class="btn btn-primary btn-block" id="login-btn" type="button">Se connecter</button>
        <div class="notice ${data.online() ? 'notice-success' : 'notice-info'}" style="margin-top:14px"><span class="ico">${data.online() ? '🟢' : '🔐'}</span><div class="small">${data.online() ? 'Mode en ligne (base Supabase sécurisée).' : 'Mode local (démo). Renseignez js/config.js pour la base partagée.'}</div></div>
        <div class="demo-accounts"><p class="small muted" style="margin:14px 0 6px">Comptes de test (mot de passe : <code>demo1234</code>) :</p></div>
      </div>
      <p class="center small muted" style="margin-top:14px"><a href="index.html">← Portail salarié</a></p>`;
    const da = box.querySelector('.demo-accounts');
    data.demoAccounts().forEach(u => {
      da.appendChild(el('button', { class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: () => { box.querySelector('#email').value = u.email; box.querySelector('#pass').value = 'demo1234'; } }, [
        el('span', {}, [document.createTextNode(u.nom + ' — '), el('span', { class: 'muted', text: store.ROLES[u.role].label })]),
      ]));
    });
    const doLogin = async () => {
      const btn = box.querySelector('#login-btn'); btn.disabled = true; btn.textContent = 'Connexion…';
      let ident = box.querySelector('#email').value.trim();
      const aliases = (PS.config && PS.config.usernameAliases) || {};
      if (ident && ident.indexOf('@') === -1 && aliases[ident.toLowerCase()]) ident = aliases[ident.toLowerCase()];
      try {
        const u = await data.login(ident, box.querySelector('#pass').value);
        if (!u) { toast('Identifiants incorrects.', 'err'); btn.disabled = false; btn.textContent = 'Se connecter'; return; }
        session = u; PS.session = u;
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(u)); } catch (e) {}
        await reload();
        state.view = 'dashboard'; render();
      } catch (e) {
        toast('Connexion impossible.', 'err'); btn.disabled = false; btn.textContent = 'Se connecter';
      }
    };
    box.querySelector('#login-btn').onclick = doLogin;
    box.querySelector('#pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    const r = appRoot(); r.innerHTML = ''; r.appendChild(box);
  }

  /* ======================= SHELL ======================= */
  function counts() {
    const ds = visibleDemandes();
    return {
      nouvelles: ds.filter(d => d.statut === 'Nouvelle').length,
      urgentes: ds.filter(d => d.priorite === 'Urgente' && !['Résolue', 'Clôturée', 'Archivée'].includes(d.statut)).length,
      incompletes: ds.filter(d => d.statut === 'À compléter').length,
      pretes: ds.filter(d => d.statut === 'Prête pour réunion').length,
      attente: ds.filter(d => d.statut === 'Transmise à la direction').length,
      apublier: ds.filter(d => d.statut === 'Réponse reçue' && !d.reponsePubliee).length,
    };
  }
  function renderShell(contentNode) {
    const c = counts();
    const nav = [
      { id: 'dashboard', ic: '📊', label: 'Tableau de bord' },
      { id: 'demandes', ic: '📥', label: 'Demandes', n: c.nouvelles || '' },
      { id: 'reunions', ic: '🗂️', label: 'Réunions' },
      { id: 'stats', ic: '📈', label: 'Statistiques' },
      { id: 'qr', ic: '🔗', label: 'QR portail' },
      { id: 'journal', ic: '📝', label: 'Journal' },
    ];
    if (['admin_cse', 'super_admin'].includes(session.role)) nav.push({ id: 'admin', ic: '⚙️', label: 'Administration' });

    const shell = el('div');
    shell.innerHTML = `
      <div class="elus-topbar">
        <img src="assets/logo.png" alt="">
        <div class="title">Parole Salariés<small>Espace élus</small></div>
        <div class="spacer"></div>
        <div class="who"><b>${escapeHTML(session.nom)}</b><br><span class="role-chip">${escapeHTML(store.ROLES[session.role].label)}</span></div>
        <button class="btn btn-ghost btn-sm" id="logout" type="button" style="color:#fff;border-color:rgba(255,255,255,.25)">Quitter</button>
      </div>
      <div class="elus-shell">
        <nav class="elus-nav" id="nav"></nav>
        <main class="elus-main" id="content"></main>
      </div>`;
    const navHost = shell.querySelector('#nav');
    nav.forEach(item => {
      const a = el('a', { class: state.view === item.id ? 'active' : '', onclick: () => { state.view = item.id; state.currentId = null; render(); } }, [
        el('span', { html: item.ic }), el('span', { text: item.label }),
      ]);
      if (item.n) a.appendChild(el('span', { class: 'n', text: String(item.n) }));
      navHost.appendChild(a);
    });
    shell.querySelector('#logout').onclick = async () => {
      await data.logout(); session = null; PS.session = null;
      try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {} renderLogin();
    };
    shell.querySelector('#content').appendChild(contentNode);
    const r = appRoot(); r.innerHTML = ''; r.appendChild(shell);
    window.scrollTo(0, 0);
  }

  function wireKPIs() {
    document.querySelectorAll('.kpi[data-view]').forEach(k => k.addEventListener('click', () => {
      state.view = k.dataset.view;
      try { state.filters = Object.assign({ statut: '', cat: '', etab: '', q: '' }, JSON.parse(k.dataset.filters || '{}')); } catch (e) {}
      render();
    }));
  }
  function kpi(v, label, kind, view, filters) {
    return `<div class="kpi ${kind}" data-view="${view}" data-filters='${JSON.stringify(filters || {})}'>
      <div class="v">${v}</div><div class="l">${escapeHTML(label)}</div></div>`;
  }

  /* ======================= DASHBOARD (§4.1) ======================= */
  function viewDashboard() {
    const c = counts();
    const ds = visibleDemandes();
    const st = data.stats();
    const recur = Object.entries(st.byCat).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);

    const box = el('div');
    box.innerHTML = `
      <h1>Tableau de bord</h1>
      <p class="page-sub">Vue d'ensemble de votre périmètre — ${escapeHTML(etabNamesFor(session).join(', ') || 'tous établissements')}.</p>
      <div class="kpi-grid">
        ${kpi(c.nouvelles, 'Nouvelles demandes', 'primary', 'demandes', { statut: 'Nouvelle' })}
        ${kpi(c.urgentes, 'Urgentes', 'alert', 'demandes', { statut: '' })}
        ${kpi(c.incompletes, 'À compléter', 'warn', 'demandes', { statut: 'À compléter' })}
        ${kpi(c.pretes, 'Prêtes pour réunion', 'ok', 'demandes', { statut: 'Prête pour réunion' })}
        ${kpi(c.attente, 'En attente de réponse', '', 'demandes', { statut: 'Transmise à la direction' })}
        ${kpi(c.apublier, 'Réponses à publier', 'ok', 'demandes', { statut: 'Réponse reçue' })}
      </div>
      <div class="card card-pad" style="margin-bottom:14px">
        <h3>⚠️ Alertes — sujets récurrents (§6.2)</h3>
        ${recur.length ? recur.map(([cat, n]) => `<div class="row-between" style="padding:6px 0;border-bottom:1px solid var(--border)"><span>${escapeHTML(cat)}</span>${badge(n + ' demandes', 'danger')}</div>`).join('')
          : '<p class="muted small">Aucun sujet récurrent détecté pour l\'instant.</p>'}
        <p class="hint" style="margin-top:8px">Les regroupements ne sont jamais automatiques : ils sont proposés puis validés par un élu.</p>
      </div>
      <div class="card card-pad"><h3>Dernières demandes</h3><div id="recent"></div></div>`;
    const recent = box.querySelector('#recent');
    ds.slice(0, 5).forEach(d => recent.appendChild(demItem(d)));
    if (!ds.length) recent.innerHTML = '<p class="muted small">Aucune demande dans votre périmètre.</p>';
    renderShell(box); wireKPIs();
  }

  /* ======================= LISTE DEMANDES ======================= */
  function viewDemandes() {
    const box = el('div');
    box.innerHTML = `
      <h1>Demandes</h1>
      <p class="page-sub">Traitez, classez et suivez les demandes de votre périmètre.</p>
      <div class="filters">
        <input id="f-q" type="search" placeholder="Rechercher…" value="${escapeHTML(state.filters.q)}">
        <select id="f-statut"><option value="">Tous les statuts</option>${store.STATUTS.map(s => `<option ${state.filters.statut === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <select id="f-cat"><option value="">Toutes catégories</option>${store.CATEGORIES.map(s => `<option ${state.filters.cat === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <span class="grow"></span><span class="muted small" id="count"></span>
      </div>
      <div id="list"></div>`;
    const apply = () => {
      state.filters.q = box.querySelector('#f-q').value;
      state.filters.statut = box.querySelector('#f-statut').value;
      state.filters.cat = box.querySelector('#f-cat').value;
      const list = box.querySelector('#list'); list.innerHTML = '';
      let ds = visibleDemandes(); const f = state.filters;
      if (f.statut) ds = ds.filter(d => d.statut === f.statut);
      if (f.cat) ds = ds.filter(d => d.categorie === f.cat);
      if (f.q) { const q = f.q.toLowerCase(); ds = ds.filter(d => (d.texteBrut + ' ' + d.resume + ' ' + d.publicRef).toLowerCase().includes(q)); }
      box.querySelector('#count').textContent = ds.length + ' demande' + (ds.length > 1 ? 's' : '');
      if (!ds.length) { list.innerHTML = '<p class="muted">Aucune demande ne correspond.</p>'; return; }
      ds.forEach(d => list.appendChild(demItem(d)));
    };
    box.querySelector('#f-q').addEventListener('input', apply);
    box.querySelector('#f-statut').addEventListener('change', apply);
    box.querySelector('#f-cat').addEventListener('change', apply);
    renderShell(box); apply();
  }
  function demItem(d) {
    const type = store.TYPES.find(t => t.id === d.typeId) || {};
    const conf = store.CONFIDENTIALITE[d.confidentialite] || { label: d.confidentialite, color: 'mute' };
    const node = el('div', { class: 'dem-item', onclick: () => openFiche(d.id) });
    node.innerHTML = `
      <span class="ic">${type.icon || '📄'}</span>
      <div class="body">
        <div class="res">${escapeHTML(d.resume || type.label || 'Demande')}</div>
        <div class="meta"><span>${escapeHTML(d.publicRef)}</span>·<span>${escapeHTML(d.categorie || 'à classer')}</span>·<span>${escapeHTML(d.etablissement || '—')}</span>
          ${badge(conf.label, conf.color)} ${d.groupeId ? badge('regroupée', 'mute') : ''}</div>
      </div>
      <div class="right">${d.priorite === 'Urgente' ? badge('Urgent', 'danger') : ''}
        <div style="margin-top:4px">${badge(d.statut, store.STATUT_COLOR[d.statut] || 'mute')}</div></div>`;
    return node;
  }

  /* ======================= FICHE DEMANDE (§4.2 / §4.3) ======================= */
  function openFiche(id) {
    const d = data.demandeById(id);
    if (!d) return;
    if (!data.online() && !canSeeDemande(d)) {
      const db = store.get(); store.log(db, 'ACCÈS REFUSÉ (hors périmètre)', { user: session.nom, demandeId: d.id, detail: d.etablissement }); store.save(db);
      toast('Accès refusé : ce dossier est hors de votre périmètre. Tentative journalisée.', 'err'); return;
    }
    state.currentId = id; state.view = 'fiche'; render();
  }
  async function viewFiche() {
    const d = data.demandeById(state.currentId);
    if (!d) { state.view = 'demandes'; render(); return; }
    const type = store.TYPES.find(t => t.id === d.typeId) || {};
    const conf = store.CONFIDENTIALITE[d.confidentialite] || { label: d.confidentialite, color: 'mute' };
    let idAccess; try { idAccess = await data.revealIdentity(d, session.role); } catch (e) { idAccess = { visible: false, reason: 'Accès identité indisponible.' }; }
    const editable = canEdit();

    const box = el('div');
    box.innerHTML = `
      <button class="btn btn-ghost btn-sm" id="back" type="button">← Retour aux demandes</button>
      <div class="row-between" style="margin:12px 0 4px">
        <h1 style="margin:0">${escapeHTML(d.resume || type.label)}</h1>
        <span>${d.priorite === 'Urgente' ? badge('Urgent', 'danger') : ''} ${badge(d.statut, store.STATUT_COLOR[d.statut] || 'mute')}</span>
      </div>
      <p class="page-sub">${escapeHTML(d.publicRef)} · ${escapeHTML(type.label || '')} · déposée le ${fmtDate(d.createdAt)}</p>
      <div class="status-flow" style="margin-bottom:18px">${statusFlow(d.statut)}</div>
      <div class="fiche-grid">
        <div class="fiche-col">
          <div class="card card-pad">
            <h3>Texte original du salarié <span class="badge badge-mute">conservé tel quel</span></h3>
            <div class="original-quote">${escapeHTML(d.texteBrut)}</div>
            <h3 style="margin-top:14px">Résumé <span class="badge badge-primary">généré</span></h3>
            <p>${escapeHTML(d.resume || '—')}</p>
            ${Object.keys(d.reponses || {}).length ? '<h3>Précisions recueillies</h3>' + Object.entries(d.reponses).filter(([, v]) => v).map(([k, v]) => `<p class="small"><strong>${escapeHTML((assistant.THEMES[k] || {}).theme || k)} :</strong> ${escapeHTML(v)}</p>`).join('') : ''}
          </div>
          <div class="card card-pad">
            <h3>💬 Assistant de formulation (§5)</h3>
            <p class="hint">Généré à partir des faits recueillis — modifiable, jamais transmis automatiquement.</p>
            <div id="formuls"></div>
          </div>
          <div class="card card-pad">
            <h3>Échanges</h3>
            <div id="messages"></div>
            ${editable ? `
            <div class="field" style="margin-top:10px"><label for="msg">Message au salarié / note interne</label>
              <textarea id="msg" placeholder="Écrire un message… (le salarié y accède avec son code secret)" style="min-height:70px"></textarea></div>
            <div class="row">
              <button class="btn btn-primary btn-sm" id="send-msg" type="button">Envoyer au salarié</button>
              <button class="btn btn-ghost btn-sm" id="send-note" type="button">Note interne (invisible au salarié)</button>
            </div>` : '<p class="muted small">Lecture seule (rôle élu lecteur).</p>'}
          </div>
        </div>
        <div class="fiche-col">
          <div class="card card-pad"><h3>Identité</h3>${identityBlock(idAccess)}</div>
          <div class="card card-pad">
            <dl class="kv">
              <dt>Confidentialité</dt><dd>${badge(conf.label, conf.color)}</dd>
              <dt>Secteur</dt><dd>${escapeHTML(d.etablissement || '—')}</dd>
              <dt>Zone / poste</dt><dd>${escapeHTML(d.service || '—')}</dd>
              <dt>Instance</dt><dd>${escapeHTML(d.instance)}</dd>
              <dt>Élu affecté</dt><dd>${escapeHTML(d.eluAffecte || '—')}</dd>
            </dl>
          </div>
          ${editable ? actionsCard(d) : ''}
        </div>
      </div>`;
    box.querySelector('#back').onclick = () => { state.view = 'demandes'; render(); };

    const fhost = box.querySelector('#formuls');
    Object.values(assistant.formulations(d)).forEach(f => {
      const card = el('div', { class: 'formul' });
      card.innerHTML = `<h4>${escapeHTML(f.titre)}</h4><div class="fin">${escapeHTML(f.finalite)}</div><div class="txt">${escapeHTML(f.texte)}</div>
        <div class="acts"><button class="btn btn-sm btn-ghost" data-act="copy" type="button">Copier</button>
          ${editable ? '<button class="btn btn-sm btn-primary" data-act="reunion" type="button">→ Réunion</button>' : ''}</div>`;
      card.querySelector('[data-act="copy"]').onclick = async () => { try { await navigator.clipboard.writeText(f.texte); toast('Formulation copiée.'); } catch (e) { toast('Copie impossible.', 'err'); } };
      const rb = card.querySelector('[data-act="reunion"]');
      if (rb) rb.onclick = async () => {
        await data.addQuestionReunion({ demandeId: d.id, publicRef: d.publicRef, instance: d.instance, format: f.titre, texte: f.texte, statut: 'À inscrire' }, session.nom);
        await reload(); toast('Question ajoutée à la préparation de réunion.');
      };
      fhost.appendChild(card);
    });

    renderMessages(box.querySelector('#messages'), d.id);
    if (editable) {
      box.querySelector('#send-msg').onclick = () => sendMsg(box, d.id, false);
      box.querySelector('#send-note').onclick = () => sendMsg(box, d.id, true);
      wireActions(box, d);
    }
    renderShell(box);
  }

  function statusFlow(current) {
    const idx = store.STATUTS.indexOf(current);
    return store.STATUTS.map((s, i) => `<span class="s ${i === idx ? 'cur' : (i < idx ? 'done' : '')}">${s}</span>`).join('');
  }
  function identityBlock(access) {
    if (access.visible && access.data) {
      return `<div class="notice ${access.sensitive ? 'notice-warn' : 'notice-info'}"><span class="ico">${access.sensitive ? '🔓' : '👤'}</span>
        <div><strong>${escapeHTML(access.data.nom || 'Non renseigné')}</strong><br>${escapeHTML(access.data.contact || '')}
        ${access.sensitive ? '<br><span class="small">Accès référent — consultation journalisée.</span>' : ''}</div></div>`;
    }
    return `<div class="notice notice-info"><span class="ico">🕶️</span><div>${escapeHTML(access.reason || 'Identité non accessible.')}
      ${access.protected ? '<br><span class="small">Seul le référent confidentiel peut y accéder.</span>' : ''}</div></div>`;
  }
  function actionsCard(d) {
    const opts = (arr, cur) => arr.map(o => `<option ${o === cur ? 'selected' : ''}>${o}</option>`).join('');
    return `<div class="card card-pad">
      <h3>Actions (§4.3)</h3>
      <div class="field"><label>Statut</label><select id="a-statut">${opts(store.STATUTS, d.statut)}</select></div>
      <div class="field"><label>Catégorie</label><select id="a-cat"><option value="">— à classer —</option>${opts(store.CATEGORIES, d.categorie)}</select></div>
      <div class="field"><label>Priorité</label><select id="a-prio">${opts(store.PRIORITES, d.priorite)}</select></div>
      <div class="field"><label>Affecter à un élu</label><input id="a-elu" type="text" placeholder="Nom de l'élu" value="${escapeHTML(d.eluAffecte || '')}"></div>
      <button class="btn btn-primary btn-sm btn-block" id="a-save" type="button">Enregistrer</button>
      <hr class="divider">
      <div class="field"><label>Notes internes</label><textarea id="a-notes" placeholder="Invisibles au salarié" style="min-height:60px">${escapeHTML(d.notesInternes || '')}</textarea></div>
      <button class="btn btn-ghost btn-sm btn-block" id="a-notes-save" type="button">Enregistrer les notes</button>
      <hr class="divider">
      <div class="field"><label>Réponse de la direction</label><textarea id="a-rep" placeholder="Coller la réponse reçue…" style="min-height:60px"></textarea></div>
      <button class="btn btn-ghost btn-sm btn-block" id="a-rep-save" type="button">Enregistrer la réponse</button>
      <hr class="divider">
      <div class="field"><label>Publier une réponse (anonymisée) au salarié</label><textarea id="a-pub" placeholder="Réponse visible dans le suivi du salarié" style="min-height:60px">${escapeHTML(d.reponsePubliee || '')}</textarea></div>
      <button class="btn btn-primary btn-sm btn-block" id="a-pub-save" type="button">Publier la réponse</button>
      <hr class="divider">
      <div class="field"><label>Action de suivi</label>
        <input id="act-lib" type="text" placeholder="Engagement / action" style="margin-bottom:6px">
        <div class="row"><input id="act-resp" type="text" placeholder="Responsable" class="grow" style="min-width:110px"><input id="act-ech" type="date" class="grow" style="min-width:110px"></div>
      </div>
      <button class="btn btn-ghost btn-sm btn-block" id="act-save" type="button">Ajouter l'action</button>
      <hr class="divider">
      <button class="btn btn-danger btn-sm btn-block" id="a-close" type="button">Clôturer le dossier</button>
      ${canDelete() ? `
      <hr class="divider">
      <button class="btn btn-danger btn-sm btn-block" id="a-delete" type="button" style="background:#8a1c14">🗑️ Supprimer la demande</button>
      <p class="hint" style="margin-top:6px">Réservé à l'administration. Suppression <strong>définitive</strong> (spam / hors sujet), tracée dans le journal.</p>` : ''}
    </div>`;
  }
  function wireActions(box, d) {
    const q = s => box.querySelector(s);
    q('#a-save').onclick = async () => {
      await data.updateDemande(d.id, { statut: q('#a-statut').value, categorie: q('#a-cat').value, priorite: q('#a-prio').value,
        eluAffecte: q('#a-elu').value.trim() || null, _logAction: 'Demande mise à jour', _logDetail: `statut=${q('#a-statut').value}` }, session.nom);
      await reload(); toast('Modifications enregistrées.'); render();
    };
    q('#a-notes-save').onclick = async () => { await data.updateDemande(d.id, { notesInternes: q('#a-notes').value, _logAction: 'Notes internes modifiées' }, session.nom); await reload(); toast('Notes enregistrées.'); };
    q('#a-rep-save').onclick = async () => { const t = q('#a-rep').value.trim(); if (!t) return; await data.addReponseDirection(d.id, t, session.nom); await reload(); toast('Réponse direction enregistrée.'); render(); };
    q('#a-pub-save').onclick = async () => { await data.updateDemande(d.id, { reponsePubliee: q('#a-pub').value.trim(), _logAction: 'Réponse publiée au salarié' }, session.nom); await reload(); toast('Réponse publiée pour le salarié.'); };
    q('#act-save').onclick = async () => {
      const lib = q('#act-lib').value.trim(); if (!lib) { toast('Décrivez l\'action.', 'err'); return; }
      await data.addAction(d.id, { libelle: lib, responsable: q('#act-resp').value.trim(), echeance: q('#act-ech').value }, session.nom);
      await data.updateDemande(d.id, { statut: 'Action à suivre', _logAction: 'Passage en action à suivre' }, session.nom);
      await reload(); toast('Action de suivi ajoutée.'); render();
    };
    q('#a-close').onclick = async () => {
      const motif = prompt('Motif de clôture :', 'Traité'); if (motif == null) return;
      await data.updateDemande(d.id, { statut: 'Clôturée', motifCloture: motif, _logAction: 'Dossier clôturé', _logDetail: motif }, session.nom);
      await reload(); toast('Dossier clôturé.'); render();
    };
    const del = q('#a-delete');
    if (del) del.onclick = async () => {
      if (!confirm('Supprimer DÉFINITIVEMENT cette demande ?\n\nCette action est irréversible et sera tracée dans le journal.')) return;
      try {
        await data.deleteDemande(d.id, session.nom);
        await reload(); toast('Demande supprimée.'); state.view = 'demandes'; render();
      } catch (e) { toast('Suppression impossible' + (e && e.message ? ' : ' + e.message : '') + '.', 'err'); }
    };
  }
  function renderMessages(host, demandeId) {
    const msgs = data.messagesFor(demandeId);
    host.innerHTML = msgs.length ? '' : '<p class="muted small">Aucun échange pour le moment.</p>';
    msgs.forEach(m => {
      host.appendChild(el('div', { class: 'msg ' + (m.interne ? 'interne' : (m.role === 'salarie' ? 'salarie' : 'elu')) }, [
        el('div', { class: 'who', text: `${m.auteur}${m.interne ? ' · note interne' : ''} · ${fmtDate(m.date)}` }),
        el('div', { text: m.contenu }),
      ]));
    });
  }
  async function sendMsg(box, demandeId, interne) {
    const ta = box.querySelector('#msg'); const t = ta.value.trim(); if (!t) return;
    await data.addEluMessage(demandeId, t, session.nom, { interne });
    await reload(); ta.value = '';
    renderMessages(box.querySelector('#messages'), demandeId);
    toast(interne ? 'Note interne ajoutée.' : 'Message envoyé au salarié.');
  }

  /* ======================= RÉUNIONS (§7) ======================= */
  function viewReunions() {
    const qs = data.questionsReunion();
    const box = el('div');
    box.innerHTML = `
      <h1>Préparation des réunions</h1>
      <p class="page-sub">Questions ajoutées depuis les fiches. Exportez la version anonymisée à communiquer, ou la version complète réservée aux élus.</p>
      <div class="row" style="margin-bottom:14px">
        <button class="btn btn-primary btn-sm" id="ex-word" type="button">Export Word</button>
        <button class="btn btn-ghost btn-sm" id="ex-pdf" type="button">Export PDF</button>
        <button class="btn btn-ghost btn-sm" id="ex-copy" type="button">Copier (email)</button>
        <span class="grow"></span>
        <label class="small" style="display:flex;gap:6px;align-items:center;font-weight:400"><input type="checkbox" id="ex-full" style="width:auto"> Version complète (élus)</label>
      </div>
      <div id="q-list"></div>`;
    const host = box.querySelector('#q-list');
    if (!qs.length) host.innerHTML = '<p class="muted">Aucune question préparée. Depuis une fiche, cliquez « → Réunion » sur une formulation.</p>';
    qs.forEach(q => host.appendChild(el('div', { class: 'formul', html: `<h4>${escapeHTML(q.format)} · ${escapeHTML(q.instance)} <span class="badge badge-mute">${escapeHTML(q.publicRef || '')}</span></h4><div class="txt">${escapeHTML(q.texte)}</div>` })));
    const demandesForExport = () => { const ids = [...new Set(qs.map(q => q.demandeId))]; return data.demandes().filter(d => ids.includes(d.id)); };
    box.querySelector('#ex-word').onclick = () => exporter.toWord(demandesForExport(), { anonymise: !box.querySelector('#ex-full').checked, titre: 'Questions de réunion', filename: 'questions-reunion' });
    box.querySelector('#ex-pdf').onclick = () => exporter.toPDF(demandesForExport(), { anonymise: !box.querySelector('#ex-full').checked, titre: 'Questions de réunion' });
    box.querySelector('#ex-copy').onclick = async () => { const ok = await exporter.toClipboard(demandesForExport(), { anonymise: !box.querySelector('#ex-full').checked, titre: 'Questions de réunion' }); toast(ok ? 'Copié dans le presse-papier.' : 'Copie impossible.', ok ? 'ok' : 'err'); };
    renderShell(box);
  }

  /* ======================= STATISTIQUES (§6.2) ======================= */
  function viewStats() {
    const st = data.stats(); const seuil = st.seuil;
    const bars = (obj) => {
      const max = Math.max(1, ...Object.values(obj));
      return Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
        const masked = v < seuil;
        return `<div class="bar-row"><span>${escapeHTML(k)}</span><div class="bar-track"><div class="bar" style="width:${Math.round(v / max * 100)}%"></div></div>
          <span>${masked ? '<span class="muted" title="Masqué (< seuil)">•••</span>' : v}</span></div>`;
      }).join('');
    };
    const box = el('div');
    box.innerHTML = `
      <h1>Statistiques anonymisées</h1>
      <p class="page-sub">Protection contre la réidentification : les groupes de moins de <strong>${seuil}</strong> demandes sont masqués (seuil paramétrable).</p>
      <div class="kpi-grid">
        ${kpi(st.total, 'Demandes au total', '', 'demandes', {})}
        ${kpi(st.sansReponse, 'Sans réponse', 'warn', 'demandes', {})}
        ${kpi(st.engagementsEchus, 'Engagements échus', 'alert', 'demandes', {})}
      </div>
      <div class="card card-pad"><h3>Sujets les plus fréquents</h3>${bars(st.byCat)}</div>
      <div class="card card-pad" style="margin-top:12px"><h3>Répartition par secteur</h3>${bars(st.byEtab)}</div>
      <div class="card card-pad" style="margin-top:12px"><h3>Évolution par mois</h3>${bars(st.byMonth)}</div>`;
    renderShell(box); wireKPIs();
  }

  /* ======================= QR PORTAIL ======================= */
  function viewQR() {
    const box = el('div');
    const portalURL = new URL('index.html', location.href).href;
    box.innerHTML = `
      <h1>QR code du portail salarié</h1>
      <p class="page-sub">Affichez ou imprimez ce QR code. Les salariés y accèdent sans compte ni téléchargement.</p>
      <div class="card card-pad center">
        <div id="qr-box"></div>
        <p class="small muted" style="margin-top:12px">${escapeHTML(portalURL)}</p>
        <button class="btn btn-ghost btn-sm" id="copy-url" type="button">Copier le lien</button>
      </div>`;
    renderShell(box);
    try { new QRCode(box.querySelector('#qr-box'), { text: portalURL, width: 220, height: 220, colorDark: '#0e1526', colorLight: '#ffffff' }); }
    catch (e) { box.querySelector('#qr-box').innerHTML = '<p class="muted small">Lien : ' + escapeHTML(portalURL) + '</p>'; }
    box.querySelector('#copy-url').onclick = async () => { try { await navigator.clipboard.writeText(portalURL); toast('Lien copié.'); } catch (e) { toast('Copie impossible.', 'err'); } };
  }

  /* ======================= JOURNAL (§9) ======================= */
  function viewJournal() {
    const j = data.journal().slice(0, 200);
    const box = el('div');
    box.innerHTML = `<h1>Journal des actions</h1><p class="page-sub">Traçabilité des accès, modifications et actions sensibles (§9).</p><div class="card card-pad" id="j"></div>`;
    const host = box.querySelector('#j');
    host.innerHTML = j.map(e => `<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--border)">
      <div><strong>${escapeHTML(e.action)}</strong>${e.detail ? ' — <span class="muted small">' + escapeHTML(e.detail) + '</span>' : ''}<br>
      <span class="small muted">${escapeHTML(e.user)}${e.demandeId ? ' · dossier ' + escapeHTML((data.demandeById(e.demandeId) || {}).publicRef || '') : ''}</span></div>
      <span class="small muted">${fmtDate(e.date)}</span></div>`).join('') || '<p class="muted">Journal vide.</p>';
    renderShell(box);
  }

  /* ======================= ADMINISTRATION ======================= */
  function viewAdmin() {
    const org = data.organisation();
    const box = el('div');
    box.innerHTML = `
      <h1>Administration</h1>
      <p class="page-sub">Paramètres de l'organisation, protection des données, jeu de démonstration.</p>
      <div class="card card-pad">
        <h3>Protection des statistiques</h3>
        <div class="field"><label for="seuil">Seuil anti-réidentification (§6.2)</label><input id="seuil" type="number" min="1" max="50" value="${org.seuilAnonymat}"></div>
        <div class="field"><label for="cons">Durée de conservation (jours)</label><input id="cons" type="number" min="30" value="${org.conservationJours}"></div>
        <button class="btn btn-primary btn-sm" id="save-org" type="button">Enregistrer</button>
        ${data.online() ? '<p class="hint" style="margin-top:8px">En ligne : ces paramètres se modifient aussi directement dans Supabase (table organisations).</p>' : ''}
      </div>
      <div class="card card-pad" style="margin-top:12px">
        <h3>Comptes élus (§8)</h3>
        ${data.demoAccounts().map(u => `<div class="row-between" style="padding:6px 0;border-bottom:1px solid var(--border)"><span>${escapeHTML(u.nom)} <span class="muted small">${escapeHTML(u.email)}</span></span>${badge(store.ROLES[u.role].label, 'mute')}</div>`).join('')}
      </div>
      <div class="card card-pad" style="margin-top:12px">
        <h3>Données</h3>
        <div class="row">
          <button class="btn btn-ghost btn-sm" id="export-json" type="button">Exporter les données (JSON)</button>
          ${data.online() ? '' : '<button class="btn btn-danger btn-sm" id="reset" type="button">Réinitialiser le jeu de démo</button>'}
        </div>
        <p class="hint" style="margin-top:8px">L'export complet évite l'enfermement propriétaire (§13).</p>
      </div>`;
    box.querySelector('#save-org').onclick = () => {
      if (data.online()) { toast('En ligne : modifiez la table « organisations » dans Supabase.'); return; }
      const db = store.get();
      db.organisation.seuilAnonymat = Math.max(1, parseInt(box.querySelector('#seuil').value, 10) || 5);
      db.organisation.conservationJours = Math.max(30, parseInt(box.querySelector('#cons').value, 10) || 365);
      store.log(db, 'Paramètres organisation modifiés', { user: session.nom }); store.save(db); toast('Paramètres enregistrés.');
    };
    box.querySelector('#export-json').onclick = () => {
      const blob = new Blob([data.exportAll()], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'parole-salaries-export.json'; a.click(); toast('Export généré.');
    };
    const rb = box.querySelector('#reset');
    if (rb) rb.onclick = async () => { if (!confirm('Réinitialiser toutes les données locales de démonstration ?')) return; store.resetDemo(); await reload(); toast('Jeu de démo réinitialisé.'); state.view = 'dashboard'; render(); };
    renderShell(box);
  }

  /* ======================= ROUTEUR ======================= */
  function render() {
    if (!session) { renderLogin(); return; }
    switch (state.view) {
      case 'dashboard': viewDashboard(); break;
      case 'demandes': viewDemandes(); break;
      case 'fiche': viewFiche(); break;
      case 'reunions': viewReunions(); break;
      case 'stats': viewStats(); break;
      case 'qr': viewQR(); break;
      case 'journal': viewJournal(); break;
      case 'admin': viewAdmin(); break;
      default: viewDashboard();
    }
  }

  /* ======================= DÉMARRAGE ======================= */
  async function start() {
    try {
      if (data.online()) { session = await data.currentSession(); }
      else { const s = sessionStorage.getItem(SESSION_KEY); if (s) session = JSON.parse(s); }
    } catch (e) { session = null; }
    if (session) { PS.session = session; try { await reload(); } catch (e) {} }
    render();
  }
  start();
})();
