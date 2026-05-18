import { CTASection } from '@/components/CTASection'
import { SectionHeading } from '@/components/SectionHeading'
import { createMetadata } from '@/lib/site'

export const metadata = createMetadata({
  title: 'Investment',
  description: 'Strategic M&A, real estate, and property management initiatives for TRANDAO Investment.',
  path: '/investment'
})

export default function InvestmentPage() {
  return (
    <main>
      <section className="border-b border-white/10 py-20 md:py-28">
        <div className="container">
          <SectionHeading eyebrow="Investment & property" title="Future-oriented capital strategy for industrial and real estate opportunities." description="TRANDAO evaluates growth platforms where technology, infrastructure, operations, and property value can reinforce one another." />
        </div>
      </section>
      <section className="py-20">
        <div className="container grid gap-4 md:grid-cols-3">
          {['M&A Strategy', 'Real Estate Platforms', 'Property Management Technology'].map((item) => (
            <div key={item} className="border border-white/10 bg-[#0b111c] p-8">
              <h2 className="font-[var(--font-plex)] text-2xl font-semibold text-white">{item}</h2>
              <p className="mt-5 leading-8 text-slate-400">Disciplined initiatives aligned with durable demand, technology enablement, and operational leverage.</p>
            </div>
          ))}
        </div>
      </section>
      <CTASection />
    </main>
  )
}
