# Gallery

A standalone photo gallery application cloned from the website project.

## About

This is a SolidJS-based photo gallery that displays a collection of photos with interactive features including:
- Responsive photo grid layout
- Lightbox viewer with zoom functionality
- EXIF data extraction and display
- Touch-friendly carousel navigation
- URL-based image sharing
- Multiple gallery collections (all photos and airshow)

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Apply schema changes after pulling a version that updates `src/db/schema.ts`:

```bash
npm run db:push
```

Backfill hashes for photos uploaded before content-based deduplication. Run the
read-only preview first, then apply the reviewed plan:

```bash
npm run backfill:hashes
npm run backfill:hashes -- --apply
```

Duplicate database rows are consolidated, but this command never deletes R2
objects.

Build for production:

```bash
npm run build
```

Start production server:

```bash
npm start
```

## Collection cache

Collection pages use one private Cloudflare Durable Object per collection as a
persistent JSON snapshot cache. Neon remains the source of truth. All app
mutations mark the affected objects dirty before changing Neon, and the final
overlapping mutation rebuilds the snapshot. The collection API exposes the
result in its `X-Collection-Cache` response header (`HIT`, `MISS`, `BYPASS`, or
`UNAVAILABLE`).

Production is deployed as one Cloudflare Worker containing the SolidStart app,
static assets, API routes, and the collection Durable Object. The regular
`npm run dev` server still uses Neon directly; `npm run preview` builds and runs
the complete Worker locally.

Deploy the unified Worker manually with:

```bash
npm run deploy
```

The Worker requires the same runtime secrets as the former Pages project:
`DATABASE_URL`, `API_KEY`, `ENCRYPTED_API_KEY`, `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME`.

For automatic deployments, connect `hunterchen7/gallery` to
`hunter-gallery-worker` in Cloudflare Workers Builds with these settings:

- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Non-production deploy command: `npx wrangler versions upload`

Keep the old `hunter-gallery` Pages project until the Worker has been verified
and both gallery custom domains have been moved. It provides a quick rollback
during the migration.

## Structure

- `src/routes/index.tsx` - Main gallery page (index route)
- `src/routes/airshow.tsx` - Airshow gallery page
- `src/components/photos/` - Gallery components (Gallery, Photo, Carousel, Lightbox)
- `src/components/photos/lightbox/` - Lightbox sub-components
- `src/constants/photos.ts` - Photo manifest data (all photos)
- `src/constants/airshow.ts` - Airshow photo manifest data
- `src/utils/` - Utility functions (shuffle, date formatting, EXIF extraction)
- `src/types/` - TypeScript type definitions

## Dependencies

This project uses:
- SolidJS for reactive UI
- @solidjs/start for SSR and routing
- Tailwind CSS for styling
- ExifReader for photo metadata extraction
- Lucide Solid for icons
