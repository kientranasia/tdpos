import Link from 'next/link'

export function CTASection({
  title = 'Build the next operating layer for your enterprise.',
  description = 'Talk to TRANDAO Investment about AI safety monitoring, digital transformation, infrastructure planning, and enterprise automation.',
  cta = 'Book Consultation'
}: {
  title?: string
  description?: string
  cta?: string
}) {
  return (
    <section className="py-20">
      <div className="container border border-[#b99a5f]/30 bg-[#101826] p-8 md:p-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#b99a5f]">Executive consultation</p>
            <h2 className="mt-4 max-w-3xl font-[var(--font-plex)] text-3xl font-semibold text-white md:text-5xl">{title}</h2>
            <p className="mt-5 max-w-2xl leading-8 text-slate-400">{description}</p>
          </div>
          <Link href="/contact" className="inline-flex items-center justify-center border border-[#b99a5f]/60 bg-[#b99a5f] px-6 py-4 text-sm font-semibold text-[#050912] transition hover:bg-[#d3b77a]">
            {cta}
          </Link>
        </div>
      </div>
    </section>
  )
}
