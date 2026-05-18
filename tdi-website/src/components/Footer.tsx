import Link from 'next/link'
import { siteConfig } from '@/lib/site'

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#05070d]">
      <div className="container grid gap-10 py-14 lg:grid-cols-[1.3fr_0.7fr_0.7fr_0.7fr]">
        <div>
          <p className="font-[var(--font-plex)] text-xl font-semibold text-white">TRANDAO Investment</p>
          <p className="mt-4 max-w-md text-sm leading-7 text-slate-400">
            Industrial technology investment group delivering AI solutions, infrastructure capability, automation, and strategic market execution across Vietnam and Southeast Asia.
          </p>
        </div>
        <FooterColumn title="Company" links={[['About', '/about'], ['Investment', '/investment'], ['Infrastructure', '/infrastructure'], ['Import Export', '/import-export']]} />
        <FooterColumn title="Technology" links={[['AI Safety', '/solutions/industrial-ai-safety'], ['Products', '/products'], ['Industries', '/industries'], ['Blog', '/blog']]} />
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">Contact</p>
          <p className="mt-4 text-sm text-slate-400">{siteConfig.email}</p>
          <p className="mt-2 text-sm text-slate-400">{siteConfig.phone}</p>
        </div>
      </div>
      <div className="border-t border-white/10 py-5">
        <div className="container flex flex-col gap-2 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
          <span>© {new Date().getFullYear()} TRANDAO Investment. All rights reserved.</span>
          <span>Industrial Technology Investment Group</span>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">{title}</p>
      <div className="mt-4 grid gap-3">
        {links.map(([label, href]) => (
          <Link key={label} href={href} className="text-sm text-slate-400 hover:text-white">
            {label}
          </Link>
        ))}
      </div>
    </div>
  )
}
