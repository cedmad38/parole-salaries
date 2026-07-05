/* ===================================================================
   Parole Salariés By Cedmad — Repères juridiques (à titre indicatif)
   -------------------------------------------------------------------
   Informations générales pour orienter les élus dans leurs échanges avec
   la direction. NON exhaustif, NE CONSTITUE PAS un avis juridique et ne
   qualifie jamais automatiquement une situation (§5.3, §9 du cahier des
   charges). Vérifier systématiquement la version en vigueur des articles
   ainsi que la convention collective / les accords d'entreprise applicables.

   Les articles cités ci-dessous sont des références générales et connues
   du Code du travail (et, ponctuellement, du Code pénal) associées à
   chaque catégorie. Ils ne sont jamais générés dynamiquement : la liste
   est fixe, écrite à la main, pour éviter toute invention.
   =================================================================== */
(function (global) {
  'use strict';

  const REF = {
    'Temps de travail': {
      items: [
        ['Durée légale du travail (35h/semaine)', 'Code du travail, art. L3121-27'],
        ['Repos quotidien (11h consécutives minimum)', 'Code du travail, art. L3131-1'],
        ['Repos hebdomadaire (24h + repos quotidien)', 'Code du travail, art. L3132-2'],
        ['Délai de prévenance en cas de changement d’horaires — temps partiel (7 jours, 3 jours si accord de branche)', 'Code du travail, art. L3123-24'],
      ],
      note: "Pour un salarié à temps plein, le Code du travail ne fixe pas de délai universel de prévenance en cas de changement de planning : cela dépend souvent du contrat de travail, du règlement intérieur ou de la convention collective applicable.",
    },
    'Rémunération': {
      items: [
        ['Mentions obligatoires du bulletin de paie', 'Code du travail, art. L3243-2'],
        ['Égalité de rémunération entre les femmes et les hommes', 'Code du travail, art. L3221-2'],
        ['SMIC', 'Code du travail, art. L3231-2'],
      ],
      note: "Une prime d’ancienneté ne résulte généralement pas de la loi mais de la convention collective ou du contrat de travail — à vérifier au cas par cas.",
    },
    'Risque sécurité': {
      items: [
        ['Obligation de sécurité de l’employeur (santé physique et mentale)', 'Code du travail, art. L4121-1'],
        ['Principes généraux de prévention', 'Code du travail, art. L4121-2'],
        ['Droit de retrait en cas de danger grave et imminent', 'Code du travail, art. L4131-1 à L4131-4'],
        ['Document unique d’évaluation des risques (DUERP)', 'Code du travail, art. L4121-3'],
      ],
      note: '',
    },
    'Risque psychosocial': {
      items: [
        ['Obligation de sécurité (santé physique ET mentale)', 'Code du travail, art. L4121-1'],
        ['Principes généraux de prévention', 'Code du travail, art. L4121-2'],
        ['Prévention du harcèlement moral', 'Code du travail, art. L1152-1 à L1152-6'],
      ],
      note: '',
    },
    'Harcèlement allégué': {
      items: [
        ['Interdiction du harcèlement moral', 'Code du travail, art. L1152-1'],
        ['Protection du salarié qui témoigne ou relate des faits', 'Code du travail, art. L1152-2'],
        ['Obligation de prévention de l’employeur', 'Code du travail, art. L1152-4'],
        ['Procédure de médiation possible', 'Code du travail, art. L1152-6'],
        ['Harcèlement sexuel', 'Code du travail, art. L1153-1 à L1153-6'],
        ['Sanction pénale du harcèlement moral', 'Code pénal, art. 222-33-2'],
      ],
      note: "Ne jamais qualifier seul(e) une situation de « harcèlement » : c'est une qualification juridique précise qui nécessite une analyse approfondie des faits (répétition, éléments matériels), éventuellement avec l'appui d'un avocat ou de l'inspection du travail.",
    },
    'Discrimination alléguée': {
      items: [
        ['Principe de non-discrimination', 'Code du travail, art. L1132-1'],
        ['Nullité de toute mesure discriminatoire', 'Code du travail, art. L1132-4'],
        ['Sanction pénale', 'Code pénal, art. 225-1 et 225-2'],
      ],
      note: "Comme pour le harcèlement, la qualification de « discrimination » nécessite une analyse juridique précise, au cas par cas.",
    },
    'Organisation du travail': {
      items: [
        ['Mission générale du CSE (réclamations, application du Code du travail)', 'Code du travail, art. L2312-5'],
        ['Consultations récurrentes du CSE (orientations stratégiques, politique sociale…)', 'Code du travail, art. L2312-17'],
      ],
      note: '',
    },
    'Effectifs': {
      items: [
        ['Mission générale du CSE (réclamations, application du Code du travail)', 'Code du travail, art. L2312-5'],
        ['Consultations récurrentes du CSE', 'Code du travail, art. L2312-17'],
      ],
      note: '',
    },
    'Formation': {
      items: [
        ['Obligation d’adaptation du salarié à son poste de travail', 'Code du travail, art. L6321-1'],
        ['Entretien professionnel (tous les 2 ans)', 'Code du travail, art. L6315-1'],
      ],
      note: '',
    },
    'Égalité professionnelle': {
      items: [
        ['Égalité de traitement entre les femmes et les hommes', 'Code du travail, art. L1142-1'],
        ['Égalité de rémunération', 'Code du travail, art. L3221-2'],
        ['Index de l’égalité professionnelle', 'Code du travail, art. L1142-8'],
      ],
      note: '',
    },
    'Conditions matérielles': {
      items: [
        ['Obligation générale de sécurité (locaux et équipements)', 'Code du travail, art. L4121-1'],
        ['Aération et assainissement des locaux de travail', 'Code du travail, art. R4222-1'],
        ['Ambiance thermique, éclairage', 'Code du travail, art. R4223-13 et suivants'],
      ],
      note: '',
    },
    'Entreprise extérieure': {
      items: [
        ['Plan de prévention en cas d’intervention d’une entreprise extérieure', 'Code du travail, art. R4512-6'],
      ],
      note: '',
    },
    'Intérim': {
      items: [
        ['Égalité de rémunération avec un salarié équivalent de l’entreprise utilisatrice', 'Code du travail, art. L1251-18'],
        ['Motifs de recours au travail temporaire', 'Code du travail, art. L1251-6'],
      ],
      note: '',
    },
  };

  // Générique : CSE, CSSCT, Réclamation individuelle, Sujet collectif, Autre, ou catégorie non classée
  const GENERIQUE = {
    items: [
      ['Mission générale du CSE (réclamations individuelles et collectives, salaires, application du Code du travail)', 'Code du travail, art. L2312-5'],
      ['Attributions santé, sécurité et conditions de travail du CSE', 'Code du travail, art. L2312-9'],
    ],
    note: '',
  };

  function forCategorie(categorie) {
    const ref = REF[categorie] || GENERIQUE;
    return { categorie: categorie || 'Non classée', items: ref.items, note: ref.note };
  }

  global.PS = global.PS || {};
  global.PS.legal = { forCategorie };
})(window);
