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

Build for production:

```bash
npm run build
```

Start production server:

```bash
npm start
```

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
