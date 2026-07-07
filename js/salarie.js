/* ===================================================================
   Parole Salariés By Cedmad — Portail salarié (flux de dépôt & suivi)
   =================================================================== */
(function () {
  'use strict';
  const { $, el, toast, escapeHTML, fmtDate } = PS.ui;
  const store = PS.store, assistant = PS.assistant;
  const root = () => document.getElementById('app-root');

  // Limites pièces jointes (§9, §17)
  const ATTACH_MAX = 5 * 1024 * 1024; // 5 Mo
  const ATTACH_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'];

  let draft = newDraft();
  function newDraft() {
    return { typeId: '', texteBrut: '', reponses: {}, confidentialite: '', nom: '', contact: '',
             etablissement: '', service: '', pieces: [], resume: '', categorie: '', consentBrouillon: false, consents: {} };
  }

  /* ---------- Barre de progression ---------- */
  function progress(step) {
    const total = 5;
    let s = '<div class="progress" aria-hidden="true">';
    for (let i = 1; i <= total; i++) s += `<div class="step ${i <= step ? 'done' : ''}"></div>`;
    return s + '</div>';
  }

  /* ======================= ÉCRAN ACCUEIL (§3.1) ======================= */
  function screenAccueil() {
    draft = newDraft();
    const actions = [
      { ic: '⚡', lab: 'Question rapide', sub: 'Écrivez, indiquez votre secteur, envoyé aussitôt', go: () => go('rapide') },
      { ic: '💬', lab: 'Poser une question', sub: 'CSE, CSSCT ou réclamation', go: () => go('type') },
      { ic: '⚠️', lab: 'Signaler une situation dangereuse', sub: 'Sécurité, accident, presque-accident', danger: true, go: () => { draft.typeId = 'danger'; go('redaction'); } },
      { ic: '💡', lab: 'Proposer une amélioration', sub: 'Idée pour améliorer le travail', go: () => { draft.typeId = 'amelioration'; go('redaction'); } },
      { ic: '📅', lab: 'Demander à être contacté·e', sub: 'Rendez-vous avec un élu', go: () => { draft.typeId = 'rdv'; go('redaction'); } },
      { ic: '🔎', lab: 'Suivre ma demande', sub: 'Avec votre numéro de suivi', go: () => go('suivi') },
    ];
    const box = el('div', { class: 'screen' });
    box.innerHTML = `
      <div class="hero">
        <h1>Votre parole compte</h1>
        <div class="confidence"><span>🔒</span> Vos élus reçoivent votre message. Vous choisissez qui peut voir votre identité. Rien n'est transmis automatiquement à l'employeur.</div>
      </div>
      <div class="action-list"></div>
      <p class="center small muted" style="margin-top:18px">Aucun compte ni téléchargement nécessaire.</p>
    `;
    const list = box.querySelector('.action-list');
    actions.forEach(a => {
      list.appendChild(el('button', { class: 'action-btn' + (a.danger ? ' danger' : ''), type: 'button', onclick: a.go }, [
        el('span', { class: 'ic', html: a.ic }),
        el('span', {}, [el('span', { class: 'lab', text: a.lab }), el('br'), el('span', { class: 'sub', text: a.sub })]),
      ]));
    });
    mount(box);
  }

  /* ======================= ÉCRAN QUESTION RAPIDE ======================= */
  // Parcours minimal : texte + secteur, envoi direct. Toujours anonyme (aucune identité
  // demandée), pour rester rapide — le choix est affiché clairement avant l'envoi (§3.4).
  function screenRapide() {
    const box = el('div', { class: 'screen' });
    box.innerHTML = `
      <h1>Question rapide</h1>
      <p class="muted small">Écrivez votre question, indiquez votre secteur, c'est envoyé — sans étape supplémentaire.</p>
      <div class="notice notice-info" style="margin-bottom:14px"><span class="ico">🕶️</span>
        <div>Envoyée <strong>anonymement</strong> (aucune identité communiquée). Pour être identifié·e, préciser des détails ou joindre un document, utilisez plutôt « Poser une question ».</div></div>
      <div class="field">
        <label for="rq-txt">Votre question</label>
        <textarea id="rq-txt" placeholder="Ex. Pourquoi les plannings changent-ils sans prévenir ?" style="min-height:120px"></textarea>
      </div>
      <div class="field">
        <label for="rq-secteur">Votre secteur</label>
        <select id="rq-secteur">
          <option value="">— Choisir un secteur —</option>
          ${(window.PS.config.secteurs || []).map(s => `<option>${escapeHTML(s)}</option>`).join('')}
        </select>
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" type="button" id="back">Retour</button>
        <button class="btn btn-gradient grow" type="button" id="send">Envoyer</button>
      </div>`;
    box.querySelector('#back').onclick = () => go('accueil');
    box.querySelector('#send').onclick = async () => {
      const txt = box.querySelector('#rq-txt').value.trim();
      const secteur = box.querySelector('#rq-secteur').value;
      if (txt.length < 12) { toast('Merci de décrire un peu plus votre question.', 'err'); return; }
      const btn = box.querySelector('#send'); btn.disabled = true; btn.textContent = 'Envoi…';
      try {
        const resume = assistant.summarize(txt, {});
        const res = await PS.data.createDemande({
          typeId: 'autre', texteBrut: txt, reponses: {}, confidentialite: 'anonyme_total',
          etablissement: secteur, service: '', resume, categorie: '', pieces: [],
        });
        showConfirmation(res);
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Envoyer';
        toast('Envoi impossible. Vérifiez votre connexion.', 'err');
      }
    };
    mount(box);
  }

  /* ======================= ÉCRAN TYPE (§3.2) ======================= */
  function screenType() {
    const box = el('div', { class: 'screen' });
    box.innerHTML = progress(1) + `<h1>De quel type de demande s'agit-il ?</h1>
      <p class="muted small">Choisissez ce qui correspond le mieux. Un élu pourra ajuster ensuite.</p>
      <div class="choice-grid" id="type-grid"></div>`;
    const grid = box.querySelector('#type-grid');
    store.TYPES.forEach(t => {
      grid.appendChild(el('button', { class: 'choice' + (draft.typeId === t.id ? ' selected' : ''), type: 'button', 'data-id': t.id,
        onclick: () => { draft.typeId = t.id; go('redaction'); } }, [
        el('span', { class: 'ic', html: t.icon }),
        el('span', { class: 'grow' }, [el('span', { class: 't', text: t.label }), el('br'), el('span', { class: 'd', text: t.instance + (t.urgent ? ' · prioritaire' : '') })]),
        el('span', { class: 'check', html: '✓' }),
      ]));
    });
    box.appendChild(backBar(() => go('accueil')));
    mount(box);
  }

  /* ======================= ÉCRAN RÉDACTION LIBRE (§3.3) ======================= */
  function screenRedaction() {
    const type = store.TYPES.find(t => t.id === draft.typeId) || store.TYPES[0];
    const box = el('div', { class: 'screen' });
    box.innerHTML = progress(2) + `
      <h1>Expliquez la situation avec vos mots</h1>
      <div class="assistant-intro">
        <span class="av">🤝</span>
        <div class="small">Écrivez librement. L'assistant vous posera ensuite <strong>uniquement</strong> les questions utiles — pas de long questionnaire.</div>
      </div>
      <div class="field">
        <label for="txt">Votre message <span class="badge badge-primary">${escapeHTML(type.label)}</span></label>
        <textarea id="txt" placeholder="Ex. Mon chef change encore mes horaires au dernier moment et je ne peux jamais m'organiser…">${escapeHTML(draft.texteBrut)}</textarea>
        <div class="hint">Décrivez les faits. N'indiquez ici votre identité que si vous le souhaitez (vous la choisirez à l'étape confidentialité).</div>
      </div>

      <div class="field">
        <label for="etab">Secteur (facultatif)</label>
        <div class="row">
          <select class="grow" id="etab" style="min-width:140px">
            <option value="">— Choisir un secteur —</option>
            ${(window.PS.config.secteurs || []).map(s => `<option ${draft.etablissement === s ? 'selected' : ''}>${escapeHTML(s)}</option>`).join('')}
          </select>
          <input class="grow" id="serv" type="text" placeholder="Zone / poste (facultatif)" value="${escapeHTML(draft.service)}" style="min-width:140px">
        </div>
      </div>

      <div class="field">
        <label>Pièces jointes (facultatif)</label>
        <input id="file" type="file" accept="image/*,application/pdf" multiple>
        <div class="hint">Images ou PDF, 5 Mo max par fichier. Les fichiers non autorisés sont refusés.</div>
        <div id="attach-list" class="stack" style="--gap:6px;margin-top:8px"></div>
      </div>

      <label class="small" style="display:flex;gap:8px;align-items:flex-start;font-weight:400">
        <input type="checkbox" id="consent-draft" ${draft.consentBrouillon ? 'checked' : ''} style="width:auto;margin-top:3px">
        J'autorise l'enregistrement temporaire de mon brouillon sur cet appareil pour reprendre plus tard.
      </label>

      <div class="form-actions">
        <button class="btn btn-ghost" type="button" id="back">Retour</button>
        <button class="btn btn-primary grow" type="button" id="next">Continuer</button>
      </div>`;

    renderAttach(box.querySelector('#attach-list'));

    box.querySelector('#file').addEventListener('change', (e) => {
      Array.from(e.target.files).forEach(f => {
        if (f.size > ATTACH_MAX) { toast(`« ${f.name} » dépasse 5 Mo — refusé.`, 'err'); return; }
        if (ATTACH_TYPES.indexOf(f.type) === -1) { toast(`« ${f.name} » : type non autorisé — refusé.`, 'err'); return; }
        draft.pieces.push({ nom: f.name, type: f.type, taille: f.size, empreinte: 'sha256:' + (f.name.length * 7 + f.size).toString(16) });
      });
      e.target.value = '';
      renderAttach(box.querySelector('#attach-list'));
    });

    box.querySelector('#back').onclick = () => go(draft.typeId && !['danger', 'amelioration', 'rdv'].includes(draft.typeId) ? 'type' : 'accueil');
    box.querySelector('#next').onclick = () => {
      draft.texteBrut = box.querySelector('#txt').value.trim();
      draft.etablissement = box.querySelector('#etab').value.trim();
      draft.service = box.querySelector('#serv').value.trim();
      draft.consentBrouillon = box.querySelector('#consent-draft').checked;
      if (draft.texteBrut.length < 12) { toast('Merci de décrire un peu plus la situation.', 'err'); return; }
      if (draft.consentBrouillon) saveBrouillon();
      go('assistant');
    };
    mount(box);
  }

  function renderAttach(host) {
    host.innerHTML = '';
    draft.pieces.forEach((p, i) => {
      host.appendChild(el('div', { class: 'attach-item' }, [
        el('span', { html: p.type === 'application/pdf' ? '📄' : '🖼️' }),
        el('span', { text: `${p.nom} (${Math.round(p.taille / 1024)} Ko)` }),
        el('button', { class: 'btn btn-sm btn-ghost', type: 'button', text: 'Retirer', onclick: () => { draft.pieces.splice(i, 1); renderAttach(host); } }),
      ]));
    });
  }

  /* ======================= ÉCRAN ASSISTANT (§3.3) ======================= */
  function screenAssistant() {
    const questions = assistant.planQuestions(draft.texteBrut, draft.typeId);
    const sugg = assistant.suggestCategorie(draft.texteBrut);
    if (sugg.categorie) draft.categorie = draft.categorie || sugg.categorie;

    const box = el('div', { class: 'screen' });
    box.innerHTML = progress(3) + `
      <h1>Quelques précisions</h1>
      <div class="assistant-intro">
        <span class="av">🤝</span>
        <div class="small">D'après votre message, voici les seules questions utiles. Répondez à celles que vous pouvez — <strong>aucune n'est obligatoire</strong>.</div>
      </div>
      ${sugg.categorie ? `<div class="notice notice-info" style="margin-bottom:14px"><span class="ico">🏷️</span><div>Catégorie suggérée : <strong>${escapeHTML(sugg.categorie)}</strong> <span class="muted">(${sugg.confiance})</span>. Un élu la validera.</div></div>` : ''}
      <div id="q-list"></div>`;
    const list = box.querySelector('#q-list');
    questions.forEach(q => {
      list.appendChild(el('div', { class: 'q-block' }, [
        el('div', { class: 'q-theme', text: q.theme }),
        el('label', { class: 'q-label', for: 'q_' + q.id, text: q.label }),
        el('textarea', { id: 'q_' + q.id, 'data-key': q.id, placeholder: q.ph, style: 'min-height:70px', text: draft.reponses[q.id] || '' }),
      ]));
    });
    box.appendChild(backBar(() => go('redaction'), () => {
      box.querySelectorAll('#q-list textarea').forEach(t => { draft.reponses[t.dataset.key] = t.value.trim(); });
      draft.resume = assistant.summarize(draft.texteBrut, draft.reponses);
      if (draft.consentBrouillon) saveBrouillon();
      go('confidentialite');
    }, 'Continuer'));
    mount(box);
  }

  /* ======================= ÉCRAN CONFIDENTIALITÉ (§3.4) ======================= */
  function screenConfidentialite() {
    const box = el('div', { class: 'screen' });
    box.innerHTML = progress(4) + `
      <h1>Qui peut voir votre identité ?</h1>
      <div class="notice notice-warn" style="margin-bottom:14px"><span class="ico">⚠️</span>
        <div>Votre choix est <strong>explicite</strong>, <strong>modifiable</strong> tant que la demande n'est pas envoyée, et affiché avant validation.</div></div>
      <div class="choice-grid" id="conf-grid"></div>
      <div id="identity-fields" class="hidden" style="margin-top:16px"></div>`;
    const grid = box.querySelector('#conf-grid');
    Object.entries(store.CONFIDENTIALITE).forEach(([key, c]) => {
      grid.appendChild(el('button', { class: 'choice' + (draft.confidentialite === key ? ' selected' : ''), type: 'button', 'data-key': key,
        onclick: () => { draft.confidentialite = key; renderConf(box); } }, [
        el('span', { class: 'ic', html: c.color === 'success' ? '🕶️' : (key === 'nominative' ? '🙋' : '🔒') }),
        el('span', { class: 'grow' }, [el('span', { class: 't', text: c.label }), el('br'), el('span', { class: 'd', text: c.desc })]),
        el('span', { class: 'check', html: '✓' }),
      ]));
    });
    renderConf(box);
    box.appendChild(backBar(() => go('assistant'), () => {
      if (!draft.confidentialite) { toast('Merci de choisir un niveau de confidentialité.', 'err'); return; }
      const idf = box.querySelector('#identity-fields');
      if (idf && !idf.classList.contains('hidden')) {
        draft.nom = (box.querySelector('#id-nom') || {}).value ? box.querySelector('#id-nom').value.trim() : '';
        draft.contact = (box.querySelector('#id-contact') || {}).value ? box.querySelector('#id-contact').value.trim() : '';
        if (draft.confidentialite === 'nominative' && !draft.nom && !draft.contact) { toast('Une demande nominative nécessite un nom ou un contact.', 'err'); return; }
      } else { draft.nom = ''; draft.contact = ''; }
      go('validation');
    }, 'Vérifier ma demande'));
    mount(box);
  }
  function renderConf(box) {
    box.querySelectorAll('#conf-grid .choice').forEach(c => c.classList.toggle('selected', c.dataset.key === draft.confidentialite));
    const idf = box.querySelector('#identity-fields');
    if (['confidentiel_elus', 'identite_transmissible', 'nominative'].includes(draft.confidentialite)) {
      idf.classList.remove('hidden');
      idf.innerHTML = `
        <div class="card card-pad">
          <label for="id-nom">Vos coordonnées (stockées séparément de votre message)</label>
          <input id="id-nom" type="text" placeholder="Nom / prénom" value="${escapeHTML(draft.nom)}" style="margin-bottom:8px">
          <input id="id-contact" type="text" placeholder="Email ou téléphone" value="${escapeHTML(draft.contact)}">
          <p class="hint">Ces coordonnées ne sont visibles que selon le niveau choisi. Elles ne figurent jamais dans une version anonymisée.</p>
        </div>`;
    } else {
      idf.classList.add('hidden'); idf.innerHTML = '';
    }
  }

  /* ======================= ÉCRAN VALIDATION (§3.5) ======================= */
  function screenValidation() {
    const type = store.TYPES.find(t => t.id === draft.typeId) || {};
    const conf = store.CONFIDENTIALITE[draft.confidentialite];
    const box = el('div', { class: 'screen' });
    box.innerHTML = progress(5) + `
      <h1>Vérifiez avant d'envoyer</h1>
      <div class="card card-pad">
        <dl class="recap">
          <dt>Résumé de votre demande</dt><dd>${escapeHTML(draft.resume || '—')}</dd>
          <dt>Type & catégorie suggérée</dt><dd>${escapeHTML(type.label || '')} · ${escapeHTML(draft.categorie || 'à classer par les élus')}</dd>
          <dt>Niveau de confidentialité</dt><dd><span class="badge badge-${conf.color}">${escapeHTML(conf.label)}</span></dd>
          ${draft.etablissement ? `<dt>Secteur</dt><dd>${escapeHTML(draft.etablissement)}${draft.service ? ' — ' + escapeHTML(draft.service) : ''}</dd>` : ''}
          ${draft.pieces.length ? `<dt>Pièces jointes</dt><dd>${draft.pieces.map(p => escapeHTML(p.nom)).join(', ')}</dd>` : ''}
          <dt>Votre texte original (conservé tel quel)</dt><dd><blockquote>${escapeHTML(draft.texteBrut)}</blockquote></dd>
        </dl>
      </div>

      <div class="card card-pad" style="margin-top:12px">
        <label class="small" style="display:flex;gap:8px;align-items:flex-start;font-weight:400">
          <input type="checkbox" id="c1" style="width:auto;margin-top:3px">
          J'accepte que ma demande soit transmise aux élus selon le niveau de confidentialité choisi.
        </label>
        <label class="small" style="display:flex;gap:8px;align-items:flex-start;font-weight:400;margin-top:8px">
          <input type="checkbox" id="c2" style="width:auto;margin-top:3px">
          J'ai compris que rien n'est transmis automatiquement à l'employeur.
        </label>
      </div>

      <div class="form-actions">
        <button class="btn btn-ghost" type="button" id="edit">Modifier</button>
        <button class="btn btn-gradient grow" type="button" id="send">Envoyer ma demande</button>
      </div>`;
    box.querySelector('#edit').onclick = () => go('confidentialite');
    box.querySelector('#send').onclick = async () => {
      if (!box.querySelector('#c1').checked || !box.querySelector('#c2').checked) { toast('Merci de cocher les deux consentements.', 'err'); return; }
      const btn = box.querySelector('#send'); btn.disabled = true; btn.textContent = 'Envoi…';
      try {
        const res = await PS.data.createDemande(draft);
        clearBrouillon();
        showConfirmation(res);
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Envoyer ma demande';
        toast('Envoi impossible. Vérifiez votre connexion.', 'err');
      }
    };
    mount(box);
  }

  /* ======================= CONFIRMATION + CODE (§3.6) ======================= */
  function showConfirmation(res) {
    const box = el('div', { class: 'screen' });
    box.innerHTML = `
      <div class="center">
        <div style="font-size:2.6rem">✅</div>
        <h1>Votre demande est enregistrée</h1>
        <p class="muted">Conservez précieusement ces deux codes. Le code secret est nécessaire pour lire les réponses des élus.</p>
      </div>
      <div class="code-box">
        <div class="lbl">Numéro de suivi</div>
        <div class="ref">${escapeHTML(res.publicRef)}</div>
        <hr style="border:0;border-top:1px solid rgba(255,255,255,.15);margin:14px 0">
        <div class="lbl">Code secret (à ne pas partager)</div>
        <div class="secret">${escapeHTML(res.secret)}</div>
      </div>
      <div class="notice notice-info"><span class="ico">💡</span><div>Le numéro seul affiche uniquement le statut. Le code secret donne accès aux échanges avec les élus. Aucune donnée sensible n'est accessible avec le numéro seul.</div></div>
      <div class="form-actions">
        <button class="btn btn-ghost" type="button" id="copy">Copier les codes</button>
        <button class="btn btn-primary grow" type="button" id="home">Terminer</button>
      </div>`;
    box.querySelector('#copy').onclick = async () => {
      try { await navigator.clipboard.writeText(`Parole Salariés — suivi\nNuméro : ${res.publicRef}\nCode secret : ${res.secret}`); toast('Codes copiés.'); }
      catch (e) { toast('Copie impossible, notez les codes.', 'err'); }
    };
    box.querySelector('#home').onclick = () => go('accueil');
    mount(box);
  }

  /* ======================= SUIVI (§3.6) ======================= */
  function screenSuivi() {
    const box = el('div', { class: 'screen' });
    box.innerHTML = `
      <h1>Suivre ma demande</h1>
      <div class="card card-pad">
        <div class="field">
          <label for="ref">Numéro de suivi</label>
          <input id="ref" type="text" placeholder="PS-2026-XXXX" autocapitalize="characters">
        </div>
        <div class="field">
          <label for="sec">Code secret <span class="muted small">(pour voir les échanges)</span></label>
          <input id="sec" type="text" placeholder="6 caractères" autocapitalize="characters">
          <div class="hint">Sans le code secret, seul le statut s'affiche.</div>
        </div>
        <button class="btn btn-primary btn-block" type="button" id="find">Rechercher</button>
      </div>
      <div id="track-result" style="margin-top:16px"></div>`;
    box.querySelector('#find').onclick = async () => {
      const ref = box.querySelector('#ref').value.trim();
      const sec = box.querySelector('#sec').value.trim();
      const host = box.querySelector('#track-result');
      if (!ref) { toast('Saisissez votre numéro de suivi.', 'err'); return; }
      if (sec) {
        const r = await PS.data.trackFull(ref, sec);
        if (r.error === 'introuvable') { host.innerHTML = notice('danger', 'Aucune demande ne correspond à ce numéro.'); return; }
        if (r.error === 'code') { host.innerHTML = notice('danger', 'Code secret incorrect.'); return; }
        renderTrackFull(host, r, ref, sec);
      } else {
        const r = await PS.data.trackByRef(ref);
        if (!r) { host.innerHTML = notice('danger', 'Aucune demande ne correspond à ce numéro.'); return; }
        host.innerHTML = `<div class="card card-pad">
          <div class="row-between"><strong>${escapeHTML(r.publicRef)}</strong>${PS.ui.badge(r.statut, store.STATUT_COLOR[r.statut] || 'mute')}</div>
          <p class="small muted mt-0">${escapeHTML(r.type)} · déposée le ${fmtDate(r.createdAt)}</p>
          ${r.reponsePubliee ? `<div class="notice notice-success"><span class="ico">📣</span><div><strong>Réponse publiée :</strong> ${escapeHTML(r.reponsePubliee)}</div></div>` : '<p class="muted small">Ajoutez votre code secret pour voir les échanges avec les élus.</p>'}
        </div>`;
      }
    };
    box.appendChild(backBar(() => go('accueil')));
    mount(box);
  }
  function renderTrackFull(host, r, ref, sec) {
    const d = r.demande;
    const msgs = r.messages.map(m => `<div class="q-block" style="margin-bottom:10px">
      <div class="q-theme">${escapeHTML(m.auteur)} · ${fmtDate(m.date)}</div>
      <div>${escapeHTML(m.contenu)}</div></div>`).join('') || '<p class="muted small">Aucun message pour le moment.</p>';
    host.innerHTML = `<div class="card card-pad">
      <div class="row-between"><strong>${escapeHTML(d.publicRef)}</strong>${PS.ui.badge(d.statut, store.STATUT_COLOR[d.statut] || 'mute')}</div>
      <p class="small muted">Déposée le ${fmtDate(d.createdAt)}</p>
      <hr class="divider">
      <h3>Échanges avec les élus</h3>
      ${msgs}
      <hr class="divider">
      <div class="field"><label for="prec">Apporter une précision</label>
        <textarea id="prec" placeholder="Ajouter une information utile aux élus…" style="min-height:70px"></textarea></div>
      <button class="btn btn-primary" type="button" id="send-prec">Envoyer la précision</button>
    </div>`;
    host.querySelector('#send-prec').onclick = async () => {
      const t = host.querySelector('#prec').value.trim();
      if (!t) return;
      if (await PS.data.addSalariePrecision(ref, sec, t)) { toast('Précision envoyée aux élus.'); const r2 = await PS.data.trackFull(ref, sec); renderTrackFull(host, r2, ref, sec); }
    };
  }

  /* ======================= PAGES INFO ======================= */
  function screenConfidentialiteRules() {
    const box = el('div', { class: 'screen' });
    box.innerHTML = `<h1>Règles de confidentialité</h1>
      <div class="card card-pad stack">
        <p>Cet outil appartient aux <strong>représentants des salariés</strong> (CSE / CSSCT). Il n'est pas géré par l'employeur et ne lui transmet rien automatiquement.</p>
        <p><strong>Vous choisissez</strong> qui peut voir votre identité :</p>
        <ul>
          <li><strong>Anonyme total</strong> — aucune identité enregistrée, un code de suivi est généré.</li>
          <li><strong>Confidentiel élus</strong> — identité visible uniquement des élus autorisés.</li>
          <li><strong>Identité transmissible avec accord</strong> — communiquée seulement dans un cadre déterminé.</li>
          <li><strong>Nominative</strong> — vous souhaitez être identifié·e et contacté·e.</li>
        </ul>
        <p>Vos coordonnées sont stockées <strong>séparément</strong> de votre message. Les statistiques sont anonymisées et un seuil empêche d'identifier une personne dans un petit groupe.</p>
        <p class="small muted">Les mentions légales et durées de conservation définitives doivent être validées juridiquement avant mise en production.</p>
      </div>`;
    box.appendChild(backBar(() => go('accueil')));
    mount(box);
  }
  function screenUrgence() {
    const box = el('div', { class: 'screen' });
    box.innerHTML = `<h1>Contacts d'urgence</h1>
      <div class="notice notice-danger" style="margin-bottom:14px"><span class="ico">🚨</span><div>Cet outil <strong>ne remplace pas</strong> les secours ni une procédure d'urgence.</div></div>
      <div class="card card-pad stack">
        <p><strong>Urgence vitale / accident grave :</strong> appelez le <strong>15</strong> (SAMU) ou le <strong>112</strong>.</p>
        <p><strong>Danger grave et imminent :</strong> exercez votre droit de retrait et prévenez immédiatement votre hiérarchie et un élu CSSCT.</p>
        <p><strong>Élus CSSCT :</strong> voir l'affichage obligatoire de votre établissement.</p>
      </div>`;
    box.appendChild(backBar(() => go('accueil')));
    mount(box);
  }

  /* ======================= Helpers de navigation ======================= */
  function notice(kind, txt) { return `<div class="notice notice-${kind}"><span class="ico">${kind === 'danger' ? '⛔' : 'ℹ️'}</span><div>${escapeHTML(txt)}</div></div>`; }
  function backBar(onBack, onNext, nextLabel) {
    const bar = el('div', { class: 'form-actions' });
    bar.appendChild(el('button', { class: 'btn btn-ghost', type: 'button', text: 'Retour', onclick: onBack }));
    if (onNext) bar.appendChild(el('button', { class: 'btn btn-primary grow', type: 'button', text: nextLabel || 'Continuer', onclick: onNext }));
    return bar;
  }
  function mount(node) { const r = root(); r.innerHTML = ''; r.appendChild(node); window.scrollTo(0, 0); }

  const SCREENS = {
    accueil: screenAccueil, rapide: screenRapide, type: screenType, redaction: screenRedaction, assistant: screenAssistant,
    confidentialite: screenConfidentialite, validation: screenValidation, suivi: screenSuivi,
    confidentialiteRules: screenConfidentialiteRules, urgence: screenUrgence,
  };
  function go(name) { (SCREENS[name] || screenAccueil)(); }

  /* Brouillon (§11) */
  function saveBrouillon() { try { localStorage.setItem('ps_brouillon', JSON.stringify(draft)); } catch (e) {} }
  function clearBrouillon() { try { localStorage.removeItem('ps_brouillon'); } catch (e) {} }

  /* Liens footer -> pages info */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-nav]');
    if (a) { e.preventDefault(); go(a.dataset.nav === 'confidentialite' ? 'confidentialiteRules' : a.dataset.nav); }
  });

  // Démarrage
  screenAccueil();
})();
