import { CTASection } from '@/components/CTASection'
import { SectionHeading } from '@/components/SectionHeading'
import { createMetadata, seoKeywords } from '@/lib/site'

export const metadata = createMetadata({
  title: 'Industrial Infrastructure',
  description: 'Infrastructure setup and systems planning for industrial parks, factories, and production environments in Vietnam.',
  path: '/infrastructure',
  keywords: seoKeywords
})

export default function InfrastructurePage() {
  return (
    <main>
      <section className="border-b border-white/10 py-20 md:py-28">
        <div className="container">
          <SectionHeading eyebrow="Industrial infrastructure" title="Infrastructure systems for factories, industrial parks, and high-performance operations." description="TRANDAO supports infrastructure planning and setup for facilities that require reliability, visibility, and scalable operating foundations." />
        </div>
      </section>
      <section className="py-20">
        <div className="container grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {['Factory Systems', 'Industrial Park Utilities', 'Site Operations', 'Digital Infrastructure'].map((item) => (
            <div key={item} className="border border-white/10 bg-[#0b111c] p-7">
              <h2 className="font-[var(--font-plex)] text-xl font-semibold text-white">{item}</h2>
              <p className="mt-4 text-sm leading-7 text-slate-400">Planning and coordination for infrastructure that enables safer, cleaner, and more measurable operations.</p>
            </div>
          ))}
        </div>
      </section>
      <CTASection />
    </main>
  )
}
