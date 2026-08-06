// api/scan.js — Serverless function Vercel
// La clé API reste côté serveur, jamais exposée au client

export const config = { maxDuration: 30 };

// Simple rate limiting par IP (en mémoire, reset à chaque cold start)
const rateLimit = new Map();
const MAX_PER_HOUR = 20; // max 20 scans/heure par IP

export default async function handler(req, res) {
  // CORS — autorise toutes les origines (ton domaine Vercel)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Rate limiting
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const hourAgo = now - 3600000;
  const calls = (rateLimit.get(ip) || []).filter(t => t > hourAgo);
  if (calls.length >= MAX_PER_HOUR) {
    return res.status(429).json({ error: `Limite atteinte : ${MAX_PER_HOUR} scans/heure. Réessaie plus tard.` });
  }
  rateLimit.set(ip, [...calls, now]);

  // Récupère l'image depuis le body
  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: "Image manquante" });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY, // clé depuis variable d'env Vercel
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        system: `Tu es un expert zoologiste. Réponds UNIQUEMENT avec un JSON valide, sans markdown, sans backticks.
Si animal visible: {"found":true,"numero":"042","nomCommun":"nom français","nomScientifique":"Genus species","famille":"famille","ordre":"ordre","classe":"Mammifère","habitat":"description","regime":"Carnivore","taille":"30-45 cm","poids":"2-5 kg","conservation":"LC","conservationLabel":"Préoccupation mineure","description":"2-3 phrases fascinantes.","anecdote":"anecdote surprenante.","type1":"Terrestre","type2":null,"confiance":"haute"}
Sinon: {"found":false,"message":"Aucun animal détecté."}`,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 } },
            { type: "text", text: "Identifie l'animal sur cette photo." }
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
