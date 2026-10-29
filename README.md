# Études

Application web installable (PWA) pour organiser ses études et réviser efficacement : agenda des devoirs, matières, cours importés, QCM générés par IA, flash cards à répétition espacée (SM-2), révision des erreurs, plans de révision et prise de notes.

Stack : React + Vite + TypeScript + Tailwind, Supabase (base, authentification, fichiers), fonctions Netlify (IA et calendrier), Google Gemini (offre gratuite).

## Mise en ligne (une seule fois)

### 1. Base de données Supabase

1. Ouvrir le projet Supabase, puis **SQL Editor → New query**.
2. Coller tout le contenu de `supabase/migrations/0001_schema.sql` et cliquer sur **Run**, puis faire de même avec `0002_mindmaps_onboarding.sql`, `0003_imported_events.sql`, `0004_sessions_sheets.sql`, `0005_course_rename.sql`, `0006_search.sql`, `0007_recordings.sql`, `0008_resources_reminders.sql`, `0009_exams.sql` et `0010_planning.sql` (relançables sans danger).
3. **Authentication → URL Configuration** :
   - *Site URL* : l'adresse du site (par ex. `https://jadecaruana.fr`).
   - *Redirect URLs* : ajouter `https://jadecaruana.fr/**` et l'adresse Netlify (`https://<nom>.netlify.app/**`).
4. **Authentication → Providers → Email** : laisser « Confirm email » activé.

### 2. Clé IA gratuite (Google Gemini)

1. Aller sur <https://aistudio.google.com/apikey> avec un compte Google.
2. **Create API key**. Aucune carte bancaire n'est demandée : l'offre gratuite suffit pour un usage personnel. Ne pas activer la facturation : le projet reste alors à 0 €.

### 3. Netlify

1. **Add new site → Import an existing project**, choisir ce dépôt GitHub. Netlify lit `netlify.toml` (build `npm run build`, dossier `dist`).
2. **Site configuration → Environment variables** :

| Variable | Valeur |
|---|---|
| `VITE_SUPABASE_URL` | URL du projet Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | clé `sb_publishable_…` |
| `GEMINI_API_KEY` | clé Gemini (étape 2) |
| `SUPABASE_SECRET_KEY` | *optionnel* : clé `sb_secret_…` (Supabase → Settings → API Keys), pour effacer de Storage les fichiers purgés |
| `GEMINI_MODEL` | *optionnel* : modèle Gemini, `gemini-flash-latest` par défaut |
| `BREVO_SMTP_LOGIN` | *rappels par email* : identifiant SMTP Brevo (`xxxx@smtp-brevo.com`) |
| `BREVO_SMTP_KEY` | *rappels par email* : clé SMTP Brevo |
| `MAIL_FROM` | *rappels par email* : expéditeur validé dans Brevo, ex. `Études <adresse@exemple.fr>` |

3. Redéployer. Pour le domaine : **Domain management → Add a domain → jadecaruana.fr**.

## Développement

```bash
cp .env.example .env.local   # puis remplir
npm install
npm run dev        # interface seule
npx netlify dev    # interface + fonctions (IA, calendrier)
npm test           # tests unitaires (SM-2, planification, calendrier, validation IA)
npm run typecheck
```

## Organisation du code

```
src/
  pages/            un fichier par écran
  components/       composants d'interface (ui.tsx), éditeur de notes, formulaires
  lib/sm2.ts        répétition espacée (testée)
  lib/planner.ts    découpage des devoirs en séances (testé)
  lib/calendar.ts   lecture du calendrier Outlook (ICS) (testée)
netlify/
  shared/ai/        couche IA unique ; changer de fournisseur = ajouter un fichier à côté de gemini.ts
  functions/        ai-job-background (génération, transcription), ai-subjects, cleanup et reminders (tâches quotidiennes), test-email
supabase/migrations schéma, RLS, corbeille, purge à 30 jours
```

## Sécurité

- RLS sur toutes les tables ; chaque ligne porte `space_id` et `user_id`. Une clé étrangère composite garantit qu'aucune donnée ne peut être rattachée à l'espace d'un autre utilisateur, ni à une matière d'un autre espace.
- Réponses des QCM illisibles côté client : les colonnes `correct_index` et `explanation` ne sont pas accessibles. La correction est renvoyée par la fonction `finish_quiz_session`, une fois la session terminée.
- Aucune clé secrète dans le code front. L'IA est appelée uniquement depuis les fonctions Netlify.
- Fichiers privés : le bucket Storage `files` est cloisonné par utilisateur, et les liens sont temporaires.

## Écarts par rapport au cahier des charges

| Spécification | Choix retenu | Raison |
|---|---|---|
| Edge Functions Supabase | Fonctions Netlify | Un seul endroit à déployer, avec le site. Les fonctions d'arrière-plan (offre Pro) permettent des générations longues. |
| Microsoft Graph (OAuth) | Lien de calendrier publié (ICS) | Gratuit, sans application Azure ni accord du service informatique de l'école. Lecture seule, comme prévu en V1. |
| Extraction PDF côté serveur | Extraction dans le navigateur (pdf.js) | Gratuit, rapide, et le PDF n'est envoyé à aucun tiers. |
| Fond crème | Thème neutre clair et sombre, accent indigo | Demande de la titulaire. Contrastes vérifiés (WCAG AA). |
| Mail de confirmation de suppression de compte | Non envoyé pour l'instant | Il faut un service d'email (Resend, gratuit) et un domaine vérifié. Prévu avec les notifications (V2). |
