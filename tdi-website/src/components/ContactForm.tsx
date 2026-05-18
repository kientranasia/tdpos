'use client'

import { useState } from 'react'

const interests = ['AI Safety Monitoring', 'Digital Transformation', 'Business Automation', 'TDPos / CRM / ERP', 'Industrial Infrastructure', 'Investment / Property', 'Import Export']

export function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  async function submit(formData: FormData) {
    setStatus('loading')
    const response = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(formData))
    })
    setStatus(response.ok ? 'success' : 'error')
  }

  return (
    <form action={submit} className="grid gap-4 border border-white/10 bg-[#0b111c] p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Field name="name" label="Name" required />
        <Field name="email" label="Email" type="email" required />
        <Field name="phone" label="Phone" />
        <Field name="company" label="Company" />
      </div>
      <label className="grid gap-2 text-sm text-slate-300">
        Service interest
        <select name="serviceInterest" className="border border-white/10 bg-[#050912] px-4 py-3 text-white outline-none focus:border-[#3da9ff]">
          {interests.map((interest) => <option key={interest}>{interest}</option>)}
        </select>
      </label>
      <label className="grid gap-2 text-sm text-slate-300">
        Message
        <textarea name="message" rows={5} required className="resize-none border border-white/10 bg-[#050912] px-4 py-3 text-white outline-none focus:border-[#3da9ff]" />
      </label>
      <button disabled={status === 'loading'} className="bg-[#b99a5f] px-6 py-4 text-sm font-semibold text-[#050912] transition hover:bg-[#d3b77a] disabled:opacity-60">
        {status === 'loading' ? 'Submitting...' : 'Request Consultation'}
      </button>
      {status === 'success' ? <p className="text-sm text-[#9fe7bd]">Thank you. Your request has been received.</p> : null}
      {status === 'error' ? <p className="text-sm text-red-300">Something went wrong. Please email us directly.</p> : null}
    </form>
  )
}

function Field({ name, label, type = 'text', required }: { name: string; label: string; type?: string; required?: boolean }) {
  return (
    <label className="grid gap-2 text-sm text-slate-300">
      {label}
      <input name={name} type={type} required={required} className="border border-white/10 bg-[#050912] px-4 py-3 text-white outline-none focus:border-[#3da9ff]" />
    </label>
  )
}
