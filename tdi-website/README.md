# TRANDAO Investment Corporate Website

Premium corporate website and CMS backend for TRANDAO Investment, an Industrial Technology Investment Group focused on AI safety monitoring, digital transformation, industrial infrastructure, investment/property initiatives, and import/export operations.

## Stack

- Next.js App Router with TypeScript
- Tailwind CSS
- Framer Motion
- Payload CMS admin at `/admin`
- PostgreSQL via Payload Postgres adapter
- Lexical rich text editor for blog content
- SEO metadata, Open Graph, canonical URLs, and responsive dark corporate UI

## 1. Install Dependencies

```bash
npm install
```

## 2. Setup `.env`

Copy `.env.example` to `.env` and update the values:

```bash
cp .env.example .env
```

Required variables:

```bash
DATABASE_URI=postgres://postgres:postgres@localhost:5432/trandao_investment
PAYLOAD_SECRET=replace-with-a-long-random-secret
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_COMPANY_EMAIL=contact@trandaoinvestment.com
```

Create the PostgreSQL database before starting the app:

```bash
createdb trandao_investment
```

## 3. Run Development Server

```bash
npm run dev
```

Open:

- Website: `http://localhost:3000`
- CMS Admin: `http://localhost:3000/admin`

## 4. Access CMS Admin

Payload CMS is mounted at `/admin`. The admin area is protected by Payload authentication through the `Users` collection.

## 5. Create First Admin User

Start the development server and visit:

```text
http://localhost:3000/admin
```

On first run, Payload will prompt you to create the initial admin user. Use a secure email and password. After login, you can create and edit:

- Blog posts
- Categories
- Authors
- Case studies
- Services
- Products
- Contact submissions
- Media

Blog posts support `draft` and `published` status. The public blog only displays published posts.

## 6. Deploy Notes

### Vercel

1. Provision a managed PostgreSQL database.
2. Set `DATABASE_URI`, `PAYLOAD_SECRET`, `NEXT_PUBLIC_SITE_URL`, and `NEXT_PUBLIC_COMPANY_EMAIL` in Vercel environment variables.
3. Deploy the Next.js app normally.
4. For production media, connect durable object storage such as S3-compatible storage before launch.

### VPS

1. Install Node.js LTS and PostgreSQL.
2. Create a production database and `.env`.
3. Run `npm install`, `npm run build`, and `npm run start`.
4. Put the app behind Nginx or Caddy with HTTPS.
5. Configure a persistent upload storage strategy and regular PostgreSQL backups.

## Content Model

The CMS includes collections for:

- `BlogPosts`: title, slug, excerpt, cover image, rich text content, author, category, tags, published date, status, SEO fields, featured flag.
- `Categories`: name, slug, description.
- `Authors`: name, role, avatar, bio.
- `CaseStudies`: challenge, solution, result, rich content, published flag.
- `Services`: division, descriptions, features, icon, order.
- `Products`: features, use cases, CTA, cover image.
- `ContactSubmissions`: contact form leads with workflow status.

## Key Pages

- `/`
- `/about`
- `/solutions/industrial-ai-safety`
- `/industries`
- `/products`
- `/investment`
- `/infrastructure`
- `/import-export`
- `/blog`
- `/blog/[slug]`
- `/contact`
- `/admin`
