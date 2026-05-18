import type { CollectionConfig } from 'payload'

export const Services: CollectionConfig = {
  slug: 'services',
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
    {
      name: 'division',
      type: 'select',
      required: true,
      options: ['Technology', 'Industrial Infrastructure', 'Investment & Property', 'Import / Export']
    },
    { name: 'shortDescription', type: 'textarea', required: true },
    { name: 'fullDescription', type: 'richText' },
    { name: 'features', type: 'array', fields: [{ name: 'feature', type: 'text' }] },
    { name: 'icon', type: 'text' },
    { name: 'order', type: 'number', defaultValue: 0 }
  ]
}
