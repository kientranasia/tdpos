'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { BlogCard } from '@/components/BlogCard'
import type { BlogPostSummary } from '@/lib/blog'

export function BlogFilters({ posts }: { posts: BlogPostSummary[] }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const categories = ['All', ...Array.from(new Set(posts.map((post) => post.category)))]
  const filtered = useMemo(() => posts.filter((post) => {
    const matchesQuery = `${post.title} ${post.excerpt}`.toLowerCase().includes(query.toLowerCase())
    const matchesCategory = category === 'All' || post.category === category
    return matchesQuery && matchesCategory
  }), [posts, query, category])

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <label className="flex items-center gap-3 border border-white/10 bg-[#0b111c] px-4 py-3">
          <Search className="h-5 w-5 text-slate-500" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search insights" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
        </label>
        <div className="flex flex-wrap gap-2">
          {categories.map((item) => (
            <button key={item} onClick={() => setCategory(item)} className={item === category ? 'border border-[#b99a5f] bg-[#b99a5f] px-4 py-3 text-xs font-semibold text-[#050912]' : 'border border-white/10 px-4 py-3 text-xs font-semibold text-slate-300 hover:border-white/25'}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((post) => <BlogCard key={post.id} post={post} />)}
      </div>
    </div>
  )
}
