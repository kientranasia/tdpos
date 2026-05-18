import { ContactForm } from '@/components/ContactForm'
import { SectionHeading } from '@/components/SectionHeading'
import { siteConfig, createMetadata } from '@/lib/site'

export const metadata = createMetadata({
  title: 'Contact',
  description: 'Contact TRANDAO Investment for AI safety monitoring, digital transformation, industrial infrastructure, investment, and import/export opportunities.',
  path: '/contact'
})

export default function ContactPage() {
  return (
    <main>
      <section className="border-b border-white/10 py-20 md:py-28">
        <div className="container grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <SectionHeading eyebrow="Contact" title="Discuss an AI, infrastructure, or investment initiative." description="Tell us about the business problem, operating environment, or opportunity you want to evaluate. TRANDAO will respond with the right strategic and technical team." />
            <div className="mt-10 border border-white/10 bg-[#0b111c] p-6 text-sm leading-7 text-slate-400">
              <p className="font-semibold text-white">TRANDAO Investment</p>
              <p className="mt-3">{siteConfig.email}</p>
              <p>{siteConfig.phone}</p>
              <p className="mt-3">Vietnam and Southeast Asia</p>
            </div>
          </div>
          <ContactForm />
        </div>
      </section>
    </main>
  )
}
