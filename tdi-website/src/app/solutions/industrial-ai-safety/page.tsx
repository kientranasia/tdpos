import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { AnimatedDashboardMockup } from '@/components/AnimatedDashboardMockup'
import { SolutionCard } from '@/components/Cards'
import { CTASection } from '@/components/CTASection'
import { SectionHeading } from '@/components/SectionHeading'
import { ecosystem, safetyFeatures } from '@/lib/content'
import { createMetadata, seoKeywords } from '@/lib/site'

export const metadata = createMetadata({
  title: 'AI Safety Monitoring For High-Risk Industrial Environments',
  description: 'Industrial AI safety monitoring for construction, manufacturing, oil and gas, and industrial parks in Vietnam.',
  path: '/solutions/industrial-ai-safety',
  keywords: seoKeywords
})

export default function AISafetyPage() {
  return (
    <main>
      <section className="relative overflow-hidden border-b border-white/10 py-20 md:py-28">
        <div className="industrial-grid absolute inset-0 opacity-25" />
        <div className="container relative grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#b99a5f]">Industrial AI Safety</p>
            <h1 className="mt-6 font-[var(--font-plex)] text-5xl font-semibold leading-[1.04] text-white text-balance md:text-7xl">
              AI Safety Monitoring For High-Risk Industrial Environments
            </h1>
            <p className="mt-7 text-lg leading-8 text-slate-300">
              TRANDAO deploys computer vision safety intelligence for construction sites, factories, oil and gas facilities, and industrial parks.
            </p>
            <Link href="/contact" className="mt-9 inline-flex bg-[#b99a5f] px-6 py-4 text-sm font-semibold text-[#050912] hover:bg-[#d3b77a]">
              Request AI Safety Demo
            </Link>
          </div>
          <AnimatedDashboardMockup />
        </div>
      </section>

      <section className="py-20">
        <div className="container">
          <SectionHeading eyebrow="Capabilities" title="Real-time monitoring from camera feed to incident workflow." />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {safetyFeatures.map((feature) => (
              <div key={feature} className="border border-white/10 bg-[#0b111c] p-5">
                <ShieldCheck className="h-5 w-5 text-[#3da9ff]" />
                <p className="mt-5 text-sm font-medium leading-6 text-white">{feature}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#0b111c]/70 py-20">
        <div className="container grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeading eyebrow="Industries" title="Designed for sites where risk is operational, financial, and reputational." description="Construction, manufacturing, oil and gas, and industrial park operators can centralize safety data and reduce blind spots across distributed sites." />
          <div className="grid gap-4 md:grid-cols-2">
            {['Construction', 'Manufacturing', 'Oil & Gas', 'Industrial Parks'].map((industry) => (
              <div key={industry} className="border border-white/10 bg-white/[0.035] p-7">
                <h3 className="font-[var(--font-plex)] text-2xl font-semibold text-white">{industry}</h3>
                <p className="mt-4 text-sm leading-7 text-slate-400">Live monitoring, alerts, incident evidence, and executive visibility for high-risk operating areas.</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container">
          <SectionHeading eyebrow="Construction intelligence ecosystem" title="From safety monitoring to AI command center." align="center" />
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {ecosystem.map((item) => <SolutionCard key={item.title} {...item} />)}
          </div>
        </div>
      </section>

      <CTASection cta="Request AI Safety Demo" />
    </main>
  )
}
