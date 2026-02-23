import { createSignal, onCleanup, createEffect, onMount, JSX } from "solid-js";
import { S3_PREFIX, type GalleryPhoto } from "~/types/photo";
import { type ExifData } from "~/types/exif";
import { InfoBar } from "./lightbox/InfoBar";

const magnifierSize = 500; // px
const magnifierZoom = 0.75;

export function Lightbox({
  photo,
  exif,
  setDrawerOpen,
  shouldLoad = () => true,
}: {
  photo: () => GalleryPhoto;
  exif: () => ExifData;
  setDrawerOpen: (open: boolean) => void;
  shouldLoad?: () => boolean;
}) {
  // Magnifier state
  const [isZoomMode, setIsZoomMode] = createSignal(false);
  const [magnifierPos, setMagnifierPos] = createSignal({ x: 0, y: 0 });

  const [imgRef, setImgRef] = createSignal<HTMLImageElement | null>(null);

  // used by magnifier
  const [imgWidth, setImgWidth] = createSignal<number>(0);
  const [imgHeight, setImgHeight] = createSignal<number>(0);
  const [isMobile, setIsMobile] = createSignal(false);
  const [imageLoaded, setImageLoaded] = createSignal(false);
  const [thumbSize, setThumbSize] = createSignal<{ w: number; h: number } | null>(null);
  const [loadProgress, setLoadProgress] = createSignal<number | null>(null);
  const [loadedBytes, setLoadedBytes] = createSignal(0);
  const [totalBytes, setTotalBytes] = createSignal(0);

  onMount(() => {
    setIsMobile(window.matchMedia("(pointer: coarse)").matches);
  });

  const photoUrl = `${S3_PREFIX}${photo().url}`;

  // Track download progress via a parallel fetch that shares the HTTP cache with <img>
  createEffect(() => {
    if (!shouldLoad()) return;
    setLoadProgress(null);

    const controller = new AbortController();
    fetch(photoUrl, { signal: controller.signal })
      .then(async (res) => {
        const total = Number(res.headers.get("Content-Length") || 0);
        if (!total || !res.body) return;
        setTotalBytes(total);
        const reader = res.body.getReader();
        let loaded = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          loaded += value.byteLength;
          setLoadedBytes(loaded);
          setLoadProgress(loaded / total);
        }
      })
      .catch(() => {});

    onCleanup(() => controller.abort());
  });

  const magnifierStyle = (): JSX.CSSProperties => {
    if (!isZoomMode() || !shouldLoad() || imgWidth() <= 0 || imgHeight() <= 0) {
      return { display: "none" };
    }

    const img = imgRef();
    if (!img) return { display: "none" };

    // 1. Clamp the cursor position to stay within the image boundaries
    const cursorX = Math.max(0, Math.min(magnifierPos().x, img.offsetWidth));
    const cursorY = Math.max(0, Math.min(magnifierPos().y, img.offsetHeight));

    // 2. Calculate the lens's top-left position based on the clamped cursor
    const lensX = cursorX - magnifierSize / 2;
    const lensY = cursorY - magnifierSize / 2;

    // 3. Calculate background position based on the clamped cursor position
    const bgX =
      -(cursorX / img.offsetWidth) * (imgWidth() * magnifierZoom) +
      magnifierSize / 2;
    const bgY =
      -(cursorY / img.offsetHeight) * (imgHeight() * magnifierZoom) +
      magnifierSize / 2;

    return {
      position: "absolute",
      "pointer-events": "none",
      left: `${lensX}px`,
      top: `${lensY}px`,
      width: `${magnifierSize}px`,
      height: `${magnifierSize}px`,
      "box-shadow": "0 0 8px 2px #0008",
      border: "2px solid #eee",
      overflow: "hidden",
      "z-index": 10,
      "background-image": `url(${photoUrl})`,
      "background-repeat": "no-repeat",
      "background-size": `${imgWidth() * magnifierZoom}px ${
        imgHeight() * magnifierZoom
      }px`,
      "background-position": `${bgX}px ${bgY}px`,
    };
  };

  createEffect(() => {
    if (!isZoomMode()) return;

    const handleMouseMove = (e: MouseEvent) => {
      const img = imgRef();
      if (!img) return;
      const rect = img.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMagnifierPos({ x, y });
    };

    window.addEventListener("mousemove", handleMouseMove);

    onCleanup(() => {
      window.removeEventListener("mousemove", handleMouseMove);
    });
  });

  return (
    <div class="flex items-center justify-center w-full h-full">
      <div
        class="relative flex flex-col items-center bg-violet-900/30 rounded-lg border border-slate-300/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          class="relative min-w-32 min-h-32 md:min-w-96 md:min-h-96"
          onMouseMove={(e) => {
            // Magnifier behavior (when enabled) tracks pointer over the image
            if (!isZoomMode()) return;
            const img = imgRef();
            if (!img) return;
            const rect = img.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            setMagnifierPos({ x, y });
          }}
        >
          {/* Thumbnail image sizes the container; full image overlays on top */}
          <img
            src={`${S3_PREFIX}${photo().thumbnail}`}
            alt="thumbnail"
            class="rounded-lg shadow-lg select-none brightness-85 blur-xs"
            onLoad={(e) => {
              const ar = e.currentTarget.naturalWidth / e.currentTarget.naturalHeight;
              const maxW = window.innerWidth * 0.95;
              const maxH = window.innerHeight * 0.95;
              let w = maxW;
              let h = w / ar;
              if (h > maxH) {
                h = maxH;
                w = h * ar;
              }
              setThumbSize({ w, h });
            }}
            style={{
              display: "block",
              ...(thumbSize() ? { width: `${thumbSize()!.w}px`, height: `${thumbSize()!.h}px` } : { "max-width": "95vw", "max-height": "95vh" }),
            }}
          />
          {shouldLoad() && (
            <img
              ref={setImgRef}
              src={photoUrl}
              alt="photo"
              onLoad={(e) => {
                setImgWidth(e.currentTarget.naturalWidth);
                setImgHeight(e.currentTarget.naturalHeight);
                setImageLoaded(true);
              }}
              class="absolute top-0 left-0 w-full h-full rounded-lg shadow-lg z-1 select-none object-contain"
              style={{
                display: "block",
                cursor: (() => {
                  if (!imageLoaded())
                    return "url('/icons/cursors/cursor-wait.svg') 8 8, wait";
                  if (isZoomMode()) return "zoom-out";
                  return "zoom-in";
                })(),
              }}
              onClick={(e) => {
                if (isMobile()) return;
                e.stopPropagation();
                if (!isZoomMode()) {
                  const img = imgRef();
                  if (img) {
                    const rect = img.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    setMagnifierPos({ x, y });
                  }
                }
                setIsZoomMode(!isZoomMode());
              }}
              onContextMenu={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                img.src = `${S3_PREFIX}${photo().url}`;
              }}
            />
          )}

          {/* Download progress bar */}
          {loadProgress() !== null && !imageLoaded() && (
            <div class="absolute top-1/2 left-1/4 right-1/4 -translate-y-1/2 z-2 flex flex-col items-center gap-2">
              <div class="w-full h-1 rounded-full overflow-hidden bg-white/20">
                <div
                  class="h-full bg-white/80 rounded-full transition-[width] duration-150"
                  style={{ width: `${(loadProgress()! * 100).toFixed(1)}%` }}
                />
              </div>
              <span class="text-white/60 text-xs select-none">
                {(loadedBytes() / 1024 / 1024).toFixed(1)} / {(totalBytes() / 1024 / 1024).toFixed(1)} MB
              </span>
            </div>
          )}

          {/* Magnifier lens */}
          {isZoomMode() && shouldLoad() && imageLoaded() && (
            <div style={magnifierStyle()} />
          )}
        </div>
        <InfoBar
          photo={photo}
          exif={exif}
          isMobile={isMobile}
          isZoomMode={isZoomMode}
          setIsZoomMode={setIsZoomMode}
          setDrawerOpen={setDrawerOpen}
        />
      </div>
    </div>
  );
}
