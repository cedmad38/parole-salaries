/* ===================================================================
   Parole Salariés By Cedmad — Exports (§7)
   Word (.doc), PDF (impression navigateur) et copie email.
   Respecte le niveau de confidentialité : la version anonymisée ne
   contient JAMAIS l'identité (§16 : « une demande anonyme ne révèle pas
   accidentellement l'identité dans les exports »).
   =================================================================== */
(function (global) {
  'use strict';
  const S = () => global.PS.store;

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Construit le corps HTML d'un export à partir d'une liste d'items { demande, question }.
  // Utilise TOUJOURS le texte de la formulation choisie (question.texte) — jamais le texte
  // brut de la demande — pour que le fichier reflète exactement ce que l'élu a sélectionné.
  function buildHTML(items, opts) {
    opts = opts || {};
    const anonymise = opts.anonymise !== false; // par défaut : version à communiquer = anonymisée
    const store = S();
    const rows = items.map(({ demande: d, question: q }, i) => {
      const conf = store.CONFIDENTIALITE[d.confidentialite];
      let identite = '';
      if (!anonymise) {
        const idr = store.identityFor(d, 'referent_confidentiel');
        if (idr.visible && idr.data) identite = `<p><strong>Identité (réservé élus)&nbsp;:</strong> ${esc(idr.data.nom)} — ${esc(idr.data.contact)}</p>`;
      }
      return `
      <section class="demande">
        <h2>${i + 1}. ${esc(d.resume || q.format)}</h2>
        <p class="meta">Réf. ${esc(d.publicRef)} · ${esc(q.instance)} ·
           Catégorie&nbsp;: ${esc(d.categorie || '—')} · Priorité&nbsp;: ${esc(d.priorite)} ·
           Formulation retenue&nbsp;: ${esc(q.format)} ·
           ${esc(anonymise ? 'Version anonymisée' : conf.label)}</p>
        ${d.etablissement ? `<p><strong>Établissement&nbsp;:</strong> ${esc(d.etablissement)}${d.service ? ' — ' + esc(d.service) : ''}</p>` : ''}
        ${identite}
        <blockquote>${esc(q.texte)}</blockquote>
        ${d.reponsePubliee ? `<p><strong>Réponse publiée&nbsp;:</strong> ${esc(d.reponsePubliee)}</p>` : ''}
      </section>`;
    }).join('\n');

    const css = `
      body{font-family:Calibri,Arial,sans-serif;color:#16233b;line-height:1.5;max-width:820px;margin:24px auto;padding:0 16px}
      h1{color:#245fb0;border-bottom:3px solid #2f7de1;padding-bottom:8px}
      .doc-meta{color:#7686a0;font-size:13px;margin-bottom:20px}
      h2{color:#1e2c4d;font-size:16px;margin-top:22px}
      .meta{color:#7686a0;font-size:12px;margin:.2em 0 .6em}
      blockquote{border-left:3px solid #d8e0ec;margin:.4em 0;padding:.2em 0 .2em 12px;color:#4a5a74;font-style:italic}
      section.demande{page-break-inside:avoid;border-bottom:1px solid #eef3fa;padding-bottom:10px}
    `;
    const title = esc(opts.titre || 'Questions préparées');
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title><style>${css}</style></head>
      <body>
        <h1>Parole Salariés By Cedmad</h1>
        <p class="doc-meta">${title} · Généré le ${new Date().toLocaleDateString('fr-FR')} ·
        ${anonymise ? 'Version anonymisée à communiquer' : 'Version complète réservée aux élus'}</p>
        ${rows}
      </body></html>`;
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
  }

  // Export Word (.doc) — HTML avec MIME Word, ouvre directement dans Word/Pages
  function toWord(items, opts) {
    const html = buildHTML(items, opts);
    download((opts && opts.filename || 'questions') + '.doc', html, 'application/msword');
  }

  // Export PDF — ouvre une fenêtre d'impression (« Enregistrer au format PDF »)
  function toPDF(items, opts) {
    const html = buildHTML(items, opts);
    const w = window.open('', '_blank');
    if (!w) { alert("Autorisez les fenêtres pop-up pour générer le PDF."); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
  }

  // Copie email — texte simple. Items : [{ demande, question }] — toujours le texte choisi.
  async function toClipboard(items, opts) {
    const anonymise = !opts || opts.anonymise !== false;
    const txt = items.map(({ demande: d, question: q }, i) => {
      return `${i + 1}. [${d.publicRef}] ${d.resume || q.format}\n`
           + `   Formulation retenue : ${q.format} · ${q.instance}\n`
           + `   ${anonymise ? '(version anonymisée)' : ''}\n`
           + `   ${q.texte}`;
    }).join('\n\n');
    const header = `Parole Salariés By Cedmad — ${opts && opts.titre || 'Questions'}\n\n`;
    try { await navigator.clipboard.writeText(header + txt); return true; }
    catch (e) { return false; }
  }

  global.PS = global.PS || {};
  global.PS.exporter = { toWord, toPDF, toClipboard, buildHTML };

})(window);
