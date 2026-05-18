import Link from 'next/link'
import { AnimatedDashboardMockup } from '@/components/AnimatedDashboardMockup'
import { BlogCard } from '@/components/BlogCard'
import { DivisionCard, IndustryCard, ProductCard, SolutionCard } from '@/components/Cards'
import { CTASection } from '@/components/CTASection'
import { MotionDiv, MotionSection } from '@/components/Motion'
import { SectionHeading } from '@/components/SectionHeading'
import { divisions, ecosystem, industries, products, solutionCards, why } from '@/lib/content'
import { getBlogPosts } from '@/lib/blog'
import { createMetadata, seoKeywords } from '@/lib/site'

export const metadata = createMetadata({
  title: 'AI, Infrastructure & Investment For Modern Enterprises',
  description: 'TRANDAO Investment delivers AI solutions, industrial infrastructure, business automation, and strategic investment services for enterprises across Vietnam and Southeast Asia.',
  keywords: seoKeywords
})

export default async function HomePage() {
  const posts = (await getBlogPosts()).slice(0, 3)

  return (
    <main>
      <section className="noise relative overflow-hidden border-b border-white/10 py-20 md:py-28">
        <div className="industrial-grid absolute inset-0 opacity-25" />
        <div className="container relative grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <MotionDiv initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#b99a5f]">Industrial Technology Investment Group</p>
            <h1 className="mt-6 font-[var(--font-plex)] text-5xl font-semibold leading-[1.02] text-white text-balance md:text-7xl">
              AI, Infrastructure & Investment For Modern Enterprises
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">
              TRANDAO Investment delivers AI solutions, industrial infrastructure, business automation, and strategic investment services for enterprises across Vietnam and Southeast Asia.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/solutions/industrial-ai-safety" className="bg-[#b99a5f] px-6 py-4 text-center text-sm font-semibold text-[#050912] hover:bg-[#d3b77a]">Explore Solutions</Link>
              <Link href="/contact" className="border border-white/15 px-6 py-4 text-center text-sm font-semibold text-white hover:border-[#3da9ff]/60">Book Consultation</Link>
            </div>
          </MotionDiv>
          <AnimatedDashboardMockup />
        </div>
      </section>

      <section className="py-20">
        <div className="container">
          <SectionHeading eyebrow="Core divisions" title="A diversified operating platform for industrial transformation." description="TRANDAO connects technology execution with infrastructure, investment, property, and trade capabilities." />
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {divisions.map((division) => <DivisionCard key={division.title} {...division} />)}
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#0b111c]/70 py-20">
        <div className="container grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <SectionHeading eyebrow="Featured solution" title="AI Safety Monitoring for high-risk industrial environments." description="Computer vision monitors live camera feeds, identifies hazards, escalates incidents, and gives executives multi-site safety visibility." />
          <div className="grid gap-4 md:grid-cols-2">
            {solutionCards.slice(1, 5).map((solution) => <SolutionCard key={solution.title} {...solution} />)}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container">
          <SectionHeading eyebrow="Construction & real estate intelligence" title="A connected ecosystem for site safety, progress, assets, and property operations." align="center" />
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {ecosystem.map((item) => <SolutionCard key={item.title} {...item} />)}
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#05070d] py-20">
        <div className="container">
          <SectionHeading eyebrow="Products" title="Software products for operational control." description="A product portfolio spanning SME software, enterprise operations, and industrial AI monitoring." />
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {products.map((product) => <ProductCard key={product.title} {...product} />)}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeading eyebrow="Industries served" title="Built for environments where uptime, risk, and execution matter." />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {industries.map((industry) => <IndustryCard key={industry} name={industry} />)}
          </div>
        </div>
      </section>

      <MotionSection initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="border-y border-white/10 bg-[#101826]/65 py-20">
        <div className="container grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeading eyebrow="Why TRANDAO" title="Strategic discipline with practical industrial execution." />
          <div className="grid gap-4 md:grid-cols-2">
            {why.map((item) => (
              <div key={item} className="border border-white/10 bg-white/[0.035] p-6 text-base leading-8 text-slate-300">{item}</div>
            ))}
          </div>
        </div>
      </MotionSection>

      <section className="py-20">
        <div className="container">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <SectionHeading eyebrow="Latest insights" title="Industrial AI, infrastructure, and transformation thinking." />
            <Link href="/blog" className="text-sm font-semibold text-[#f3d59b]">View all posts</Link>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {posts.map((post) => <BlogCard key={post.id} post={post} />)}
          </div>
        </div>
      </section>

      <CTASection />
    </main>
  )
}
