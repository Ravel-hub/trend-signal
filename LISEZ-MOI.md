# Signal — guide de mise en ligne (pas à pas, sans code)

Ce dossier contient tout le nécessaire pour mettre l'app en ligne avec votre
propre nom de domaine. Suivez les étapes dans l'ordre, il n'y a rien à coder.

## Étape 1 — Créer un compte GitHub (5 min)

1. Allez sur https://github.com et créez un compte gratuit
2. Cliquez sur "New repository", donnez-lui un nom (ex: `trend-signal`)
3. Laissez-le "Public" ou "Private", peu importe, puis "Create repository"
4. Sur la page qui suit, cliquez "uploading an existing file"
5. Glissez-déposez TOUS les fichiers de ce dossier (sauf node_modules s'il existe)
6. Cliquez "Commit changes" en bas de page

## Étape 2 — Déployer sur Vercel (5 min, gratuit)

1. Allez sur https://vercel.com et créez un compte avec "Continue with GitHub"
2. Cliquez "Add New" → "Project"
3. Choisissez le repository `trend-signal` que vous venez de créer
4. Vercel détecte automatiquement qu'il s'agit d'un projet Vite — ne changez rien
5. Cliquez "Deploy" et attendez 1-2 minutes

Vous obtenez un lien du type `trend-signal.vercel.app` — l'app est en ligne
et accessible à tout le monde.

## Étape 3 — Ajouter votre nom de domaine (optionnel)

1. Achetez un nom de domaine chez un registrar (Namecheap, OVH, Google Domains...)
   — comptez environ 10 à 15€/an
2. Dans Vercel, ouvrez votre projet → onglet "Settings" → "Domains"
3. Tapez votre nom de domaine (ex: `monsignal.com`) et cliquez "Add"
4. Vercel affiche 1 ou 2 lignes DNS à copier (des enregistrements "A" ou "CNAME")
5. Allez chez votre registrar de domaine → section "DNS" → collez ces lignes
6. Patientez entre 10 minutes et quelques heures (propagation DNS)

Votre app est alors accessible sur `monsignal.com` directement.

## Pour republier une mise à jour plus tard

Chaque fois que vous modifiez un fichier sur GitHub (ou que vous en uploadez
une nouvelle version), Vercel redéploie automatiquement l'app en 1-2 minutes.
Vous n'avez jamais besoin de repasser par l'étape 2.

## Ce que fait chaque fichier (pour info, pas besoin d'y toucher)

- `src/App.jsx` — le code de l'application (le "cerveau" de l'app)
- `src/main.jsx` / `index.html` — le point de démarrage technique
- `package.json` — la liste des briques logicielles utilisées (React, graphiques...)
- `tailwind.config.js` / `postcss.config.js` — la mise en forme visuelle
- `vite.config.js` — l'outil qui assemble le site avant publication
