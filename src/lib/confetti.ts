import confetti from 'canvas-confetti'

// Confettis discrets, uniquement si l'utilisateur accepte les animations
export function celebrate() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  confetti({ particleCount: 70, spread: 70, startVelocity: 32, origin: { y: 0.7 }, scalar: 0.8, ticks: 160, disableForReducedMotion: true })
}
