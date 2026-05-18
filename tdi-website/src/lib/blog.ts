import { getPayloadClient, safePayload } from '@/lib/payload'

export type BlogPostSummary = {
  id: string
  title: string
  slug: string
  excerpt: string
  category: string
  author: string
  publishedDate: string
  featured?: boolean
}

export const fallbackPosts: BlogPostSummary[] = [
  {
    id: '1',
    title: 'How Industrial AI Safety Changes Construction Risk Management',
    slug: 'industrial-ai-safety-construction-risk',
    excerpt: 'A practical look at how computer vision, incident workflows, and site dashboards reduce preventable risk.',
    category: 'Industrial AI',
    author: 'TRANDAO Strategy Office',
    publishedDate: '2026-05-01',
    featured: true
  },
  {
    id: '2',
    title: 'Digital Transformation Vietnam: From Automation To Operating Intelligence',
    slug: 'digital-transformation-vietnam-operating-intelligence',
    excerpt: 'Why durable transformation starts with process clarity before AI and enterprise software scale.',
    category: 'Digital Transformation',
    author: 'TRANDAO Technology',
    publishedDate: '2026-04-18'
  },
  {
    id: '3',
    title: 'The Case For Industrial Park Operating Systems',
    slug: 'industrial-park-operating-systems',
    excerpt: 'Industrial parks need shared digital infrastructure for utilities, tenants, safety, and executive control.',
    category: 'Infrastructure',
    author: 'TRANDAO Infrastructure',
    publishedDate: '2026-03-28'
  }
]

function hasDatabase() {
  return Boolean(process.env.DATABASE_URI)
}

function relationName(value: unknown, fallback: string) {
  if (value && typeof value === 'object' && 'name' in value && typeof value.name === 'string') return value.name
  return fallback
}

export async function getBlogPosts() {
  if (!hasDatabase()) return fallbackPosts

  return safePayload(async () => {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'blog-posts',
      where: { status: { equals: 'published' } },
      sort: '-publishedDate',
      depth: 1,
      limit: 20
    })

    return result.docs.map((post: any) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      category: relationName(post.category, 'Insights'),
      author: relationName(post.author, 'TRANDAO Investment'),
      publishedDate: post.publishedDate,
      featured: post.featured
    })) as BlogPostSummary[]
  }, fallbackPosts)
}

export async function getBlogPost(slug: string) {
  if (!hasDatabase()) return null

  return safePayload(async () => {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'blog-posts',
      where: {
        and: [
          { slug: { equals: slug } },
          { status: { equals: 'published' } }
        ]
      },
      depth: 2,
      limit: 1
    })
    return result.docs[0] || null
  }, null)
}
