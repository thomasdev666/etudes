import { useState } from 'react'
import { SUBJECT_PALETTE } from '@/lib/colors'
import { cx } from './ui'

// Pastilles de couleur compactes (palette + couleur libre)
export function Swatches({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Couleur de ${label}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="size-8 rounded-full border-2 border-surface shadow-card ring-1 ring-border"
        style={{ background: value }}
      />
      {open && (
        <div className="anim-pop absolute right-0 z-20 mt-2 flex w-48 flex-wrap gap-1.5 rounded-2xl border border-border bg-surface p-2 shadow-lg">
          {SUBJECT_PALETTE.map((p) => (
            <button
              key={p.hex}
              type="button"
              aria-label={p.name}
              onClick={() => {
                onChange(p.hex)
                setOpen(false)
              }}
              className={cx('size-7 rounded-full', p.hex.toLowerCase() === value.toLowerCase() && 'ring-2 ring-text ring-offset-2 ring-offset-surface')}
              style={{ background: p.hex }}
            />
          ))}
          <label className="relative flex size-7 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-border text-xs text-muted" title="Couleur libre">
            +
            <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Couleur libre" />
          </label>
        </div>
      )}
    </div>
  )
}
