// Sur Netlify, refuse de publier un site sans configuration Supabase
// (sinon le site affiche « Configuration manquante »).
const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter((k) => !process.env[k]?.trim())
if (process.env.NETLIFY && missing.length) {
  console.error(`\n✖ Variables manquantes pendant le build : ${missing.join(', ')}`)
  console.error('  Netlify → Project configuration → Environment variables, scope « Builds » coché, puis redéployer.\n')
  process.exit(1)
}
console.log(missing.length ? `(local) variables absentes : ${missing.join(', ')}` : '✓ Variables Supabase présentes')
