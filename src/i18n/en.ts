// Dictionnaire complet français → anglais de l'interface
import { EN1 } from './en1'
import { EN2 } from './en2'
import { EN3 } from './en3'
import { EN4 } from './en4'

export const EN: Record<string, string> = { ...EN1, ...EN2, ...EN3, ...EN4 }
