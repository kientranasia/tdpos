import { BlogCard } from '@/components/BlogCard'
import { BlogFilters } from '@/components/BlogFilters'
import { SectionHeading } from '@/components/SectionHeading'
import { getBlogPosts } from '@/lib/blog'
import { createMetadata, seoKeywords } from '@/lib/site'

export const metadata = createMetadata({
  title: 'Blog',
  description: 'Insights on Industrial AI Vietnam, AI safety monitoring, digital transformation, SME software, infrastructure, and property technology.',
  path: '/blog',
  keywords: seoKeywords
})

export default async function BlogPage() {
  const posts = await getBlogPosts()
  const featured = posts.filter((post) => post.featured)
  const recent = posts.slice(0, 6)

  return (
    <main>
      <section className="border-b border-white/10 py-20 md:py-28">
        <div className="container">
          <SectionHeading eyebrow="Insights" title="Executive thinking on industrial AI, infrastructure, and enterprise transformation." description="Read TRANDAO analysis on safety monitoring, automation, SME software, industrial infrastructure, and property management technology." />
        </div>
      </section>
      <section className="py-20">
        <div className="container">
          {featured.length ? (
            <>
              <SectionHeading eyebrow="Featured posts" title="Strategic reads" />
              <div className="mt-10 grid gap-4 md:grid-cols-2">
                {featured.slice(0, 2).map((post) => <BlogCard key={post.id} post={post} />)}
              </div>
            </>
          ) : null}
          <div className="mt-16">
            <SectionHeading eyebrow="Recent posts" title="Research and market notes" />
            <div className="mt-10">
              <BlogFilters posts={recent} />
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
