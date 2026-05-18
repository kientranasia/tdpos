import type { Metadata } from 'next'
import '@/styles/globals.css'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { siteConfig } from '@/lib/site'

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: 'TRANDAO Investment | Industrial Technology Investment Group',
    template: '%s | TRANDAO Investment'
  },
  description: 'AI safety monitoring, digital transformation, industrial infrastructure, and strategic investment services for enterprises across Vietnam and Southeast Asia.',
  openGraph: {
    title: 'TRANDAO Investment',
    description: 'Industrial technology, infrastructure, investment, and import/export capabilities for modern enterprises.',
    url: siteConfig.url,
    siteName: 'TRANDAO Investment',
    images: ['/og/trandao-og.svg'],
    locale: 'en_US',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TRANDAO Investment',
    description: 'AI, infrastructure, and investment for modern enterprises.',
    images: ['/og/trandao-og.svg']
  },
  alternates: {
    canonical: siteConfig.url
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  )
}
