/* ===================================================================
   Parole Salariés By Cedmad — Exports (§7)
   Word (.doc), PDF (impression navigateur) et copie email.
   Respecte le niveau de confidentialité : la version anonymisée ne
   contient JAMAIS l'identité (§16 : « une demande anonyme ne révèle pas
   accidentellement l'identité dans les exports »).
   =================================================================== */
(function (global) {
  'use strict';

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Construit le corps HTML d'un export à partir d'une liste d'items { demande, question }.
  // Uniquement la question entière choisie, numérotée — rien d'autre (pas de réf, pas de
  // méta, pas d'établissement) : c'est le texte à lire tel quel en réunion.
  function buildHTML(items, opts) {
    opts = opts || {};
    const anonymise = opts.anonymise !== false;
    const rows = items.map(({ question: q }, i) => `<p class="q">${i + 1}. ${esc(q.texte)}</p>`).join('\n');

    const css = `
      body{font-family:Calibri,Arial,sans-serif;color:#16233b;line-height:1.5;max-width:820px;margin:24px auto;padding:0 16px}
      h1{color:#245fb0;border-bottom:3px solid #2f7de1;padding-bottom:8px}
      .doc-meta{color:#7686a0;font-size:13px;margin-bottom:20px}
      .q{margin:1em 0;page-break-inside:avoid}
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

  // Copie email — texte simple. Items : [{ demande, question }] — juste la question numérotée.
  async function toClipboard(items, opts) {
    const txt = items.map(({ question: q }, i) => `${i + 1}. ${q.texte}`).join('\n\n');
    const header = `Parole Salariés By Cedmad — ${opts && opts.titre || 'Questions'}\n\n`;
    try { await navigator.clipboard.writeText(header + txt); return true; }
    catch (e) { return false; }
  }

  global.PS = global.PS || {};
  global.PS.exporter = { toWord, toPDF, toClipboard, buildHTML };

})(window);
