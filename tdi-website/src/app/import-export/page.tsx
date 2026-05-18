import { CTASection } from '@/components/CTASection'
import { SectionHeading } from '@/components/SectionHeading'
import { createMetadata } from '@/lib/site'

export const metadata = createMetadata({
  title: 'Import Export',
  description: 'Seafood and agriculture import/export operations connecting Vietnam supply with regional demand.',
  path: '/import-export'
})

export default function ImportExportPage() {
  return (
    <main>
      <section className="border-b border-white/10 py-20 md:py-28">
        <div className="container">
          <SectionHeading eyebrow="Import / export" title="Trade operations for seafood and agriculture markets." description="TRANDAO develops import and export capabilities that connect Vietnamese supply strengths with demand across Southeast Asia and beyond." />
        </div>
      </section>
      <section className="py-20">
        <div className="container grid gap-4 md:grid-cols-3">
          {['Seafood', 'Agriculture', 'Regional Trade'].map((item) => (
            <div key={item} className="border border-white/10 bg-[#0b111c] p-8">
              <h2 className="font-[var(--font-plex)] text-2xl font-semibold text-white">{item}</h2>
              <p className="mt-5 leading-8 text-slate-400">Structured trade execution with attention to reliability, quality, and market development.</p>
            </div>
          ))}
        </div>
      </section>
      <CTASection />
    </main>
  )
}
