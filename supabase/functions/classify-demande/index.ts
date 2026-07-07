// ===================================================================
// Parole Salariés By Cedmad — Edge Function : classify-demande
// -------------------------------------------------------------------
// Déclenchée automatiquement juste après le dépôt d'une demande (et,
// à la demande d'un élu, en réessai manuel). Elle appelle l'API Gemini
// (clé stockée UNIQUEMENT ici, jamais côté navigateur) pour :
//   1) suggérer une catégorie (parmi la liste fermée du cahier des
//      charges — jamais une valeur inventée) ;
//   2) générer les 7 formulations de questions (§5).
//
// Garde-fous (§5.3, §9), imposés dans le prompt ET revérifiés ici :
//   - n'utiliser QUE les faits fournis (texte brut + précisions) ;
//   - marquer « [à préciser] » ce qui manque, ne jamais l'inventer ;
//   - ne jamais qualifier automatiquement harcèlement/discrimination/
//     danger grave et imminent ;
//   - la catégorie renvoyée doit être strictement l'une des valeurs
//     autorisées (CATEGORIES), sinon elle est ignorée.
//
// Clé nécessaire (secret de la fonction, PAS un secret de projet) :
//   GEMINI_API_KEY  — clé gratuite depuis https://aistudio.google.com/apikey
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
  },
  required: ["categorie", "confiance", "formulations"],
};

const SYSTEM_INSTRUCTION = `Tu assistes des élus du personnel (CSE/CSSCT) en France. Tu reçois le témoignage brut d'un salarié.

RÈGLES ABSOLUES (à respecter strictement) :
1. N'utilise QUE les faits explicitement présents dans le texte fourni. N'invente JAMAIS une date, un nom, un témoin, une conséquence ou un détail qui n'est pas écrit. Si une information utile manque, écris littéralement "[à préciser]" dans la formulation plutôt que de la deviner.
2. Ne qualifie JAMAIS automatiquement une situation de harcèlement, de discrimination, ou de danger grave et imminent — même si le texte semble le suggérer. Ces qualifications juridiques exigent une analyse humaine. Reste factuel et neutre.
3. Ne donne aucun conseil juridique définitif.
4. La "categorie" doit être EXACTEMENT une valeur de la liste fournie, jamais une valeur inventée.
5. Style : formulations COURTES (1 à 3 phrases maximum), naturelles et humaines — comme si un élu du personnel les avait écrites lui-même. Évite le ton robotique, ampoulé ou trop juridique. Reste factuel, direct, professionnel mais chaleureux, orienté vers une réponse concrète de la direction (mesures, délais, responsable), sans jugement ni accusation.
6. Réponds UNIQUEMENT avec l'objet JSON demandé, rien d'autre.`;

function buildPrompt(d: any) {
  const reponsesTxt = Object.entries(d.reponses || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k} : ${v}`)
    .join("\n") || "(aucune précision complémentaire fournie)";
  return `Catégories autorisées : ${CATEGORIES.join(" | ")}

Type de demande déclaré par le salarié : ${d.type_id}
Instance visée : ${d.instance}

Texte original du salarié (à ne jamais modifier ni citer déformé) :
"""
${d.texte_brut}
"""

Précisions complémentaires recueillies :
${reponsesTxt}

Propose : la catégorie la plus pertinente (dans la liste autorisée), ton niveau de confiance, les informations qui manqueraient pour traiter le dossier, et les 7 formulations demandées (courte, développée, version CSSCT orientée santé/sécurité, version CSE orientée organisation/droits collectifs, une relance en cas de réponse insuffisante, une demande chiffrée, une question pour instance centrale/multi-établissements).`;
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

    const result = await callGemini(buildPrompt(d), GEMINI_API_KEY);

    const categorie = CATEGORIES.includes(result.categorie) ? result.categorie : d.categorie;
    const formulations = result.formulations || null;

    await admin.from("demandes").update({
      categorie,
      ia_formulations: formulations,
      ia_categorie_confiance: result.confiance || null,
      ia_traite_at: new Date().toISOString(),
    }).eq("id", d.id);

    await admin.from("journal").insert({
      action: "Classification IA (Gemini) appliquée",
      user_label: isSuperAdmin ? "IA (Gemini) — relance Cedmad" : "IA (Gemini)",
      demande_id: d.id,
      detail: categorie,
    });

    return new Response(JSON.stringify({ ok: true, categorie, confiance: result.confiance, formulations }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
