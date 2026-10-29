// Logo Regulya : la marque (R) et le mot, en SVG dans la page pour utiliser la police Nunito de l'appli.
// La couleur du texte suit le thème (currentColor) ; le corail reste fixe.
export function Logo({ withBaseline = true, className }: { withBaseline?: boolean; className?: string }) {
  return (
    <svg viewBox={withBaseline ? '0 0 780 190' : '0 0 780 160'} role="img" aria-label="Regulya" className={className}>
      <g transform="translate(28 24) scale(0.72)">
        <path d="M 70,26 C 70,11 82,0 98,0 L 170,0 C 204,0 226,22 226,51 C 226,78 207,94 174,97 L 116,99 C 99,100 89,110 89,127 L 89,154 C 89,170 77,182 62,182 C 54,182 49,177 49,169 L 49,127 C 49,96 69,76 101,74 L 165,72 C 178,71 186,64 186,53 C 186,42 178,35 165,35 L 98,35 C 82,35 70,34 70,26 Z" fill="currentColor" />
        <path d="M 126,105 L 156,105 C 165,105 172,109 179,117 L 226,169 C 230,174 227,182 219,182 L 190,182 C 180,182 173,178 166,170 L 122,119 C 117,113 119,105 126,105 Z" fill="#F26B4F" />
      </g>
      <text x="220" y="116" fontFamily="Nunito, sans-serif" fontSize="76" fontWeight="800" letterSpacing="-2.5" fill="currentColor">
        Regulya
      </text>
      {withBaseline && (
        <text x="223" y="151" fontFamily="Nunito, sans-serif" fontSize="17" fontWeight="500" letterSpacing="3.1" fill="currentColor">
          Organise · Révise · Réussis
        </text>
      )}
    </svg>
  )
}
