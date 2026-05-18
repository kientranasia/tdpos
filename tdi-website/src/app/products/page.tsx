import { ProductCard } from '@/components/Cards'
import { CTASection } from '@/components/CTASection'
import { SectionHeading } from '@/components/SectionHeading'
import { products } from '@/lib/content'
import { createMetadata, seoKeywords } from '@/lib/site'

export const metadata = createMetadata({
  title: 'Products',
  description: 'TDPos, CRM, ERP, and AI Monitoring Platform products for SMEs and industrial enterprises.',
  path: '/products',
  keywords: seoKeywords
})

export default function ProductsPage() {
  return (
    <main>
      <section className="border-b border-white/10 py-20 md:py-28">
        <div className="container">
          <SectionHeading eyebrow="Products" title="Operational software and AI platforms for modern enterprises." description="TRANDAO products support daily execution, customer operations, financial workflows, and industrial site intelligence." />
        </div>
      </section>
      <section className="py-20">
        <div className="container grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => <ProductCard key={product.title} {...product} />)}
        </div>
      </section>
      <CTASection />
    </main>
  )
}
