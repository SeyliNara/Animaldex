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

RÈGLE 1 — numero : Calcule un numéro entre 001 et 999 basé sur la position alphabétique du nom scientifique. INTERDIT d'utiliser 042 par défaut. Exemples: Panthera leo → 612, Aquila chrysaetos → 071, Delphinus delphis → 234.

RÈGLE 2 — region : Tu DOIS choisir EXACTEMENT une de ces 9 valeurs (copie mot pour mot) :
- Europe
- Afrique
- Amérique du Nord
- Amérique du Sud
- Asie
- Asie du Sud-Est
- Océanie
- Arctique
- Antarctique

Si l'animal vit sur plusieurs continents, choisis son aire de répartition principale. N'utilise JAMAIS "Mondial", "Global", "Cosmopolite" ou toute autre valeur.

Réponds avec ce JSON :
{"found":true,"numero":"NNN","nomCommun":"nom français","nomScientifique":"Genus species","famille":"famille","ordre":"ordre","classe":"Mammifère","habitat":"description habitat","regime":"Carnivore","taille":"30-45 cm","poids":"2-5 kg","conservation":"LC","conservationLabel":"Préoccupation mineure","description":"2-3 phrases fascinantes.","anecdote":"anecdote surprenante.","type1":"Terrestre","type2":null,"confiance":"haute","region":"Afrique"}

Si aucun animal visible : {"found":false,"message":"Aucun animal détecté."}`,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 } },
            { type: "text", text: "Identifie l'animal sur cette photo. Génère un numéro unique basé sur son nom scientifique, et choisis sa région parmi les 9 valeurs autorisées." }
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

    // Sanitize region — force to valid value if Claude hallucinated
    const VALID_REGIONS = ["Europe","Afrique","Amérique du Nord","Amérique du Sud","Asie","Asie du Sud-Est","Océanie","Arctique","Antarctique"];
    if (!VALID_REGIONS.includes(result.region)) {
      // Try to map common mistakes
      const r = (result.region || "").toLowerCase();
      if (r.includes("europe")) result.region = "Europe";
      else if (r.includes("afrique") || r.includes("africa")) result.region = "Afrique";
      else if (r.includes("nord") || r.includes("north america")) result.region = "Amérique du Nord";
      else if (r.includes("sud") || r.includes("south america")) result.region = "Amérique du Sud";
      else if (r.includes("sud-est") || r.includes("southeast")) result.region = "Asie du Sud-Est";
      else if (r.includes("asie") || r.includes("asia")) result.region = "Asie";
      else if (r.includes("océanie") || r.includes("oceania") || r.includes("australia")) result.region = "Océanie";
      else if (r.includes("arctique") || r.includes("arctic")) result.region = "Arctique";
      else if (r.includes("antarc")) result.region = "Antarctique";
      else result.region = "Afrique"; // fallback for truly unknown
    }

    // Sanitize numero — prevent 042 default
    if (!result.numero || result.numero === "042" || result.numero === "NNN") {
      // Generate from scientific name
      const name = result.nomScientifique || "Unknown species";
      let hash = 0;
      for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash) + name.charCodeAt(i);
      result.numero = String(Math.abs(hash % 899) + 100);
    }

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
