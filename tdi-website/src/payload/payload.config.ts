import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import path from 'path'
import { Authors } from '@/payload/collections/Authors'
import { BlogPosts } from '@/payload/collections/BlogPosts'
import { CaseStudies } from '@/payload/collections/CaseStudies'
import { Categories } from '@/payload/collections/Categories'
import { ContactSubmissions } from '@/payload/collections/ContactSubmissions'
import { Media } from '@/payload/collections/Media'
import { Products } from '@/payload/collections/Products'
import { Services } from '@/payload/collections/Services'
import { Users } from '@/payload/collections/Users'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: '- TRANDAO CMS'
    }
  },
  collections: [
    Users,
    Media,
    BlogPosts,
    Categories,
    Authors,
    CaseStudies,
    Services,
    Products,
    ContactSubmissions
  ],
  editor: lexicalEditor({}),
  secret: process.env.PAYLOAD_SECRET || 'development-secret-change-me',
  typescript: {
    outputFile: path.resolve(dirname, '../types/payload-types.ts')
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI
    }
  }),
  graphQL: {
    schemaOutputFile: path.resolve(dirname, '../types/generated-schema.graphql')
  }
})
