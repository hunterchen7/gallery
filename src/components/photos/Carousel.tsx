import { createSignal, createEffect, onCleanup, JSX, For } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { type GalleryPhoto, S3_PREFIX } from "~/types/photo";
import { type ExifData } from "~/types/exif";
import { extractExif } from "~/utils/exif";
import { Lightbox } from "./Lightbox";
import { NavArrow } from "./lightbox/NavArrow";
import { DrawerContent } from "./lightbox/DrawerContent";

export interface CarouselProps {
  photos: readonly GalleryPhoto[];
  initialIndex?: number;
  onClose: () => void;
}

export function Carousel(props: CarouselProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentIndex, setCurrentIndex] = createSignal(props.initialIndex ?? 0);
  const [showNavigation, setShowNavigation] = createSignal(false);
  const [touchStartX, setTouchStartX] = createSignal(0);
  const [touchStartY, setTouchStartY] = createSignal(0);
  const [touchStartTime, setTouchStartTime] = createSignal(0);
  const [dragOffset, setDragOffset] = createSignal(0);
  const [isDragging, setIsDragging] = createSignal(false);
  const [isTransitioning, setIsTransitioning] = createSignal(false);
  const [imageExifs, setImageExifs] = createSignal<Record<string, ExifData>>(
    {},
  );

  // Shared drawer state
  const [drawerOpen, setDrawerOpen] = createSignal(false);

  // Update search params when current index changes
  createEffect(() => {
    const currentPhoto = props.photos[currentIndex()];
    if (currentPhoto) {
      setSearchParams({ image: currentPhoto.url });
    }
  });

  // Helper function to fetch EXIF data for a single photo
  const fetchPhotoExifData = async (
    photo: GalleryPhoto,
    signal: AbortSignal,
  ): Promise<ExifData> => {
    const attemptFetch = async (
      useCache: boolean = true,
    ): Promise<ExifData> => {
      const response = await fetch(`${S3_PREFIX}${photo.url}`, {
        signal,
        cache: useCache ? "default" : "no-cache",
      });

      if (!response.body) {
        throw new Error("ReadableStream not supported");
      }

      const contentLength = response.headers.get("content-length");
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      let loaded = 0;
      let exifExtracted = false;
      let extractedExif: ExifData = {};
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      const EXIF_CHECK_THRESHOLD = 65536; // 64KB - enough for most EXIF data

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (signal.aborted) {
          throw new Error("Request aborted");
        }

        chunks.push(value);
        loaded += value.length;

        // Try to extract EXIF data once we have enough bytes
        if (!exifExtracted && loaded >= EXIF_CHECK_THRESHOLD) {
          try {
            // Create a buffer from chunks received so far
            const partialBuffer = new Uint8Array(loaded);
            let offset = 0;
            for (const chunk of chunks) {
              partialBuffer.set(chunk, offset);
              offset += chunk.length;
            }

            const exif = extractExif(partialBuffer.buffer, total);

            // Only use if we got meaningful EXIF data
            if (Object.keys(exif).length > 1 || exif.camera) {
              extractedExif = exif;
              exifExtracted = true;
              // Cancel the reader to stop fetching more data
              await reader.cancel();
              break;
            }
          } catch (err) {}
        }
      }

      // Final EXIF extraction if not already done or if we want to update with file size
      if (!signal.aborted && (!exifExtracted || total > 0)) {
        const buffer = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
          buffer.set(chunk, offset);
          offset += chunk.length;
        }

        extractedExif = extractExif(buffer.buffer, total);
      }

      return extractedExif;
    };

    try {
      // First attempt with cache
      return await attemptFetch();
    } catch (err) {
      try {
        // Retry without cache if first attempt fails, evades some CORS issues
        return await attemptFetch(false);
      } catch (retryErr) {
        // Both attempts failed, return empty EXIF
        return {};
      }
    }
  };

  // Fetch EXIF data for current and adjacent photos
  createEffect(() => {
    const currentPhoto = props.photos[currentIndex()];
    if (!currentPhoto) return;

    const controller = new AbortController();
    const signal = controller.signal;

    const fetchExifDataForAdjacent = async () => {
      const photosToFetch: GalleryPhoto[] = [];

      // Only fetch for photos that don't already have EXIF data
      if (!imageExifs()[currentPhoto.url]) {
        photosToFetch.push(currentPhoto);
      }

      // Add previous photo if it exists and doesn't have EXIF data
      const prevIndex = currentIndex() - 1;
      if (prevIndex >= 0 && !imageExifs()[props.photos[prevIndex].url]) {
        photosToFetch.push(props.photos[prevIndex]);
      }

      // Add next photo if it exists and doesn't have EXIF data
      const nextIndex = currentIndex() + 1;
      if (
        nextIndex < props.photos.length &&
        !imageExifs()[props.photos[nextIndex].url]
      ) {
        photosToFetch.push(props.photos[nextIndex]);
      }

      // Fetch EXIF data for all photos concurrently
      const fetchPromises = photosToFetch.map(async (photo) => {
        try {
          const exifData = await fetchPhotoExifData(photo, signal);
          // Only return data if we got meaningful EXIF data
          if (Object.keys(exifData).length > 0) {
            return { photo, exifData };
          }
          return null; // Return null if no meaningful EXIF data
        } catch (error) {
          // If fetch fails, return null to skip setting EXIF data
          return null;
        }
      });

      const results = await Promise.allSettled(fetchPromises);

      // Update state with only successfully fetched EXIF data
      const exifUpdates: Record<string, ExifData> = {};
      results.forEach((result) => {
        if (result.status === "fulfilled" && result.value !== null) {
          const { photo, exifData } = result.value;
          exifUpdates[photo.url] = exifData;
        }
      });

      if (Object.keys(exifUpdates).length > 0) {
        setImageExifs((prev) => ({
          ...prev,
          ...exifUpdates,
        }));
      }
    };

    fetchExifDataForAdjacent();

    onCleanup(() => {
      controller.abort();
    });
  });

  const goToPrevious = () => {
    if (isTransitioning() || currentIndex() === 0) return;
    const newIndex = currentIndex() - 1;
    setIsTransitioning(true);
    setCurrentIndex(newIndex);
    setTimeout(() => setIsTransitioning(false), 300);
  };

  const goToNext = () => {
    if (isTransitioning() || currentIndex() === props.photos.length - 1) return;
    const newIndex = currentIndex() + 1;
    setIsTransitioning(true);
    setCurrentIndex(newIndex);
    setTimeout(() => setIsTransitioning(false), 300);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        if (currentIndex() > 0) {
          goToPrevious();
        }
        break;
      case "ArrowRight":
        e.preventDefault();
        if (currentIndex() < props.photos.length - 1) {
          goToNext();
        }
        break;
      case "Escape":
        e.preventDefault();
        props.onClose();
        break;
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    const proximity = 150;
    const x = e.clientX;
    const screenWidth = window.innerWidth;

    setShowNavigation(x <= proximity || x >= screenWidth - proximity);
  };

  const handleTouchStart = (e: TouchEvent) => {
    // Only track single-finger touches to avoid interfering with pinch-zoom
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setTouchStartX(touch.clientX);
      setTouchStartY(touch.clientY);
      setTouchStartTime(Date.now());
      setIsDragging(true); // Start dragging
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging() || touchStartX() === 0) return;

    const touch = e.touches[0];
    let deltaX = touch.clientX - touchStartX();
    const deltaY = touch.clientY - touchStartY();

    // Only allow horizontal dragging
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      e.preventDefault(); // Prevent vertical scroll

      // Add resistance when dragging past the boundaries
      if (
        (currentIndex() === 0 && deltaX > 0) ||
        (currentIndex() === props.photos.length - 1 && deltaX < 0)
      ) {
        deltaX /= 2; // Dampen the drag
      }

      // Clamp the drag offset to one screen width
      const screenWidth = window.innerWidth;
      const clampedDeltaX = Math.max(
        -screenWidth,
        Math.min(deltaX, screenWidth),
      );

      setDragOffset(clampedDeltaX);
    }
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (!isDragging()) return;
    setIsDragging(false);

    const touchDuration = Date.now() - touchStartTime();
    const velocity = Math.abs(dragOffset()) / touchDuration;

    const screenWidth = window.innerWidth;
    // Dynamic threshold: faster swipes require less distance
    const swipeThreshold = Math.max(
      50, // Minimum threshold
      screenWidth / 2 - velocity * 100, // Adjust sensitivity by velocity
    );

    if (Math.abs(dragOffset()) > swipeThreshold) {
      if (dragOffset() > 0 && currentIndex() > 0) {
        goToPrevious();
      } else if (dragOffset() < 0 && currentIndex() < props.photos.length - 1) {
        goToNext();
      }
    }

    // Snap back to the nearest photo
    setDragOffset(0);
  };

  createEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousemove", handleMouseMove);

    onCleanup(() => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousemove", handleMouseMove);
    });
  });

  const getCarouselItemStyle = (index: number): JSX.CSSProperties => {
    const offset = index - currentIndex();
    const totalOffset = offset * 100 + (dragOffset() / window.innerWidth) * 100;

    return {
      transform: `translateX(${totalOffset}%)`,
      transition: isDragging()
        ? "none"
        : "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      position: "absolute",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
    };
  };

  // change this render both the left and the right
  const shouldLoadHighRes = (index: number): boolean => {
    return (
      index === currentIndex() ||
      index === currentIndex() - 1 ||
      index === currentIndex() + 1
    );
  };

  // Get current photo reactively
  const currentPhoto = () => props.photos[currentIndex()];

  return (
    <div
      class="fixed inset-0 z-50 bg-black/95 overflow-hidden"
      onClick={props.onClose}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseLeave={() => setShowNavigation(false)}
    >
      {/* Carousel container */}
      <div class="relative w-full h-full overflow-hidden">
        <For each={props.photos}>
          {(photo, index) => (
            <div style={getCarouselItemStyle(index())}>
              <Lightbox
                photo={() => photo}
                exif={() => imageExifs()[photo.url] || {}}
                setDrawerOpen={setDrawerOpen}
                shouldLoad={() => shouldLoadHighRes(index())}
              />
            </div>
          )}
        </For>
      </div>

      {/* Navigation arrows */}
      <NavArrow
        side="left"
        visible={showNavigation() && currentIndex() > 0}
        onClick={goToPrevious}
      />

      <NavArrow
        side="right"
        visible={showNavigation() && currentIndex() < props.photos.length - 1}
        onClick={goToNext}
      />

      {/* Counter */}
      <div
        class="fixed top-2 sm:top-auto sm:bottom-2 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 bg-black/70 rounded-full text-sm select-none"
        onClick={(e) => {
          console.log("all exif: ", imageExifs());
          e.stopPropagation();
        }}
      >
        {currentIndex() + 1} / {props.photos.length}
      </div>

      {/* Shared Info Drawer Overlay and Drawer */}
      <div
        class={`fixed inset-0 z-[99] transition-opacity duration-300 ease-in-out overflow-y-none ${
          drawerOpen() ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={(e) => {
          setDrawerOpen(false);
          e.stopPropagation();
        }}
        aria-hidden={!drawerOpen()}
      >
        <div class="absolute inset-0 bg-black/80" />
      </div>
      <aside
        class={`overflow-y-none fixed right-0 top-0 h-full w-72 md:w-96 bg-gray-900/95 shadow-lg z-[100] flex flex-col p-6 transition-transform duration-300 ease-in-out ${
          drawerOpen() ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!drawerOpen()}
        onClick={(e) => e.stopPropagation()}
      >
        <DrawerContent
          photo={currentPhoto}
          exif={() => imageExifs()[currentPhoto().url] || {}}
        />
      </aside>
    </div>
  );
}
