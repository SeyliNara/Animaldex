# ANIMALdex — Deploy Guide

## Structure
```
animaldex-vercel/
├── api/
│   └── scan.js          ← Fonction serverless (proxy API)
├── public/
│   ├── index.html       ← App PWA
│   ├── manifest.json
│   ├── sw.js
│   ├── icon.png
│   └── icon-512.png
├── vercel.json
├── package.json
└── README.md
```

## Déploiement (5 minutes)

### 1. Mettre sur GitHub
- Crée un nouveau repo GitHub (ex: `animaldex`)
- Upload tous ces fichiers dedans

### 2. Connecter à Vercel
- Va sur vercel.com → "Add New Project"
- Importe ton repo GitHub `animaldex`
- Framework Preset: **Other**
- Clique Deploy (ça va échouer, c'est normal, on ajoute la clé après)

### 3. Ajouter la clé API
- Dans Vercel → ton projet → **Settings → Environment Variables**
- Ajoute :
  - Name: `ANTHROPIC_API_KEY`
  - Value: `sk-ant-api03-...` (ta clé Anthropic)
  - Environment: Production + Preview + Development
- Clique Save

### 4. Redéployer
- Vercel → ton projet → Deployments → clique les 3 points → **Redeploy**
- Dans 30 secondes tu as une URL `animaldex-xxx.vercel.app`

### 5. Installer sur iPhone
- Ouvre l'URL dans **Safari**
- Bouton partage → "Sur l'écran d'accueil"
- Done ✅

## Limite anti-abus
Le proxy est configuré à max 20 scans/heure par adresse IP.
Modifie `MAX_PER_HOUR` dans `api/scan.js` pour changer ça.
