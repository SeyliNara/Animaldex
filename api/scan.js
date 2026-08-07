export const config = { maxDuration: 30 };

const rateLimit = new Map();
const MAX_PER_HOUR = 20;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const hourAgo = now - 3600000;
  const calls = (rateLimit.get(ip) || []).filter(t => t > hourAgo);
  if (calls.length >= MAX_PER_HOUR) {
    return res.status(429).json({ error: `Limite atteinte : ${MAX_PER_HOUR} scans/heure. Réessaie plus tard.` });
  }
  rateLimit.set(ip, [...calls, now]);

  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: "Image manquante" });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        system: `Tu es un expert zoologiste intégré dans un Pokédex des animaux.
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans backticks, sans texte autour.

RÈGLES IMPORTANTES :
- "numero" : génère un numéro UNIQUE entre 001 et 999 basé sur la classification taxonomique de l'animal (utilise l'ordre alphabétique du nom scientifique pour le calculer de façon cohérente). Ne mets JAMAIS 042 par défaut.
- "region" : utilise exactement l'une de ces valeurs : Europe, Afrique, Amérique du Nord, Amérique du Sud, Asie, Asie du Sud-Est, Océanie, Arctique, Antarctique, Mondial

Structure JSON si animal détecté :
{
  "found": true,
  "numero": "NNN",
  "nomCommun": "nom en français",
  "nomScientifique": "Genus species",
  "famille": "famille taxonomique",
  "ordre": "ordre taxonomique",
  "classe": "Mammifère ou Oiseau ou Reptile ou Amphibien ou Poisson ou Insecte ou Arachnide ou Crustacé",
  "habitat": "description courte de l'habitat naturel",
  "regime": "Carnivore ou Herbivore ou Omnivore ou Insectivore",
  "taille": "ex: 30-45 cm",
  "poids": "ex: 2-5 kg",
  "conservation": "LC ou NT ou VU ou EN ou CR ou EX",
  "conservationLabel": "Préoccupation mineure ou Quasi menacé ou Vulnérable ou En danger ou En danger critique ou Éteint",
  "description": "2-3 phrases fascinantes sur cet animal.",
  "anecdote": "Une anecdote surprenante peu connue.",
  "type1": "Terrestre ou Aquatique ou Aérien ou Nocturne ou Diurne ou Venimeux ou Prédateur ou Herbivore ou Social ou Solitaire",
  "type2": "second type si pertinent, sinon null",
  "confiance": "haute ou moyenne ou faible",
  "region": "région d'origine principale de l'espèce"
}

Si aucun animal visible : {"found": false, "message": "Aucun animal détecté."}`,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 } },
            { type: "text", text: "Identifie précisément l'animal sur cette photo et génère sa fiche complète." }
          ]
        }]
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || "Erreur API" });

    const text = (data.content || []).map(b => b.text || "").join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: "Réponse inattendue du modèle" });

    const result = JSON.parse(match[0]);
    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
