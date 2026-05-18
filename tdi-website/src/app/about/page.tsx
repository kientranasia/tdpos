import { CTASection } from '@/components/CTASection'
import { SectionHeading } from '@/components/SectionHeading'
import { createMetadata } from '@/lib/site'

export const metadata = createMetadata({
  title: 'About',
  description: 'TRANDAO Investment is an Industrial Technology Investment Group focused on AI, infrastructure, property, and trade.',
  path: '/about'
})

export default function AboutPage() {
  return (
    <main>
      <section className="border-b border-white/10 py-20 md:py-28">
        <div className="container max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#b99a5f]">About TRANDAO</p>
          <h1 className="mt-6 font-[var(--font-plex)] text-5xl font-semibold text-white md:text-7xl">Industrial technology, capital discipline, and operating execution.</h1>
          <p className="mt-8 max-w-3xl text-lg leading-8 text-slate-300">
            TRANDAO Investment develops and invests in technology-enabled industrial capabilities across AI safety, business automation, infrastructure, property operations, and import/export channels.
          </p>
        </div>
      </section>
      <section className="py-20">
        <div className="container grid gap-10 lg:grid-cols-3">
          {['Enterprise AI', 'Industrial Infrastructure', 'Strategic Investment'].map((item) => (
            <div key={item} className="border border-white/10 bg-[#0b111c] p-8">
              <h2 className="font-[var(--font-plex)] text-2xl font-semibold text-white">{item}</h2>
              <p className="mt-5 leading-8 text-slate-400">A focused capability area designed to convert market opportunity into durable enterprise value.</p>
            </div>
          ))}
        </div>
      </section>
      <section className="border-y border-white/10 bg-[#101826]/70 py-20">
        <div className="container">
          <SectionHeading eyebrow="Operating thesis" title="Modern industrial companies need intelligence, infrastructure, and execution in the same room." description="TRANDAO is structured to support that need through software, AI monitoring, site systems, business process design, and strategic growth initiatives." />
        </div>
      </section>
      <CTASection />
    </main>
  )
}
