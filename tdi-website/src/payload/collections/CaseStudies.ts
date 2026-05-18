import type { CollectionConfig } from 'payload'

export const CaseStudies: CollectionConfig = {
  slug: 'case-studies',
  admin: { useAsTitle: 'title' },
  access: {
    read: () => true,
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user)
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true },
    { name: 'industry', type: 'text', required: true },
    { name: 'challenge', type: 'textarea', required: true },
    { name: 'solution', type: 'textarea', required: true },
    { name: 'result', type: 'textarea', required: true },
    { name: 'coverImage', type: 'upload', relationTo: 'media' },
    { name: 'content', type: 'richText' },
    { name: 'published', type: 'checkbox', defaultValue: false }
  ]
}
