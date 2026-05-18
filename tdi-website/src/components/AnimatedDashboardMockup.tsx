'use client'

import { motion } from 'framer-motion'
import { AlertTriangle, Camera, HardHat, RadioTower } from 'lucide-react'

export function AnimatedDashboardMockup() {
  return (
    <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15 }} className="relative mx-auto w-full max-w-2xl border border-white/10 bg-[#0b111c]/92 p-4 shadow-2xl shadow-black/40">
      <div className="industrial-grid absolute inset-0 opacity-40" />
      <div className="relative border border-white/10 bg-[#050912]/80 p-4">
        <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#b99a5f]">AI Command Center</p>
            <p className="mt-1 text-sm text-slate-400">Construction site analytics · Live</p>
          </div>
          <motion.span animate={{ opacity: [0.45, 1, 0.45] }} transition={{ duration: 2, repeat: Infinity }} className="h-2.5 w-2.5 rounded-full bg-[#3da9ff] shadow-[0_0_20px_rgba(61,169,255,0.8)]" />
        </div>
        <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
          <div className="min-h-72 border border-white/10 bg-[#101826]/80 p-4">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Zone A-03</span>
              <span>Camera 12</span>
            </div>
            <div className="relative mt-4 h-56 overflow-hidden border border-[#3da9ff]/20 bg-[#07111f]">
              <div className="industrial-grid absolute inset-0 opacity-50" />
              {[18, 44, 70].map((left, index) => (
                <motion.div key={left} animate={{ y: [0, index % 2 ? 10 : -8, 0] }} transition={{ duration: 3 + index, repeat: Infinity }} className="absolute bottom-10 h-24 w-12 border border-[#3da9ff]/50 bg-[#3da9ff]/10" style={{ left: `${left}%` }}>
                  <HardHat className="mx-auto mt-3 h-5 w-5 text-[#f3d59b]" />
                </motion.div>
              ))}
              <motion.div animate={{ x: ['-10%', '88%', '-10%'] }} transition={{ duration: 9, repeat: Infinity, ease: 'linear' }} className="absolute bottom-4 h-8 w-28 border border-[#b99a5f]/70 bg-[#b99a5f]/10" />
              <motion.div animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 1.6, repeat: Infinity }} className="absolute right-8 top-10 border border-red-400/70 bg-red-500/15 px-3 py-2 text-xs text-red-100">
                Restricted zone
              </motion.div>
            </div>
          </div>
          <div className="grid gap-4">
            <Metric icon={Camera} label="Active cameras" value="128" />
            <Metric icon={AlertTriangle} label="Open incidents" value="07" alert />
            <Metric icon={RadioTower} label="Sites monitored" value="12" />
            <div className="border border-white/10 bg-[#101826]/80 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Safety score</p>
              <div className="mt-4 h-2 bg-white/10">
                <motion.div initial={{ width: '28%' }} animate={{ width: '86%' }} transition={{ duration: 1.4, delay: 0.4 }} className="h-full bg-[#3da9ff]" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-white">86.4%</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function Metric({ icon: Icon, label, value, alert }: { icon: typeof Camera; label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex items-center justify-between border border-white/10 bg-[#101826]/80 p-4">
      <div className="flex items-center gap-3">
        <Icon className={alert ? 'h-5 w-5 text-red-300' : 'h-5 w-5 text-[#3da9ff]'} />
        <span className="text-sm text-slate-400">{label}</span>
      </div>
      <span className="font-[var(--font-plex)] text-2xl font-semibold text-white">{value}</span>
    </div>
  )
}
