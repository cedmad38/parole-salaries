/* ===================================================================
   Parole Salariés By Cedmad — Moteur d'assistance (MVP, déterministe)
   -------------------------------------------------------------------
   Rôle (§3.3, §5) : analyser le texte du salarié, poser UNIQUEMENT les
   questions complémentaires utiles, suggérer une catégorie, produire un
   résumé et plusieurs FORMULATIONS de questions.

   GARDE-FOUS (§5.3) garantis par construction :
   • Ne jamais inventer un fait : le moteur ne réutilise QUE le texte et
     les réponses fournies ; les informations absentes sont affichées
     « [à préciser] », jamais comblées.
   • Toujours distinguer : texte original ≠ résumé ≠ reformulation.
   • Ne jamais qualifier automatiquement (harcèlement, discrimination,
     danger grave) : le moteur ne fait que SUGGÉRER une catégorie, à
     valider par un élu.
   • Afficher les incertitudes et informations manquantes.

   ⚠️ Module isolé et désactivable (§13). Peut être remplacé par un LLM
      encadré par les mêmes règles. Voir ARCHITECTURE.md.
   =================================================================== */
(function (global) {
  'use strict';

  const norm = (s) => (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Détection de catégorie par mots-clés (SUGGESTION uniquement)
  const CAT_RULES = [
    { cat: 'Temps de travail',       kw: ['horaire', 'planning', 'plannings', 'heures sup', 'repos', 'pause', 'nuit', 'week-end', 'roulement'] },
    { cat: 'Rémunération',           kw: ['prime', 'salaire', 'paie', 'paye', 'augmentation', 'treizieme', '13e', 'indemnite', 'remuneration'] },
    { cat: 'Risque sécurité',        kw: ['chariot', 'chute', 'accident', 'blessure', 'danger', 'securite', 'protection', 'epi', 'incendie', 'machine'] },
    { cat: 'Risque psychosocial',    kw: ['stress', 'souffrance', 'burn', 'charge de travail', 'pression', 'epuisement', 'mal-etre', 'harcelement moral'] },
    { cat: 'Conditions matérielles', kw: ['salle de pause', 'vestiaire', 'toilette', 'chauffage', 'climatisation', 'materiel', 'micro-onde', 'local'] },
    { cat: 'Organisation du travail',kw: ['reorganisation', 'organisation', 'effectif', 'remplacement', 'sous-effectif', 'process'] },
    { cat: 'Formation',              kw: ['formation', 'habilitation', 'competence', 'caces'] },
    { cat: 'Égalité professionnelle',kw: ['egalite', 'discrimination', 'femme', 'homme', 'parentalite'] },
    { cat: 'Intérim',                kw: ['interim', 'interimaire', 'agence'] },
    { cat: 'Entreprise extérieure',  kw: ['sous-traitant', 'prestataire', 'entreprise exterieure'] },
  ];

  function suggestCategorie(text) {
    const t = norm(text);
    let best = null, bestHits = 0;
    for (const r of CAT_RULES) {
      const hits = r.kw.reduce((n, k) => n + (t.includes(norm(k)) ? 1 : 0), 0);
      if (hits > bestHits) { bestHits = hits; best = r.cat; }
    }
    return best ? { categorie: best, confiance: bestHits >= 2 ? 'élevée' : 'à confirmer' }
                : { categorie: '', confiance: 'inconnue' };
  }

  // Banque de questions par thème (§3.3)
  const THEMES = {
    contexte:    { theme: 'Contexte',            label: "Dans quel service ou zone la situation se produit-elle, et depuis quand ?", ph: 'Ex. Atelier 2, depuis environ 3 semaines…' },
    frequence:   { theme: 'Fréquence',           label: "À quelle fréquence cela arrive-t-il ?", ph: 'Ex. plusieurs fois par semaine' },
    faits:       { theme: 'Faits',               label: "Que s'est-il passé concrètement ? Décrivez les faits, sans interprétation.", ph: 'Ex. le 12/06, le chariot a démarré sans klaxon…' },
    personnes:   { theme: 'Personnes concernées', label: "Une seule personne ou plusieurs salariés sont-ils concernés ?", ph: 'Ex. plusieurs collègues de l’équipe du matin' },
    consequences:{ theme: 'Conséquences',        label: "Quelles conséquences sur le travail, la sécurité, la santé ou l'organisation ?", ph: 'Ex. fatigue, impossibilité de s’organiser…' },
    demarches:   { theme: 'Démarches déjà faites', label: "La situation a-t-elle déjà été signalée ? À qui, et avec quelle réponse ?", ph: 'Ex. signalé au chef d’équipe, sans réponse' },
    urgence:     { theme: 'Urgence',             label: "La situation est-elle en cours ? Existe-t-il un risque immédiat ?", ph: 'Ex. oui, le danger est présent chaque jour' },
    preuves:     { theme: 'Preuves',             label: "Existe-t-il des documents, photos, messages, dates ou témoins ?", ph: 'Ex. une photo, des échanges par mail…' },
    attente:     { theme: 'Attente',             label: "Que souhaitez-vous obtenir : une réponse, une intervention, un changement, un rendez-vous ?", ph: 'Ex. que les plannings soient communiqués à l’avance' },
  };

  // Sélectionne UNIQUEMENT les questions utiles (§3.3 : éviter les questionnaires interminables)
  function planQuestions(text, typeId) {
    const t = norm(text);
    const has = (kws) => kws.some(k => t.includes(norm(k)));
    const ask = [];

    // Toujours utile si absent du texte
    if (!has(['service', 'atelier', 'bureau', 'zone', 'depuis', 'quai', 'ligne'])) ask.push('contexte');
    if (!has(['souvent', 'chaque', 'fois', 'repete', 'tous les', 'quotidien'])) ask.push('frequence');

    // Faits : demandés si le texte est court ou vague
    if ((text || '').trim().length < 160) ask.push('faits');

    // Personnes concernées : utile pour repérer un sujet collectif
    if (!has(['collegues', 'plusieurs', 'equipe', 'tout le monde', 'nous', 'on est'])) ask.push('personnes');

    // Conséquences si non exprimées
    if (!has(['consequence', 'fatigue', 'stress', 'risque', 'impossible', 'sante', 'securite', 'blessure'])) ask.push('consequences');

    // Démarches déjà faites — presque toujours utile
    ask.push('demarches');

    // Urgence : prioritaire pour danger / accident / rps
    if (['danger', 'accident', 'rps'].includes(typeId) || has(['danger', 'urgent', 'accident', 'blesse', 'immediat'])) {
      ask.unshift('urgence');
    }

    // Preuves & attente : toujours demandées en fin de parcours
    ask.push('preuves');
    ask.push('attente');

    // Dédoublonnage + limite douce (parcours court)
    const seen = new Set();
    const chosen = ask.filter(k => (seen.has(k) ? false : (seen.add(k), true)));
    return chosen.slice(0, 6).map(k => ({ id: k, ...THEMES[k] }));
  }

  // Résumé factuel (extractif) — CLAIREMENT distinct du texte original (§5.3)
  function summarize(text, answers) {
    answers = answers || {};
    const parts = [];
    const first = (text || '').trim().replace(/\s+/g, ' ');
    if (first) {
      const sentences = first.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
      parts.push(sentences);
    }
    const map = [
      ['contexte', 'Contexte'], ['frequence', 'Fréquence'], ['personnes', 'Personnes'],
      ['consequences', 'Conséquences'], ['demarches', 'Démarches'], ['urgence', 'Urgence'], ['attente', 'Attente'],
    ];
    const extras = map
      .filter(([k]) => answers[k] && answers[k].trim())
      .map(([k, lbl]) => `${lbl} : ${answers[k].trim()}`);
    let out = parts.join(' ');
    if (extras.length) out += ' — ' + extras.join(' ; ') + '.';
    return out || '[Résumé à compléter]';
  }

  // Détection de sujets manquants pour afficher les incertitudes (§5.3)
  function missingInfo(text, answers) {
    answers = answers || {};
    const miss = [];
    if (!answers.contexte) miss.push('lieu / service précis');
    if (!answers.demarches) miss.push('démarches déjà entreprises');
    if (!answers.preuves) miss.push('preuves ou témoins');
    if (!answers.attente) miss.push('attente précise du salarié');
    return miss;
  }

  /* ---------- Générateur de FORMULATIONS (§5.1) ----------
     N'utilise QUE des éléments réellement fournis. Les éléments absents
     apparaissent comme « [à préciser] » — jamais inventés. */
  function formulations(d, answers) {
    answers = answers || d.reponses || {};
    const P = (v) => (v && String(v).trim()) ? String(v).trim() : '[à préciser]';
    const sujet = P(d.resume || answers.faits || (d.texteBrut || '').slice(0, 120));
    const contexte = answers.contexte ? ` (${answers.contexte.trim()})` : '';
    const attente = answers.attente ? answers.attente.trim() : '';
    const collectif = /plusieurs|collègues|équipe|nous|collectif/i.test((d.texteBrut || '') + ' ' + (answers.personnes || ''));
    const amorce = collectif ? 'Plusieurs salariés signalent' : 'Un salarié signale';

    return {
      courte: {
        titre: 'Question courte',
        finalite: 'Formulation directe pour une liste de questions.',
        texte: `${amorce} : ${sujet}${contexte}. La direction peut-elle préciser les mesures prévues ?`,
      },
      developpee: {
        titre: 'Question développée',
        finalite: 'Contexte factuel, demande précise et résultat attendu.',
        texte: `${amorce} la situation suivante : ${sujet}${contexte}.\n`
             + `Faits rapportés : ${P(answers.faits || d.texteBrut)}.\n`
             + `La direction peut-elle indiquer les règles applicables, les motifs et les mesures envisagées`
             + (attente ? `, afin de répondre à l'attente exprimée (${attente}) ?` : ' ?'),
      },
      cssct: {
        titre: 'Version CSSCT',
        finalite: 'Effets sur la santé, la sécurité et les conditions de travail.',
        texte: `Une évaluation des conséquences de la situation suivante — ${sujet}${contexte} — `
             + `sur la santé, la sécurité et les conditions de travail des salariés a-t-elle été réalisée ? `
             + `Quelles mesures de prévention sont prévues ?`,
      },
      cse: {
        titre: 'Version CSE',
        finalite: 'Organisation, droits collectifs, effectifs, décisions de l’entreprise.',
        texte: `Au regard de l'organisation du travail et des droits collectifs, ${amorce.toLowerCase()} : ${sujet}${contexte}. `
             + `La direction peut-elle préciser les règles applicables, les effectifs concernés et les décisions envisagées ?`,
      },
      relance: {
        titre: 'Relance',
        finalite: 'Lorsque la réponse est générale ou incomplète.',
        texte: `La réponse apportée ne précise ni les mesures retenues, ni le responsable de leur mise en œuvre, ni le calendrier. `
             + `La direction peut-elle communiquer ces trois éléments concernant : ${sujet} ?`,
      },
      chiffree: {
        titre: 'Demande chiffrée',
        finalite: 'Données, volumes, délais, effectifs ou indicateurs.',
        texte: `Concernant ${sujet}${contexte}, la direction peut-elle communiquer les données chiffrées correspondantes `
             + `(nombre de salariés concernés, fréquence, délais, indicateurs de suivi) sur les 12 derniers mois ?`,
      },
      centrale: {
        titre: 'Question centrale',
        finalite: 'Instance centrale ou multi-établissements.',
        texte: `La situation suivante — ${sujet} — est-elle constatée sur d'autres établissements ? `
             + `La direction peut-elle présenter une réponse harmonisée au niveau de l'entreprise ?`,
      },
    };
  }

  global.PS = global.PS || {};
  global.PS.assistant = {
    suggestCategorie, planQuestions, summarize, missingInfo, formulations, THEMES,
  };

})(window);
