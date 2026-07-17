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
  function canDelete() { return ['referent_confidentiel', 'admin_cse', 'super_admin'].includes(session.role); }
  function visibleDemandes() {
    const ds = data.demandes();
    return data.online() ? ds : ds.filter(canSeeDemande); // en ligne : la RLS a déjà filtré
  }
  // Actions de suivi (§4.3) des demandes visibles, avec un indicateur d'urgence par échéance.
  function visibleActions() {
    const visibleIds = new Set(visibleDemandes().map(d => d.id));
    const today = new Date().toISOString().slice(0, 10);
    const soonLimit = addDays(today, 7);
    return data.allActions().filter(a => visibleIds.has(a.demandeId)).map(a => {
      let urgency = 'done';
      if (a.etat !== 'Fait') {
        if (!a.echeance) urgency = 'nodate';
        else if (a.echeance < today) urgency = 'overdue';
        else if (a.echeance <= soonLimit) urgency = 'soon';
        else urgency = 'upcoming';
      }
      return Object.assign({}, a, { urgency });
    });
  }
  function addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
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
        ${data.online() ? `
        <div class="row-between small" style="margin-top:10px">
          <a href="#" id="link-forgot">Mot de passe oublié ?</a>
          <a href="#" id="link-signup">Créer un compte élu</a>
        </div>` : ''}
        <div class="notice ${data.online() ? 'notice-success' : 'notice-info'}" style="margin-top:14px"><span class="ico">${data.online() ? '🟢' : '🔐'}</span><div class="small">${data.online() ? 'Mode en ligne (base Supabase sécurisée).' : 'Mode local (démo). Renseignez js/config.js pour la base partagée.'}</div></div>
      </div>
      <p class="center small muted" style="margin-top:14px"><a href="index.html">← Portail salarié</a></p>`;
    const lf = box.querySelector('#link-forgot'); if (lf) lf.onclick = (e) => { e.preventDefault(); renderForgot(); };
    const ls = box.querySelector('#link-signup'); if (ls) ls.onclick = (e) => { e.preventDefault(); renderSignup(); };
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
        if (u.role === 'en_attente') { renderPending(); return; }
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

  /* ======================= COMPTE EN ATTENTE DE VALIDATION ======================= */
  function renderPending() {
    const box = el('div', { class: 'login-wrap' });
    box.innerHTML = `
      <div class="login-card center">
        <div class="brand"><img src="assets/logo.png" alt="Logo Parole Salariés By Cedmad"></div>
        <div style="font-size:2rem;margin:6px 0">⏳</div>
        <h1 style="font-size:1.15rem">Compte en attente de validation</h1>
        <p class="muted small">Bonjour ${escapeHTML((session && session.nom) || '')}, votre compte a bien été créé mais doit être <strong>validé par un administrateur</strong> avant de pouvoir accéder à l'espace élus. Vous serez informé·e une fois activé.</p>
        <button class="btn btn-ghost btn-block" id="logout-pending" type="button" style="margin-top:14px">Se déconnecter</button>
      </div>
      <p class="center small muted" style="margin-top:14px"><a href="index.html">← Portail salarié</a></p>`;
    box.querySelector('#logout-pending').onclick = async () => {
      await data.logout(); session = null; PS.session = null;
      try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {} renderLogin();
    };
    const r = appRoot(); r.innerHTML = ''; r.appendChild(box);
  }

  /* ======================= MOT DE PASSE OUBLIÉ (auto-service) ======================= */
  function renderForgot() {
    const box = el('div', { class: 'login-wrap' });
    box.innerHTML = `
      <div class="login-card">
        <div class="brand"><img src="assets/logo.png" alt="Logo Parole Salariés By Cedmad">
          <h1 style="margin:10px 0 2px;font-size:1.2rem">Mot de passe oublié</h1>
          <p class="muted small mt-0">Recevez par email un lien pour choisir un nouveau mot de passe.</p></div>
        <div class="field"><label for="femail">Votre email</label><input id="femail" type="email" placeholder="vous@exemple.fr"></div>
        <button class="btn btn-primary btn-block" id="send-reset" type="button">Envoyer le lien</button>
        <button class="btn btn-ghost btn-block" id="back-login" type="button" style="margin-top:8px">← Retour à la connexion</button>
      </div>`;
    box.querySelector('#send-reset').onclick = async () => {
      const email = box.querySelector('#femail').value.trim();
      if (!email) { toast('Indiquez votre email.', 'err'); return; }
      const btn = box.querySelector('#send-reset'); btn.disabled = true; btn.textContent = 'Envoi…';
      try {
        await data.resetPasswordForEmail(email, location.origin + location.pathname);
        box.querySelector('.login-card').innerHTML = `
          <div class="notice notice-success"><span class="ico">📩</span><div>Si un compte existe pour <strong>${escapeHTML(email)}</strong>, un email vient d'être envoyé avec un lien de réinitialisation.</div></div>
          <button class="btn btn-ghost btn-block" id="back-login2" type="button" style="margin-top:14px">← Retour à la connexion</button>`;
        box.querySelector('#back-login2').onclick = renderLogin;
      } catch (e) { toast('Envoi impossible.', 'err'); btn.disabled = false; btn.textContent = 'Envoyer le lien'; }
    };
    box.querySelector('#back-login').onclick = renderLogin;
    const r = appRoot(); r.innerHTML = ''; r.appendChild(box);
  }

  /* ======================= CRÉER UN COMPTE (auto-inscription §8) ======================= */
  function renderSignup() {
    const box = el('div', { class: 'login-wrap' });
    box.innerHTML = `
      <div class="login-card">
        <div class="brand"><img src="assets/logo.png" alt="Logo Parole Salariés By Cedmad">
          <h1 style="margin:10px 0 2px;font-size:1.2rem">Créer un compte élu</h1>
          <p class="muted small mt-0">Votre compte restera <strong>en attente</strong> jusqu'à validation par un administrateur.</p></div>
        <div class="field"><label for="snom">Nom</label><input id="snom" type="text" placeholder="Prénom Nom"></div>
        <div class="field"><label for="semail">Email</label><input id="semail" type="email" placeholder="vous@exemple.fr"></div>
        <div class="field"><label for="spass">Mot de passe</label><input id="spass" type="password" placeholder="8 caractères minimum"></div>
        <div class="field"><label for="spass2">Confirmer le mot de passe</label><input id="spass2" type="password"></div>
        <button class="btn btn-primary btn-block" id="do-signup" type="button">Créer mon compte</button>
        <button class="btn btn-ghost btn-block" id="back-login" type="button" style="margin-top:8px">← Retour à la connexion</button>
      </div>`;
    box.querySelector('#do-signup').onclick = async () => {
      const nom = box.querySelector('#snom').value.trim();
      const email = box.querySelector('#semail').value.trim();
      const p1 = box.querySelector('#spass').value, p2 = box.querySelector('#spass2').value;
      if (!nom || !email || !p1) { toast('Merci de remplir tous les champs.', 'err'); return; }
      if (p1.length < 8) { toast('Le mot de passe doit faire au moins 8 caractères.', 'err'); return; }
      if (p1 !== p2) { toast('Les mots de passe ne correspondent pas.', 'err'); return; }
      const btn = box.querySelector('#do-signup'); btn.disabled = true; btn.textContent = 'Création…';
      try {
        await data.signUp(email, p1, nom);
        box.querySelector('.login-card').innerHTML = `
          <div class="notice notice-info"><span class="ico">⏳</span><div>Compte créé pour <strong>${escapeHTML(nom)}</strong>. Il est <strong>en attente de validation</strong> : un administrateur doit vous attribuer un rôle avant que vous puissiez accéder à l'espace élus.</div></div>
          <button class="btn btn-ghost btn-block" id="back-login2" type="button" style="margin-top:14px">← Retour à la connexion</button>`;
        box.querySelector('#back-login2').onclick = renderLogin;
      } catch (e) {
        toast('Création impossible' + (e && e.message ? ' : ' + e.message : '') + '.', 'err');
        btn.disabled = false; btn.textContent = 'Créer mon compte';
      }
    };
    box.querySelector('#back-login').onclick = renderLogin;
    const r = appRoot(); r.innerHTML = ''; r.appendChild(box);
  }

  /* ======================= NOUVEAU MOT DE PASSE (après lien reçu par email) ======================= */
  function renderResetPassword() {
    const box = el('div', { class: 'login-wrap' });
    box.innerHTML = `
      <div class="login-card">
        <div class="brand"><img src="assets/logo.png" alt="Logo Parole Salariés By Cedmad">
          <h1 style="margin:10px 0 2px;font-size:1.2rem">Nouveau mot de passe</h1></div>
        <div class="field"><label for="npass">Nouveau mot de passe</label><input id="npass" type="password" placeholder="8 caractères minimum"></div>
        <div class="field"><label for="npass2">Confirmer</label><input id="npass2" type="password"></div>
        <button class="btn btn-primary btn-block" id="do-reset" type="button">Enregistrer le mot de passe</button>
      </div>`;
    box.querySelector('#do-reset').onclick = async () => {
      const p1 = box.querySelector('#npass').value, p2 = box.querySelector('#npass2').value;
      if (p1.length < 8) { toast('8 caractères minimum.', 'err'); return; }
      if (p1 !== p2) { toast('Les mots de passe ne correspondent pas.', 'err'); return; }
      const btn = box.querySelector('#do-reset'); btn.disabled = true; btn.textContent = 'Enregistrement…';
      try {
        await data.updatePassword(p1);
        toast('Mot de passe mis à jour. Reconnectez-vous.');
        await data.logout(); session = null; PS.session = null;
        try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
        renderLogin();
      } catch (e) { toast('Erreur : ' + (e && e.message ? e.message : ''), 'err'); btn.disabled = false; btn.textContent = 'Enregistrer le mot de passe'; }
    };
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
    const overdue = visibleActions().filter(a => a.urgency === 'overdue').length;
    const nav = [
      { id: 'dashboard', ic: '📊', label: 'Tableau de bord' },
      { id: 'demandes', ic: '📥', label: 'Demandes', n: c.nouvelles || '' },
      { id: 'echeances', ic: '📅', label: 'Échéances', n: overdue || '' },
      { id: 'reunions', ic: '🗂️', label: 'Réunions' },
      { id: 'stats', ic: '📈', label: 'Statistiques' },
      { id: 'qr', ic: '🔗', label: 'QR portail' },
    ];
    if (['admin_cse', 'super_admin'].includes(session.role)) nav.push({ id: 'admin', ic: '⚙️', label: 'Administration' });

    const shell = el('div');
    shell.innerHTML = `
      <div class="elus-topbar">
        <img src="assets/logo.png" alt="">
        <div class="title">Parole Salariés<small>Espace élus</small></div>
        <div class="spacer"></div>
        <div class="topbar-actions">
        <div class="who"><b>${escapeHTML(session.nom)}</b><span class="role-chip">${escapeHTML(store.ROLES[session.role].label)}</span></div>
        <button class="btn btn-ghost btn-sm tb-btn" id="refresh" type="button" title="Voir les nouvelles demandes" style="color:#fff;border-color:rgba(255,255,255,.25)">↻<span class="lbl"> Actualiser</span></button>
        ${data.online() ? `<button class="btn btn-ghost btn-sm tb-btn" id="my-password" type="button" title="Recevoir un lien pour changer mon mot de passe" style="color:#fff;border-color:rgba(255,255,255,.25)">🔑<span class="lbl"> Mot de passe</span></button>` : ''}
        <button class="btn btn-ghost btn-sm tb-btn" id="logout" type="button" style="color:#fff;border-color:rgba(255,255,255,.25)">Quitter</button>
        </div>
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
    shell.querySelector('#refresh').onclick = async () => {
      const b = shell.querySelector('#refresh'); b.disabled = true; b.textContent = '…';
      try { await reload(); toast('Liste actualisée.'); } catch (e) { toast('Actualisation impossible.', 'err'); }
      render();
    };
    const pwBtn = shell.querySelector('#my-password');
    if (pwBtn) pwBtn.onclick = async () => {
      if (!session.email) { toast('Email introuvable pour ce compte.', 'err'); return; }
      pwBtn.disabled = true;
      try { await data.resetPasswordForEmail(session.email, location.origin + location.pathname); toast('Email envoyé à ' + session.email + '. Suivez le lien pour choisir un nouveau mot de passe.'); }
      catch (e) { toast('Envoi impossible.', 'err'); }
      pwBtn.disabled = false;
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
    const closedStatuts = ['Clôturée', 'Archivée', 'Résolue'];
    const withDoublons = ds.filter(d => d.iaDoublons && d.iaDoublons.length && !closedStatuts.includes(d.statut));

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
      ${withDoublons.length ? `<div class="card card-pad" style="margin-bottom:14px;border-left:3px solid var(--primary)">
        <h3>🔗 Doublons potentiels détectés par l'IA (§6.2) ${badge(withDoublons.length + ' demande' + (withDoublons.length > 1 ? 's' : ''), 'primary')}</h3>
        <p class="hint">Suggestions à vérifier — jamais une fusion automatique.</p>
        <div id="doublons-alert"></div>
      </div>` : ''}
      <div class="card card-pad"><h3>Dernières demandes</h3><div id="recent"></div></div>`;
    if (withDoublons.length) {
      const dhost = box.querySelector('#doublons-alert');
      withDoublons.forEach(d => dhost.appendChild(demItem(d)));
    }
    const recent = box.querySelector('#recent');
    ds.slice(0, 5).forEach(d => recent.appendChild(demItem(d)));
    if (!ds.length) recent.innerHTML = '<p class="muted small">Aucune demande dans votre périmètre.</p>';
    renderShell(box); wireKPIs();
  }

  /* ======================= ÉCHÉANCES ======================= */
  const URGENCY_LABEL = { overdue: '⏰ En retard', soon: '🟠 Bientôt (< 7 j)', upcoming: '🗓️ À venir', nodate: 'Sans échéance', done: 'Faite' };
  const URGENCY_COLOR = { overdue: 'danger', soon: 'warn', upcoming: 'mute', nodate: 'mute', done: 'ok' };
  const URGENCY_ORDER = { overdue: 0, soon: 1, upcoming: 2, nodate: 3, done: 4 };
  function viewEcheances() {
    const editable = canEdit();
    const all = visibleActions().sort((a, b) => (URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]) || (a.echeance || '9999').localeCompare(b.echeance || '9999'));
    const pending = all.filter(a => a.urgency !== 'done');
    const done = all.filter(a => a.urgency === 'done');
    const overdueCount = all.filter(a => a.urgency === 'overdue').length;
    const soonCount = all.filter(a => a.urgency === 'soon').length;

    const actionRow = (a) => {
      const d = a.demande;
      const node = el('div', { class: 'dem-item', onclick: () => openFiche(d.id) });
      node.innerHTML = `
        <span class="ic">📅</span>
        <div class="body">
          <div class="res">${escapeHTML(a.libelle || 'Action de suivi')}</div>
          <div class="meta"><span>${escapeHTML(d.publicRef)}</span>·<span>${escapeHTML(d.resume || '')}</span>
            ${a.responsable ? '·<span>' + escapeHTML(a.responsable) + '</span>' : ''}
            ${badge(URGENCY_LABEL[a.urgency], URGENCY_COLOR[a.urgency])}</div>
        </div>
        <div class="right">
          <div class="small muted">${a.echeance ? fmtDay(a.echeance) : '—'}</div>
          <div class="row" style="margin-top:4px;gap:6px">
            ${editable && a.urgency !== 'done' ? `<button class="btn btn-ghost btn-sm" data-act="reunion" type="button">→ Réunion</button>` : ''}
            ${editable ? `<button class="btn btn-ghost btn-sm" data-act="toggle" type="button">${a.etat === 'Fait' ? 'Rouvrir' : 'Marquer fait'}</button>` : ''}
          </div>
        </div>`;
      const btn = node.querySelector('[data-act="toggle"]');
      if (btn) btn.onclick = async (ev) => {
        ev.stopPropagation(); btn.disabled = true;
        try {
          await data.updateAction(d.id, a.id, { etat: a.etat === 'Fait' ? 'À faire' : 'Fait' }, session.nom);
          await reload(); toast(a.etat === 'Fait' ? 'Action rouverte.' : 'Action marquée comme faite.'); render();
        } catch (e) { toast('Mise à jour impossible.', 'err'); btn.disabled = false; }
      };
      const rb = node.querySelector('[data-act="reunion"]');
      if (rb) rb.onclick = async (ev) => {
        ev.stopPropagation(); rb.disabled = true;
        try {
          await data.addQuestionReunion({ demandeId: d.id, publicRef: d.publicRef, instance: d.instance, format: 'Action de suivi', texte: a.libelle }, session.nom);
          await reload(); toast('Action ajoutée à la préparation de réunion.'); render();
        } catch (e) { toast('Ajout impossible.', 'err'); rb.disabled = false; }
      };
      return node;
    };

    const box = el('div');
    box.innerHTML = `
      <h1>Échéances</h1>
      <p class="page-sub">Toutes les actions de suivi (§4.3) de votre périmètre, triées par urgence.</p>
      <div class="kpi-grid">
        <div class="kpi alert"><div class="v">${overdueCount}</div><div class="l">En retard</div></div>
        <div class="kpi warn"><div class="v">${soonCount}</div><div class="l">Bientôt (&lt; 7 j)</div></div>
        <div class="kpi ok"><div class="v">${done.length}</div><div class="l">Faites</div></div>
      </div>
      <div class="card card-pad"><h3>À traiter</h3><div id="pending"></div></div>
      <div class="card card-pad" style="margin-top:12px">
        <div class="row-between"><h3 style="margin:0">Faites <span class="muted small">(${done.length})</span></h3>
          ${done.length ? '<button class="btn btn-ghost btn-sm" id="toggle-done" type="button">Afficher</button>' : ''}</div>
        <div id="done-list" style="display:none;margin-top:10px"></div>
      </div>`;
    const pendingHost = box.querySelector('#pending');
    if (pending.length) pending.forEach(a => pendingHost.appendChild(actionRow(a)));
    else pendingHost.innerHTML = '<p class="muted small">Aucune action de suivi en attente dans votre périmètre.</p>';
    const doneHost = box.querySelector('#done-list');
    done.forEach(a => doneHost.appendChild(actionRow(a)));
    const toggleBtn = box.querySelector('#toggle-done');
    if (toggleBtn) toggleBtn.onclick = () => {
      const showing = doneHost.style.display !== 'none';
      doneHost.style.display = showing ? 'none' : '';
      toggleBtn.textContent = showing ? 'Afficher' : 'Masquer';
    };
    renderShell(box);
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
          ${badge(conf.label, conf.color)} ${d.groupeId ? badge('regroupée', 'mute') : ''} ${d.iaDoublons && d.iaDoublons.length ? badge('🔗 doublon possible', 'primary') : ''}</div>
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
      toast('Accès refusé : ce dossier est hors de votre périmètre.', 'err'); return;
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
    const legalRef = PS.legal.forCategorie(d.categorie);

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
          <div class="card card-pad" style="border-left:3px solid var(--warn)">
            <h3>📚 Repères juridiques <span class="badge badge-warn">à titre indicatif</span></h3>
            <p class="hint">Informations générales pour orienter l'échange avec la direction — non exhaustif, ne remplace pas une analyse juridique. Catégorie : <strong>${escapeHTML(legalRef.categorie)}</strong>.</p>
            <ul style="margin:8px 0 0;padding-left:20px">
              ${legalRef.items.map(([libelle, ref]) => `<li class="small" style="margin-bottom:4px"><strong>${escapeHTML(ref)}</strong> — ${escapeHTML(libelle)}</li>`).join('')}
            </ul>
            ${legalRef.note ? `<p class="small soft" style="margin-top:8px">${escapeHTML(legalRef.note)}</p>` : ''}
            <p class="hint" style="margin-top:8px">Vérifier la version en vigueur des articles ainsi que la convention collective / les accords applicables. <a href="https://www.legifrance.gouv.fr/" target="_blank" rel="noopener">Legifrance ↗</a></p>
          </div>
          <div class="card card-pad">
            <h3>💬 Assistant de formulation (§5) ${d.iaFormulations ? badge('✨ IA · Gemini', 'primary') : ''}</h3>
            <p class="hint">Généré à partir des faits recueillis — modifiable, jamais transmis automatiquement.${d.iaConfiance ? ' Confiance IA : <strong>' + escapeHTML(d.iaConfiance) + '</strong>.' : ''}</p>
            ${session.role === 'super_admin' && data.online() ? `<button class="btn btn-ghost btn-sm" id="ia-retry" type="button" style="margin-bottom:8px" title="Réservé au super-administrateur — protège le quota gratuit partagé">🔄 ${d.iaFormulations ? 'Régénérer avec l’IA' : (d.iaTraiteAt ? 'Réessayer la classification IA' : 'Classification IA en cours… forcer maintenant')}</button>` : ''}
            <div id="formuls"></div>
          </div>
          ${d.iaDoublons && d.iaDoublons.length ? `<div class="card card-pad" style="border-left:3px solid var(--primary)">
            <h3>🔗 Doublons potentiels (§6.2) ${badge('✨ IA · Gemini', 'primary')}</h3>
            <p class="hint">Suggestion de l'IA à partir du sujet — <strong>jamais une fusion automatique</strong>. À vérifier et regrouper manuellement si pertinent.</p>
            <div id="doublons"></div>
          </div>` : ''}
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
    const baseForms = assistant.formulations(d);
    Object.keys(baseForms).forEach(k => {
      const aiTexte = d.iaFormulations && d.iaFormulations[k];
      const f = { titre: baseForms[k].titre, finalite: baseForms[k].finalite, texte: aiTexte || baseForms[k].texte, isAI: !!aiTexte };
      const card = el('div', { class: 'formul' });
      card.innerHTML = `<h4>${escapeHTML(f.titre)}${f.isAI ? ' ' + badge('IA', 'primary') : ''}</h4><div class="fin">${escapeHTML(f.finalite)}</div><div class="txt">${escapeHTML(f.texte)}</div>
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
    const dhost = box.querySelector('#doublons');
    if (dhost && d.iaDoublons) {
      d.iaDoublons.forEach(dup => {
        const other = data.demandes().find(x => x.publicRef === dup.public_ref);
        const card = el('div', { class: 'formul' });
        card.innerHTML = `<h4>${escapeHTML(dup.public_ref)}${other ? ' — ' + escapeHTML(other.resume || '') : ''}</h4>
          <div class="fin">${escapeHTML(dup.raison || '')}</div>
          <div class="acts">
            ${other ? '<button class="btn btn-sm btn-ghost" data-act="voir" type="button">Voir le dossier</button>' : '<span class="small muted">Dossier introuvable (peut-être clôturé depuis)</span>'}
            ${other && editable ? '<button class="btn btn-sm btn-primary" data-act="regrouper" type="button">Regrouper</button>' : ''}
          </div>`;
        const vb = card.querySelector('[data-act="voir"]');
        if (vb) vb.onclick = () => openFiche(other.id);
        const rb = card.querySelector('[data-act="regrouper"]');
        if (rb) rb.onclick = async () => {
          rb.disabled = true;
          try {
            await data.mergeDemandes(d.id, [other.id], session.nom);
            await reload(); toast('Demandes regroupées.'); render();
          } catch (e) { toast('Regroupement impossible.', 'err'); rb.disabled = false; }
        };
        dhost.appendChild(card);
      });
    }
    const iaBtn = box.querySelector('#ia-retry');
    if (iaBtn) iaBtn.onclick = async () => {
      iaBtn.disabled = true; const orig = iaBtn.textContent; iaBtn.textContent = '…';
      try {
        const r = await data.classifyDemande(d.publicRef, true);
        if (r && r.ok === false) throw new Error(r.error || 'échec');
        await reload(); toast('Classification IA mise à jour.'); render();
      } catch (e) {
        toast('IA indisponible' + (e && e.message ? ' : ' + e.message : '') + '.', 'err');
        iaBtn.disabled = false; iaBtn.textContent = orig;
      }
    };

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
        ${access.sensitive ? '<br><span class="small">Accès référent.</span>' : ''}</div></div>`;
    }
    return `<div class="notice notice-info"><span class="ico">🕶️</span><div>${escapeHTML(access.reason || 'Identité non accessible.')}
      ${access.protected ? '<br><span class="small">Seul le référent confidentiel peut y accéder.</span>' : ''}</div></div>`;
  }
  function actionsCard(d) {
    const opts = (arr, cur) => arr.map(o => `<option ${o === cur ? 'selected' : ''}>${o}</option>`).join('');
    // Secteur modifiable — utile quand le salarié a oublié de le renseigner (ex. « Question rapide »).
    // Un élu gestionnaire ne peut choisir que dans son propre périmètre ; référent/admin/super-admin voient tout.
    const allEtabs = data.etablissements();
    const etabChoices = session.role === 'elu_gestionnaire'
      ? allEtabs.filter(e => (session.perimetre || []).includes(e.id))
      : allEtabs;
    const curEtabId = d.etablissementId || (allEtabs.find(e => e.nom === d.etablissement) || {}).id || '';
    const etabOptions = `<option value="">— Non renseigné —</option>` +
      etabChoices.map(e => `<option value="${e.id}" ${e.id === curEtabId ? 'selected' : ''}>${escapeHTML(e.nom)}</option>`).join('');
    return `<div class="card card-pad">
      <h3>Actions (§4.3)</h3>
      <div class="field"><label>Statut</label><select id="a-statut">${opts(store.STATUTS, d.statut)}</select></div>
      <div class="field"><label>Catégorie</label><select id="a-cat"><option value="">— à classer —</option>${opts(store.CATEGORIES, d.categorie)}</select></div>
      <div class="field"><label>Priorité</label><select id="a-prio">${opts(store.PRIORITES, d.priorite)}</select></div>
      <div class="field"><label>Secteur</label><select id="a-etab">${etabOptions}</select></div>
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
      <p class="hint" style="margin-top:6px">Réservé à l'administration. Suppression <strong>définitive</strong> (spam / hors sujet).</p>` : ''}
    </div>`;
  }
  function wireActions(box, d) {
    const q = s => box.querySelector(s);
    q('#a-save').onclick = async () => {
      const etabId = q('#a-etab').value || null;
      const etabNom = etabId ? (data.etablissements().find(e => e.id === etabId) || {}).nom || '' : '';
      const btn = q('#a-save'); btn.disabled = true;
      try {
        await data.updateDemande(d.id, { statut: q('#a-statut').value, categorie: q('#a-cat').value, priorite: q('#a-prio').value,
          etablissementId: etabId, etablissement: etabNom,
          eluAffecte: q('#a-elu').value.trim() || null }, session.nom);
        await reload(); toast('Modifications enregistrées.'); render();
      } catch (e) {
        toast('Enregistrement impossible' + (e && e.message ? ' : ' + e.message : '') + '.', 'err');
        btn.disabled = false;
      }
    };
    q('#a-notes-save').onclick = async () => { await data.updateDemande(d.id, { notesInternes: q('#a-notes').value }, session.nom); await reload(); toast('Notes enregistrées.'); };
    q('#a-rep-save').onclick = async () => { const t = q('#a-rep').value.trim(); if (!t) return; await data.addReponseDirection(d.id, t, session.nom); await reload(); toast('Réponse direction enregistrée.'); render(); };
    q('#a-pub-save').onclick = async () => { await data.updateDemande(d.id, { reponsePubliee: q('#a-pub').value.trim() }, session.nom); await reload(); toast('Réponse publiée pour le salarié.'); };
    q('#act-save').onclick = async () => {
      const lib = q('#act-lib').value.trim(); if (!lib) { toast('Décrivez l\'action.', 'err'); return; }
      await data.addAction(d.id, { libelle: lib, responsable: q('#act-resp').value.trim(), echeance: q('#act-ech').value }, session.nom);
      await data.updateDemande(d.id, { statut: 'Action à suivre' }, session.nom);
      await reload(); toast('Action de suivi ajoutée.'); render();
    };
    q('#a-close').onclick = async () => {
      const motif = prompt('Motif de clôture :', 'Traité'); if (motif == null) return;
      await data.updateDemande(d.id, { statut: 'Clôturée', motifCloture: motif }, session.nom);
      await reload(); toast('Dossier clôturé.'); render();
    };
    const del = q('#a-delete');
    if (del) del.onclick = async () => {
      if (!confirm('Supprimer DÉFINITIVEMENT cette demande ?\n\nCette action est irréversible.')) return;
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
    // Les nouvelles demandes arrivent automatiquement ici — rien à cocher, elles
    // sortent seules de la liste dès que leur statut change (traitées ailleurs).
    const nouvelles = visibleDemandes().filter(d => d.statut === 'Nouvelle')
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const box = el('div');
    box.innerHTML = `
      <h1>Préparation des réunions</h1>
      <p class="page-sub">Les nouvelles demandes arrivent automatiquement ci-dessous. Les actions de suivi doivent être ajoutées manuellement depuis « Échéances ».</p>
      <div class="card card-pad" style="margin-bottom:14px">
        <h3>Nouvelles demandes à présenter ${nouvelles.length ? badge(String(nouvelles.length), 'primary') : ''}</h3>
        <div id="new-list"></div>
      </div>
      <h3 style="margin-bottom:8px">Questions préparées</h3>
      <p class="hint" style="margin-top:0">Ajoutées depuis une fiche (« → Réunion ») ou depuis une action de suivi. Exportez la version anonymisée à communiquer, ou la version complète réservée aux élus.</p>
      <div class="row" style="margin-bottom:14px">
        <button class="btn btn-primary btn-sm" id="ex-word" type="button">Export Word</button>
        <button class="btn btn-ghost btn-sm" id="ex-pdf" type="button">Export PDF</button>
        <button class="btn btn-ghost btn-sm" id="ex-copy" type="button">Copier (email)</button>
        <span class="grow"></span>
        <label class="small" style="display:flex;gap:6px;align-items:center;font-weight:400"><input type="checkbox" id="ex-full" style="width:auto"> Version complète (élus)</label>
      </div>
      <div id="q-list"></div>`;
    const newHost = box.querySelector('#new-list');
    if (!nouvelles.length) newHost.innerHTML = '<p class="muted small">Aucune nouvelle demande en attente.</p>';
    nouvelles.forEach(d => newHost.appendChild(demItem(d)));
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
    const PIE_COLORS = ['#2f7de1', '#2ec4a6', '#f2b134', '#e0553f', '#7c4ddb', '#0ea5a5', '#f45b8d', '#8b5e34', '#4c6ef5', '#22a06b', '#d97706', '#6d28d9'];
    const pie = (obj) => {
      const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]);
      const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
      let acc = 0;
      const stops = entries.map(([, v], i) => {
        const start = (acc / total * 100); acc += v;
        return `${PIE_COLORS[i % PIE_COLORS.length]} ${start.toFixed(2)}% ${(acc / total * 100).toFixed(2)}%`;
      }).join(', ');
      const legend = entries.map(([k, v], i) => {
        const masked = v < seuil;
        const pct = Math.round(v / total * 100);
        return `<div class="pie-legend-row"><span class="pie-dot" style="background:${PIE_COLORS[i % PIE_COLORS.length]}"></span>
          <span class="pie-label">${escapeHTML(k)}</span>
          <span class="pie-val">${masked ? '<span class="muted" title="Masqué (< seuil)">•••</span>' : v + ' (' + pct + '%)'}</span></div>`;
      }).join('');
      if (!entries.length) return '<p class="muted small">Aucune donnée pour l\'instant.</p>';
      return `<div class="pie-wrap"><div class="pie" style="background:conic-gradient(${stops})"></div><div class="pie-legend">${legend}</div></div>`;
    };
    // Croisement secteur × catégorie : fait ressortir d'un coup d'œil quel secteur
    // remonte le plus tel type de problème. Mêmes règles d'anonymisation que le
    // reste de la page (une cellule < seuil est masquée, jamais additionnée en clair).
    const heatmap = (byEtabCat, seuilVal) => {
      const etabs = Object.keys(byEtabCat).sort((a, b) => {
        const totalA = Object.values(byEtabCat[a]).reduce((s, n) => s + n, 0);
        const totalB = Object.values(byEtabCat[b]).reduce((s, n) => s + n, 0);
        return totalB - totalA;
      });
      if (!etabs.length) return '<p class="muted small">Aucune donnée pour l\'instant.</p>';
      const catTotals = {};
      etabs.forEach(e => Object.entries(byEtabCat[e]).forEach(([c, n]) => { catTotals[c] = (catTotals[c] || 0) + n; }));
      const cats = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a]);
      const maxCell = Math.max(1, ...etabs.flatMap(e => cats.map(c => byEtabCat[e][c] || 0)));
      const cellBg = (v) => v ? ` style="background:rgba(47,125,225,${(0.1 + 0.7 * (v / maxCell)).toFixed(2)})"` : '';
      const head = `<tr><th></th>${cats.map(c => `<th>${escapeHTML(c)}</th>`).join('')}<th>Total</th></tr>`;
      const rows = etabs.map(e => {
        const rowTotal = cats.reduce((s, c) => s + (byEtabCat[e][c] || 0), 0);
        const cells = cats.map(c => {
          const v = byEtabCat[e][c] || 0;
          const masked = v > 0 && v < seuilVal;
          return `<td${cellBg(masked ? 0 : v)}>${v === 0 ? '' : (masked ? '<span class="muted" title="Masqué (< seuil)">•••</span>' : v)}</td>`;
        }).join('');
        return `<tr><th>${escapeHTML(e)}</th>${cells}<td class="hm-total">${rowTotal}</td></tr>`;
      }).join('');
      return `<div class="hm-scroll"><table class="heatmap"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
    };
    const box = el('div');
    box.innerHTML = `
      <h1>Statistiques anonymisées</h1>
      <p class="page-sub">Protection contre la réidentification : les groupes de moins de <strong>${seuil}</strong> demandes sont masqués (seuil paramétrable).</p>
      <div class="kpi-grid">
        ${kpi(st.total, 'Demandes au total', '', 'demandes', {})}
        ${kpi(st.sansReponse, 'Sans réponse', 'warn', 'demandes', {})}
        ${kpi(st.engagementsEchus, 'Engagements échus', 'alert', 'echeances', {})}
      </div>
      <div class="card card-pad"><h3>Sujets les plus fréquents</h3>${pie(st.byCat)}</div>
      <div class="card card-pad" style="margin-top:12px"><h3>Répartition par secteur</h3>${pie(st.byEtab)}</div>
      <div class="card card-pad" style="margin-top:12px">
        <h3>Comparaison par secteur</h3>
        <p class="hint">Quel secteur remonte le plus tel type de problème — pour prioriser où porter l'effort.</p>
        ${heatmap(st.byEtabCat, seuil)}
      </div>
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

  /* ======================= ADMINISTRATION ======================= */
  // Description des droits réels de chaque rôle (cohérente avec canEdit/canDelete/identityFor/RLS)
  const ROLE_DETAILS = [
    { role: 'en_attente', label: 'En attente de validation', tag: 'Aucun accès', color: 'warn',
      desc: "Compte créé (auto-inscription) mais pas encore activé par un administrateur.",
      can: [], cant: ['Se connecter au tableau de bord', 'Voir la moindre demande', 'Toute action'] },
    { role: 'elu_lecteur', label: 'Élu lecteur', tag: 'Lecture seule', color: 'mute',
      desc: "Consultation des dossiers de ses secteurs autorisés uniquement.",
      can: ['Consulter les demandes de ses secteurs', 'Consulter les statistiques'],
      cant: ['Modifier une demande, un statut, une catégorie', 'Échanger avec un salarié', 'Voir une identité protégée', 'Supprimer une demande', 'Gérer les élus'] },
    { role: 'elu_gestionnaire', label: 'Élu gestionnaire', tag: 'Traitement', color: 'primary',
      desc: "Traite les dossiers de ses secteurs autorisés au quotidien.",
      can: ['Classer, prioriser, affecter une demande', 'Échanger avec le salarié et ajouter des notes internes', 'Ajouter réponses direction / actions de suivi', 'Préparer des questions de réunion', 'Exporter (Word/PDF/copie)'],
      cant: ['Voir une identité « confidentiel élus »', 'Supprimer une demande', 'Gérer les élus ou les paramètres', 'Sortir de son périmètre (secteurs)'] },
    { role: 'referent_confidentiel', label: 'Référent confidentiel', tag: 'Identités protégées', color: 'warn',
      desc: "Même travail qu'un gestionnaire, avec deux droits supplémentaires réservés : voir les identités des demandes « confidentiel élus » et supprimer les demandes farfelues/spam.",
      can: ['Tout ce que fait un élu gestionnaire (dans ses secteurs)', 'Voir les identités « confidentiel élus »', 'Supprimer une demande (spam/hors sujet)'],
      cant: ['Gérer les élus ou les paramètres', 'Sortir de son périmètre (secteurs)'] },
    { role: 'admin_cse', label: 'Administrateur CSE', tag: 'Administration', color: 'primary',
      desc: "Gère l'outil pour toute l'organisation : tous les secteurs, sans restriction de périmètre.",
      can: ['Tout ce que fait un élu gestionnaire, sur TOUS les secteurs', 'Supprimer une demande (spam/hors sujet)', 'Gérer les élus : rôle, secteurs, activer/désactiver un compte', 'Réinitialiser le mot de passe d\'un élu', 'Modifier les paramètres (seuil anti-réidentification, conservation)'],
      cant: ['Voir une identité « confidentiel élus » (réservé au référent et au super-admin)'] },
    { role: 'super_admin', label: 'Super-administrateur', tag: 'Accès total', color: 'danger',
      desc: "Rôle du propriétaire technique de l'outil. Cumule tous les droits, y compris ceux du référent confidentiel.",
      can: ['Tout ce que fait un administrateur CSE, sur tous les secteurs', 'Voir les identités « confidentiel élus » (comme le référent)'],
      cant: ["Voir l'identité d'une demande « anonyme total » (aucune identité n'est jamais enregistrée pour ce niveau, pour personne)"] },
  ];
  function supaUsersUrl() {
    const m = ((PS.config && PS.config.SUPABASE_URL) || '').match(/https:\/\/([a-z0-9]+)\.supabase/);
    return m ? `https://supabase.com/dashboard/project/${m[1]}/auth/users` : 'https://supabase.com/dashboard';
  }
  function eluRow(u, etabs) {
    const pending = u.role === 'en_attente';
    const roleLocked = u.role === 'super_admin';
    const row = el('div', { class: 'card-pad', style: `border:1px solid ${pending ? 'var(--warn)' : 'var(--border)'};border-radius:12px;margin-bottom:10px;background:${pending ? 'var(--warn-soft)' : 'var(--surface)'}` });
    const self = u.id === session.id;
    row.innerHTML = `
      <div class="row-between"><strong>${escapeHTML(u.nom || '—')}${self ? ' <span class="badge badge-primary">vous</span>' : ''}${pending ? ' ' + badge('En attente de validation', 'warn') : ''}</strong>
        <span class="small muted">${escapeHTML(u.email || '')}</span></div>
      <div class="row" style="margin-top:8px;align-items:flex-end;gap:14px">
        <div class="field" style="margin:0;min-width:190px"><label class="small">Rôle (statut)</label>
          ${roleLocked
            ? `<select data-role disabled title="Le rôle super-administrateur ne peut pas être changé ici."><option value="super_admin" selected>${escapeHTML(store.ROLES.super_admin.label)}</option></select>`
            : `<select data-role>${Object.entries(store.ROLES).filter(([k]) => k !== 'salarie' && k !== 'super_admin').map(([k, v]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>`}
          ${roleLocked ? `<div class="hint">🔒 Rôle verrouillé — non modifiable depuis cette interface.</div>` : ''}
        </div>
        <label class="small" style="display:flex;gap:6px;align-items:center;font-weight:600"><input type="checkbox" data-actif ${u.actif !== false ? 'checked' : ''} style="width:auto"> Compte actif</label>
      </div>
      <div style="margin-top:10px"><div class="small muted" style="margin-bottom:4px">Secteurs autorisés :</div>
        <div class="pill-list" data-sect>${etabs.map(e => `<label class="badge" style="cursor:pointer;font-weight:400"><input type="checkbox" value="${e.id}" ${(u.perimetre || []).includes(e.id) ? 'checked' : ''} style="width:auto;margin-right:5px">${escapeHTML(e.nom)}</label>`).join('') || '<span class="small muted">Aucun secteur.</span>'}</div>
        <div class="hint">Admin & super-admin voient tout, quels que soient les secteurs.</div></div>
      <div class="row" style="margin-top:10px">
        <button class="btn btn-primary btn-sm" data-save type="button">Enregistrer</button>
        ${data.online() && u.email ? `<button class="btn btn-ghost btn-sm" data-sendreset type="button">✉️ Envoyer un lien de réinitialisation</button>` : ''}
      </div>`;
    const rb = row.querySelector('[data-sendreset]');
    if (rb) rb.onclick = async () => {
      rb.disabled = true; const orig = rb.textContent; rb.textContent = 'Envoi…';
      try { await data.resetPasswordForEmail(u.email, location.origin + location.pathname); toast('Lien de réinitialisation envoyé à ' + u.email + '.'); }
      catch (e) { toast('Envoi impossible.', 'err'); }
      rb.disabled = false; rb.textContent = orig;
    };
    row.querySelector('[data-save]').onclick = async () => {
      const role = row.querySelector('[data-role]').value;
      const actif = row.querySelector('[data-actif]').checked;
      const perimetre = Array.from(row.querySelectorAll('[data-sect] input:checked')).map(i => i.value);
      if (self && (!actif || (session.role !== 'elu_lecteur' && role === 'elu_lecteur'))) {
        if (!confirm("Attention : vous modifiez VOTRE propre compte. Vous pourriez perdre vos droits. Continuer ?")) return;
      }
      const btn = row.querySelector('[data-save]'); btn.disabled = true; btn.textContent = '…';
      try { await data.updateElu(u.id, { role, actif, perimetre }, session.nom); toast('Élu mis à jour.'); }
      catch (e) { toast('Mise à jour impossible' + (e && e.message ? ' : ' + e.message : '') + '.', 'err'); }
      btn.disabled = false; btn.textContent = 'Enregistrer';
    };
    return row;
  }
  async function viewAdmin() {
    const org = data.organisation();
    const box = el('div');
    box.innerHTML = `
      <h1>Administration</h1>
      <p class="page-sub">Gestion des élus, des comptes, des paramètres et des données.</p>

      <div class="card card-pad">
        <h3>👥 Gestion des élus — rôles & secteurs</h3>
        <p class="hint">Attribue à chaque élu son <strong>rôle</strong> et ses <strong>secteurs</strong>. Décoche « Compte actif » pour <strong>bloquer l'accès</strong> (réversible).</p>

        <details style="margin:10px 0 14px">
          <summary style="cursor:pointer;font-weight:600;color:var(--primary-dark)">ℹ️ Détail des rôles — qui a le droit de faire quoi</summary>
          <div style="margin-top:10px" class="stack">
            ${ROLE_DETAILS.map(r => `
              <div class="card-pad" style="border:1px solid var(--border);border-radius:10px">
                <div class="row-between"><strong>${escapeHTML(r.label)}</strong>${badge(r.tag, r.color)}</div>
                <p class="small soft" style="margin:6px 0 8px">${escapeHTML(r.desc)}</p>
                <div class="small"><strong style="color:var(--success)">✓ Peut :</strong> ${r.can.map(escapeHTML).join(' · ')}</div>
                ${r.cant.length ? `<div class="small" style="margin-top:4px"><strong style="color:var(--danger)">✗ Ne peut pas :</strong> ${r.cant.map(escapeHTML).join(' · ')}</div>` : ''}
              </div>`).join('')}
          </div>
        </details>

        <div id="elus-list"><p class="muted small">Chargement…</p></div>
      </div>

      <div class="card card-pad" style="margin-top:12px">
        <h3>🔐 Comptes de connexion</h3>
        <p class="hint">Créer un compte, le <strong>supprimer définitivement</strong> ou <strong>réinitialiser un mot de passe</strong> se fait dans Supabase (le plus sécurisé). Le rôle se règle ensuite ci-dessus.</p>
        ${data.online() ? `<a class="btn btn-ghost btn-sm" href="${supaUsersUrl()}" target="_blank" rel="noopener">Ouvrir la gestion des comptes Supabase ↗</a>` : '<p class="muted small">Mode local : comptes de démonstration.</p>'}
      </div>

      <div class="card card-pad" style="margin-top:12px">
        <h3>Protection des statistiques</h3>
        <div class="field"><label for="seuil">Seuil anti-réidentification (§6.2)</label><input id="seuil" type="number" min="1" max="50" value="${org.seuilAnonymat}"></div>
        <div class="field"><label for="cons">Durée de conservation (jours)</label><input id="cons" type="number" min="30" value="${org.conservationJours}"></div>
        <button class="btn btn-primary btn-sm" id="save-org" type="button">Enregistrer</button>
        ${data.online() ? '<p class="hint" style="margin-top:8px">En ligne : ces paramètres se modifient dans Supabase (table organisations).</p>' : ''}
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
      store.save(db); toast('Paramètres enregistrés.');
    };
    box.querySelector('#export-json').onclick = () => {
      const blob = new Blob([data.exportAll()], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'parole-salaries-export.json'; a.click(); toast('Export généré.');
    };
    const rb = box.querySelector('#reset');
    if (rb) rb.onclick = async () => { if (!confirm('Réinitialiser toutes les données locales de démonstration ?')) return; store.resetDemo(); await reload(); toast('Jeu de démo réinitialisé.'); state.view = 'dashboard'; render(); };
    renderShell(box);
    const host = box.querySelector('#elus-list');
    try {
      const elus = await data.listElus();
      const etabs = data.etablissements();
      host.innerHTML = '';
      if (!elus.length) host.innerHTML = '<p class="muted small">Aucun élu trouvé.</p>';
      elus.forEach(u => host.appendChild(eluRow(u, etabs)));
    } catch (e) { host.innerHTML = '<p class="muted small">Impossible de charger les élus.</p>'; }
  }

  /* ======================= ROUTEUR ======================= */
  function render() {
    if (!session) { renderLogin(); return; }
    if (session.role === 'en_attente') { renderPending(); return; }
    switch (state.view) {
      case 'dashboard': viewDashboard(); break;
      case 'demandes': viewDemandes(); break;
      case 'echeances': viewEcheances(); break;
      case 'fiche': viewFiche(); break;
      case 'reunions': viewReunions(); break;
      case 'stats': viewStats(); break;
      case 'qr': viewQR(); break;
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
    if (session) {
      PS.session = session;
      if (session.role === 'en_attente') { renderPending(); return; }
      try { await reload(); } catch (e) {}
    }
    render();
  }

  // Détection du lien « réinitialiser mon mot de passe » reçu par email (Supabase
  // place les infos dans l'URL et déclenche l'évènement PASSWORD_RECOVERY).
  // On laisse un court délai au client pour traiter le lien avant le démarrage normal.
  (function boot() {
    const r = appRoot(); r.innerHTML = '<div class="login-wrap"><p class="center muted">Chargement…</p></div>';
    let handled = false;
    if (data.online()) {
      data.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY' && !handled) { handled = true; renderResetPassword(); }
      });
    }
    setTimeout(() => { if (!handled) start(); }, 350);
  })();
})();
