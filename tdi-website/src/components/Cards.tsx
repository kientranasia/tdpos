import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ArrowUpRight } from 'lucide-react'
import { MotionDiv } from '@/components/Motion'

export function DivisionCard({ title, description, href, icon: Icon }: { title: string; description: string; href: string; icon: LucideIcon }) {
  return (
    <MotionDiv initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.55 }} className="group border border-white/10 bg-white/[0.035] p-6 transition hover:border-[#b99a5f]/45 hover:bg-white/[0.055]">
      <Icon className="h-7 w-7 text-[#b99a5f]" />
      <h3 className="mt-8 font-[var(--font-plex)] text-xl font-semibold text-white">{title}</h3>
      <p className="mt-4 text-sm leading-7 text-slate-400">{description}</p>
      <Link href={href} className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[#f3d59b]">
        Explore division <ArrowUpRight size={16} />
      </Link>
    </MotionDiv>
  )
}

export function SolutionCard({ title, description, icon: Icon }: { title: string; description: string; icon: LucideIcon }) {
  return (
    <MotionDiv initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="border border-white/10 bg-[#0b111c] p-5 transition hover:border-[#3da9ff]/40 hover:shadow-[0_0_40px_rgba(61,169,255,0.08)]">
      <Icon className="h-6 w-6 text-[#3da9ff]" />
      <h3 className="mt-5 font-[var(--font-plex)] text-lg font-semibold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
    </MotionDiv>
  )
}

export function ProductCard({ title, description, href, icon: Icon }: { title: string; description: string; href: string; icon: LucideIcon }) {
  return (
    <Link href={href} className="group block border border-white/10 bg-white/[0.035] p-6 transition hover:-translate-y-1 hover:border-[#b99a5f]/40">
      <div className="flex items-center justify-between">
        <Icon className="h-7 w-7 text-[#b99a5f]" />
        <ArrowUpRight className="h-5 w-5 text-slate-500 transition group-hover:text-white" />
      </div>
      <h3 className="mt-8 font-[var(--font-plex)] text-xl font-semibold text-white">{title}</h3>
      <p className="mt-4 text-sm leading-7 text-slate-400">{description}</p>
    </Link>
  )
}

export function IndustryCard({ name }: { name: string }) {
  return (
    <div className="border border-white/10 bg-[#0b111c]/80 px-5 py-6">
      <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Industry</p>
      <h3 className="mt-3 font-[var(--font-plex)] text-xl font-semibold text-white">{name}</h3>
    </div>
  )
}
