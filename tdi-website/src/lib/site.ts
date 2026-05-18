import type { Metadata } from 'next'

export const siteConfig = {
  name: 'TRANDAO Investment',
  url: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  email: process.env.NEXT_PUBLIC_COMPANY_EMAIL || 'contact@trandaoinvestment.com',
  phone: '+84 900 000 000',
  description: 'Industrial Technology Investment Group delivering AI, infrastructure, automation, and strategic investment capabilities.'
}

export function createMetadata({
  title,
  description,
  path = '/',
  keywords = []
}: {
  title: string
  description: string
  path?: string
  keywords?: string[]
}): Metadata {
  const url = new URL(path, siteConfig.url).toString()

  return {
    title,
    description,
    keywords,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: siteConfig.name,
      images: ['/og/trandao-og.svg'],
      type: 'website'
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og/trandao-og.svg']
    }
  }
}

export const seoKeywords = [
  'AI safety monitoring Vietnam',
  'Industrial AI Vietnam',
  'Construction AI solution',
  'Digital transformation Vietnam',
  'SME POS Vietnam',
  'Business automation Vietnam',
  'Industrial infrastructure Vietnam',
  'Property management technology'
]
