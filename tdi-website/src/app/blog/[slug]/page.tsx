import { notFound } from 'next/navigation'
import { BlogCard } from '@/components/BlogCard'
import { RichText } from '@/components/RichText'
import { fallbackPosts, getBlogPost, getBlogPosts } from '@/lib/blog'
import { createMetadata } from '@/lib/site'

export async function generateStaticParams() {
  const posts = await getBlogPosts()
  return posts.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const fallback = fallbackPosts.find((post) => post.slug === slug)
  const post: any = await getBlogPost(slug)
  const title = post?.seoTitle || post?.title || fallback?.title
  const description = post?.seoDescription || post?.excerpt || fallback?.excerpt
  if (!title || !description) return {}
  return createMetadata({ title, description, path: `/blog/${slug}` })
}

export default async function BlogDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const cmsPost: any = await getBlogPost(slug)
  const fallback = fallbackPosts.find((post) => post.slug === slug)
  const allPosts = await getBlogPosts()
  const related = allPosts.filter((post) => post.slug !== slug).slice(0, 3)
  const post = cmsPost || fallback

  if (!post) notFound()

  const author = typeof post.author === 'object' ? post.author?.name : post.author
  const category = typeof post.category === 'object' ? post.category?.name : post.category

  return (
    <main>
      <article>
        <header className="border-b border-white/10 py-20 md:py-28">
          <div className="container max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#b99a5f]">{category}</p>
            <h1 className="mt-6 font-[var(--font-plex)] text-4xl font-semibold leading-tight text-white md:text-6xl">{post.title}</h1>
            <p className="mt-6 text-lg leading-8 text-slate-300">{post.excerpt}</p>
            <div className="mt-8 flex flex-wrap gap-4 text-sm text-slate-500">
              <span>{author}</span>
              <time>{new Date(post.publishedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</time>
            </div>
          </div>
        </header>
        <section className="py-16">
          <div className="container max-w-3xl">
            <RichText content={cmsPost?.content} fallback={
              <>
                <p>Industrial companies are moving from retrospective safety reporting to live operational intelligence. AI safety monitoring turns camera infrastructure into a measurable control layer for risk, productivity, and leadership visibility.</p>
                <h2>From compliance evidence to real-time intervention</h2>
                <p>Computer vision can identify PPE compliance, restricted-area movement, worker and vehicle proximity, smoke, fire, falls, and unsafe behavior. The value is strongest when alerts connect directly to incident reporting and management workflows.</p>
                <h2>Why it matters in Vietnam</h2>
                <p>Construction, manufacturing, oil and gas, and industrial parks are scaling rapidly. TRANDAO focuses on systems that help operators grow without accepting unnecessary operational blind spots.</p>
              </>
            } />
          </div>
        </section>
      </article>
      <section className="border-t border-white/10 py-20">
        <div className="container">
          <h2 className="font-[var(--font-plex)] text-3xl font-semibold text-white">Related posts</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {related.map((item) => <BlogCard key={item.id} post={item} />)}
          </div>
        </div>
      </section>
    </main>
  )
}
