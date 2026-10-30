// Démarrage de la traduction de l'interface quand l'anglais est choisi
import { EN } from './en'
import { EN_ATTR } from './enAttr'
import { getLang } from './lang'
import { compile, startTranslator, translateText } from './translate'

export function initI18n() {
  if (getLang() !== 'en') return
  document.documentElement.lang = 'en'
  const { compiled } = startTranslator(EN, EN_ATTR)
  // Les boîtes de confirmation du navigateur ne passent pas par la page : on traduit leur texte
  const tr = (m?: unknown) => (typeof m === 'string' ? (translateText(m, compiled) ?? m) : m)
  const { confirm, alert, prompt } = window
  window.confirm = (m?: string) => confirm.call(window, tr(m) as string)
  window.alert = (m?: unknown) => alert.call(window, tr(m))
  window.prompt = (m?: string, d?: string) => prompt.call(window, tr(m) as string, d)
}

export { compile }
