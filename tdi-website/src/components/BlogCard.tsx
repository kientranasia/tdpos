import Link from 'next/link'
import type { BlogPostSummary } from '@/lib/blog'

export function BlogCard({ post }: { post: BlogPostSummary }) {
  return (
    <Link href={`/blog/${post.slug}`} className="group block border border-white/10 bg-white/[0.035] p-6 transition hover:border-[#3da9ff]/35">
      <div className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.16em] text-slate-500">
        <span>{post.category}</span>
        {post.featured ? <span className="text-[#b99a5f]">Featured</span> : null}
      </div>
      <h3 className="mt-5 font-[var(--font-plex)] text-xl font-semibold leading-8 text-white group-hover:text-[#d8ecff]">{post.title}</h3>
      <p className="mt-4 text-sm leading-7 text-slate-400">{post.excerpt}</p>
      <div className="mt-7 flex items-center justify-between text-xs text-slate-500">
        <span>{post.author}</span>
        <time>{new Date(post.publishedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</time>
      </div>
    </Link>
  )
}
