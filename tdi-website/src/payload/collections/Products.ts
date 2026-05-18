import type { CollectionConfig } from 'payload'

export const Products: CollectionConfig = {
  slug: 'products',
  admin: { useAsTitle: 'name' },
  access: {
    read: () => true,
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user)
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true },
    { name: 'shortDescription', type: 'textarea', required: true },
    { name: 'features', type: 'array', fields: [{ name: 'feature', type: 'text' }] },
    { name: 'useCases', type: 'array', fields: [{ name: 'useCase', type: 'text' }] },
    { name: 'CTA', type: 'text', label: 'CTA' },
    { name: 'coverImage', type: 'upload', relationTo: 'media' }
  ]
}
