import { IndustryCard } from '@/components/Cards'
import { CTASection } from '@/components/CTASection'
import { SectionHeading } from '@/components/SectionHeading'
import { industries } from '@/lib/content'
import { createMetadata, seoKeywords } from '@/lib/site'

export const metadata = createMetadata({
  title: 'Industries',
  description: 'AI, automation, and infrastructure solutions for construction, manufacturing, oil and gas, industrial parks, and real estate.',
  path: '/industries',
  keywords: seoKeywords
})

export default function IndustriesPage() {
  return (
    <main>
      <section className="border-b border-white/10 py-20 md:py-28">
        <div className="container">
          <SectionHeading eyebrow="Industries" title="Enterprise solutions for asset-heavy, execution-critical industries." description="TRANDAO focuses on sectors where safety, productivity, visibility, and infrastructure quality directly affect enterprise value." />
        </div>
      </section>
      <section className="py-20">
        <div className="container grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {industries.map((industry) => <IndustryCard key={industry} name={industry} />)}
        </div>
      </section>
      <CTASection />
    </main>
  )
}
