'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ChevronDown, Menu, X } from 'lucide-react'

const nav = [
  { label: 'Home', href: '/' },
  {
    label: 'Solutions',
    href: '/solutions/industrial-ai-safety',
    items: [
      ['AI & Digital Transformation', '/solutions/industrial-ai-safety'],
      ['Industrial AI Safety', '/solutions/industrial-ai-safety'],
      ['Business Automation', '/solutions/industrial-ai-safety#automation'],
      ['SME Software', '/products']
    ]
  },
  {
    label: 'Industries',
    href: '/industries',
    items: [
      ['Construction', '/industries#construction'],
      ['Manufacturing', '/industries#manufacturing'],
      ['Oil & Gas', '/industries#oil-gas'],
      ['Industrial Parks', '/industries#industrial-parks'],
      ['Real Estate', '/industries#real-estate']
    ]
  },
  {
    label: 'Products',
    href: '/products',
    items: [
      ['TDPos', '/products#tdpos'],
      ['CRM', '/products#crm'],
      ['ERP', '/products#erp'],
      ['AI Monitoring Platform', '/products#ai-monitoring-platform']
    ]
  },
  { label: 'Investment', href: '/investment' },
  { label: 'Blog', href: '/blog' },
  { label: 'Contact', href: '/contact' }
]

export function Header() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#050912]/86 backdrop-blur-xl">
      <div className="container flex h-20 items-center justify-between">
        <Link href="/" className="flex items-center gap-3" aria-label="TRANDAO Investment home">
          <span className="grid h-10 w-10 place-items-center border border-[#b99a5f]/50 bg-white/[0.03] font-[var(--font-plex)] text-lg font-bold text-[#b99a5f]">T</span>
          <span>
            <span className="block font-[var(--font-plex)] text-sm font-semibold uppercase tracking-[0.22em] text-white">TRANDAO</span>
            <span className="block text-xs uppercase tracking-[0.18em] text-[#8b97a8]">Investment Group</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {nav.map((item) => (
            <div key={item.label} className="group relative">
              <Link href={item.href} className="flex items-center gap-1 px-3 py-2 text-sm text-slate-300 transition hover:text-white">
                {item.label}
                {item.items ? <ChevronDown size={14} /> : null}
              </Link>
              {item.items ? (
                <div className="invisible absolute left-0 top-full w-72 translate-y-3 border border-white/10 bg-[#0b111c]/96 p-2 opacity-0 shadow-2xl shadow-black/40 backdrop-blur-xl transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                  {item.items.map(([label, href]) => (
                    <Link key={label} href={href} className="block border-b border-white/5 px-3 py-3 text-sm text-slate-300 last:border-0 hover:bg-white/[0.04] hover:text-white">
                      {label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </nav>

        <Link href="/contact" className="hidden border border-[#b99a5f]/45 px-4 py-2 text-sm font-medium text-[#f3d59b] transition hover:bg-[#b99a5f]/10 lg:block">
          Book Consultation
        </Link>

        <button className="grid h-10 w-10 place-items-center border border-white/10 lg:hidden" onClick={() => setOpen((value) => !value)} aria-label="Toggle menu">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open ? (
        <div className="border-t border-white/10 bg-[#050912] px-4 py-4 lg:hidden">
          {nav.map((item) => (
            <Link key={item.label} href={item.href} onClick={() => setOpen(false)} className="block border-b border-white/10 py-3 text-sm text-slate-200">
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </header>
  )
}
