// ===================================================================
// Parole Salariés By Cedmad — Edge Function : classify-demande
// -------------------------------------------------------------------
// Déclenchée automatiquement juste après le dépôt d'une demande (et,
// à la demande d'un élu, en réessai manuel). Elle appelle l'API Gemini
// (clé stockée UNIQUEMENT ici, jamais côté navigateur) pour :
//   1) suggérer une catégorie (parmi la liste fermée du cahier des
//      charges — jamais une valeur inventée) ;
//   2) générer les 7 formulations de questions (§5) ;
//   3) repérer des demandes existantes qui semblent parler du même sujet
//      (§6.2) — SANS jamais fusionner ni conclure : proposition à
//      valider par un élu ;
//   4) envoyer une alerte email à Cedmad (uniquement) à l'arrivée d'une
//      nouvelle demande — jamais sur un réessai manuel, jamais aux autres élus.
//
// Garde-fous (§5.3, §9), imposés dans le prompt ET revérifiés ici :
//   - n'utiliser QUE les faits fournis (texte brut + précisions) ;
//   - marquer « [à préciser] » ce qui manque, ne jamais l'inventer ;
//   - ne jamais qualifier automatiquement harcèlement/discrimination/
//     danger grave et imminent ;
//   - la catégorie renvoyée doit être strictement l'une des valeurs
//     autorisées (CATEGORIES), sinon elle est ignorée ;
//   - les doublons potentiels sont une SUGGESTION, jamais une fusion
//     automatique (validation humaine obligatoire).
//
// Clés nécessaires (secrets de la fonction, PAS des secrets de projet) :
//   GEMINI_API_KEY  — clé gratuite depuis https://aistudio.google.com/apikey
//   RESEND_API_KEY  — clé gratuite depuis https://resend.com/api-keys (optionnelle :
//                     si absente, l'alerte email est simplement ignorée)
// Variables auto-fournies par Supabase (aucune action requise) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// ===================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const CATEGORIES = [
  "CSE", "CSSCT", "Réclamation individuelle", "Sujet collectif",
  "Risque sécurité", "Risque psychosocial", "Harcèlement allégué",
  "Discrimination alléguée", "Organisation du travail", "Temps de travail",
  "Rémunération", "Effectifs", "Formation", "Égalité professionnelle",
  "Conditions matérielles", "Entreprise extérieure", "Intérim", "Autre",
]; // ⚠️ doit rester identique à store.CATEGORIES (js/store.js)

// gemini-2.0-flash a un quota gratuit à 0 sur certains projets — gemini-2.5-flash
// a un vrai quota gratuit disponible (vérifié). Redéfinissable via le secret GEMINI_MODEL.
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    categorie: { type: "STRING", enum: CATEGORIES },
    confiance: { type: "STRING", enum: ["élevée", "moyenne", "faible"] },
    informations_manquantes: { type: "ARRAY", items: { type: "STRING" } },
    formulations: {
      type: "OBJECT",
      properties: {
        courte: { type: "STRING" },
        developpee: { type: "STRING" },
        cssct: { type: "STRING" },
        cse: { type: "STRING" },
        relance: { type: "STRING" },
        chiffree: { type: "STRING" },
        centrale: { type: "STRING" },
      },
      required: ["courte", "developpee", "cssct", "cse", "relance", "chiffree", "centrale"],
    },
    doublons_potentiels: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          public_ref: { type: "STRING" },
          raison: { type: "STRING" },
        },
        required: ["public_ref", "raison"],
      },
    },
  },
  required: ["categorie", "confiance", "formulations", "doublons_potentiels"],
};

const SYSTEM_INSTRUCTION = `Tu assistes des élus du personnel (CSE/CSSCT) en France. Tu reçois le témoignage brut d'un salarié.

RÈGLES ABSOLUES (à respecter strictement) :
1. N'utilise QUE les faits explicitement présents dans le texte fourni. N'invente JAMAIS une date, un nom, un témoin, une conséquence ou un détail qui n'est pas écrit. Si une information utile manque, écris littéralement "[à préciser]" dans la formulation plutôt que de la deviner.
2. Ne qualifie JAMAIS automatiquement une situation de harcèlement, de discrimination, ou de danger grave et imminent — même si le texte semble le suggérer. Ces qualifications juridiques exigent une analyse humaine. Reste factuel et neutre.
3. Ne donne aucun conseil juridique définitif.
4. La "categorie" doit être EXACTEMENT une valeur de la liste fournie, jamais une valeur inventée.
5. Style : formulations COURTES (1 à 3 phrases maximum), naturelles et humaines — comme si un élu du personnel les avait écrites lui-même. Évite le ton robotique, ampoulé ou trop juridique. Reste factuel, direct, professionnel mais chaleureux, orienté vers une réponse concrète de la direction (mesures, délais, responsable), sans jugement ni accusation.
6. Pour "doublons_potentiels" : compare le sujet de la nouvelle demande à la liste des demandes existantes fournie. Ne signale QUE celles qui semblent concerner la MÊME situation concrète (même problème récurrent, même incident, même sujet précis) — pas simplement la même catégorie générale. En cas de doute, ne signale rien plutôt que de sur-signaler. Explique brièvement pourquoi dans "raison" (une phrase). Renvoie un tableau vide si aucune ne correspond. Ceci reste une SUGGESTION : ne dis jamais qu'il s'agit du même salarié ou de la même identité, seulement du même sujet.
7. Réponds UNIQUEMENT avec l'objet JSON demandé, rien d'autre.`;

function buildPrompt(d: any, candidats: { public_ref: string; resume: string; categorie: string }[]) {
  const reponsesTxt = Object.entries(d.reponses || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k} : ${v}`)
    .join("\n") || "(aucune précision complémentaire fournie)";
  const candidatsTxt = candidats.length
    ? candidats.map(c => `- ${c.public_ref} [${c.categorie || "non classé"}] : ${c.resume || "(pas de résumé)"}`).join("\n")
    : "(aucune autre demande en cours à comparer)";
  return `Catégories autorisées : ${CATEGORIES.join(" | ")}

Type de demande déclaré par le salarié : ${d.type_id}
Instance visée : ${d.instance}

Texte original du salarié (à ne jamais modifier ni citer déformé) :
"""
${d.texte_brut}
"""

Précisions complémentaires recueillies :
${reponsesTxt}

Demandes existantes non closes (pour repérer d'éventuels doublons — références et résumés uniquement) :
${candidatsTxt}

Propose : la catégorie la plus pertinente (dans la liste autorisée), ton niveau de confiance, les informations qui manqueraient pour traiter le dossier, les 7 formulations demandées (courte, développée, version CSSCT orientée santé/sécurité, version CSE orientée organisation/droits collectifs, une relance en cas de réponse insuffisante, une demande chiffrée, une question pour instance centrale/multi-établissements), et les doublons potentiels parmi les demandes existantes listées ci-dessus.`;
}

// Alerte email personnelle (Cedmad uniquement) — jamais aux autres élus, jamais
// sur un réessai manuel. Best-effort : une erreur ici ne doit jamais faire
// échouer la classification IA (appelée en tâche de fond, sans attendre/bloquer).
const ALERT_EMAIL_TO = "cedmad@hotmail.com";

async function sendAlertEmail(d: any, publicRef: string, apiKey: string) {
  const brut = d.texte_brut || "";
  const extrait = brut.length > 220 ? brut.slice(0, 220) + "…" : brut;
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Parole Salariés <onboarding@resend.dev>",
      to: [ALERT_EMAIL_TO],
      subject: `Nouvelle demande — ${publicRef}`,
      text: `Une nouvelle demande vient d'être déposée.\n\nRéférence : ${publicRef}\nInstance : ${d.instance || "—"}\n\nExtrait :\n${extrait}\n\nVoir dans l'espace élus : https://cedmad38.github.io/parole-salaries/elus.html`,
    }),
  });
  if (!resp.ok) throw new Error(`Resend API ${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 200)}`);
}

async function callGemini(prompt: string, apiKey: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    systemInstruction: { role: "system", parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  };
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Gemini API ${resp.status}: ${errText.slice(0, 300)}`);
  }
  const json = await resp.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Réponse Gemini vide ou inattendue");
  return JSON.parse(text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { public_ref, force } = await req.json();
    if (!public_ref || typeof public_ref !== "string") {
      return new Response(JSON.stringify({ ok: false, error: "public_ref manquant" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "GEMINI_API_KEY non configurée sur le projet." }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // "force" (retraitement manuel) réservé au SEUL super-administrateur — protège le
    // quota gratuit (partagé par tout le monde) d'un usage excessif par les autres élus.
    let isSuperAdmin = false;
    const authHeader = req.headers.get("Authorization");
    if (force && authHeader) {
      const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: userData } = await asUser.auth.getUser();
      if (userData?.user) {
        const { data: elu } = await admin.from("elus").select("role,actif").eq("id", userData.user.id).single();
        isSuperAdmin = !!elu && elu.actif !== false && elu.role === "super_admin";
      }
    }

    const { data: d, error: fetchErr } = await admin
      .from("demandes")
      .select("id, texte_brut, type_id, instance, reponses, categorie, ia_traite_at")
      .eq("public_ref", public_ref)
      .single();

    if (fetchErr || !d) {
      return new Response(JSON.stringify({ ok: false, error: "Demande introuvable." }), {
        status: 404, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (d.ia_traite_at && !(force && isSuperAdmin)) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "Déjà traité." }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Alerte email — uniquement au tout premier traitement (nouvelle demande), jamais sur un
    // réessai manuel. En tâche de fond : ne bloque jamais la réponse, ne casse jamais l'IA.
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!d.ia_traite_at && RESEND_API_KEY) {
      sendAlertEmail(d, public_ref, RESEND_API_KEY).catch(() => {});
    }

    // Demandes existantes non closes, pour la détection de doublons potentiels (§6.2)
    const { data: candidatsRaw } = await admin
      .from("demandes")
      .select("public_ref, resume, categorie")
      .neq("id", d.id)
      .not("statut", "in", "(Clôturée,Archivée,Résolue)")
      .order("created_at", { ascending: false })
      .limit(30);
    const candidats = candidatsRaw || [];
    const candidatRefs = new Set(candidats.map((c) => c.public_ref));

    const result = await callGemini(buildPrompt(d, candidats), GEMINI_API_KEY);

    const categorie = CATEGORIES.includes(result.categorie) ? result.categorie : d.categorie;
    const formulations = result.formulations || null;
    // Ne garder que des doublons pointant vers une demande réellement fournie dans le prompt
    // (protection contre une référence halluciné) — jamais la demande elle-même.
    const doublons = Array.isArray(result.doublons_potentiels)
      ? result.doublons_potentiels.filter((x: any) => x && candidatRefs.has(x.public_ref) && x.public_ref !== public_ref)
      : [];

    await admin.from("demandes").update({
      categorie,
      ia_formulations: formulations,
      ia_categorie_confiance: result.confiance || null,
      ia_doublons: doublons,
      ia_traite_at: new Date().toISOString(),
    }).eq("id", d.id);

    return new Response(JSON.stringify({ ok: true, categorie, confiance: result.confiance, formulations, doublons }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
