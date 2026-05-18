export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left'
}: {
  eyebrow?: string
  title: string
  description?: string
  align?: 'left' | 'center'
}) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
      {eyebrow ? <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-[#b99a5f]">{eyebrow}</p> : null}
      <h2 className="font-[var(--font-plex)] text-3xl font-semibold text-white text-balance md:text-5xl">{title}</h2>
      {description ? <p className="mt-5 text-base leading-8 text-slate-400 md:text-lg">{description}</p> : null}
    </div>
  )
}
