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

  onMount(() => {
    setIsMobile(window.matchMedia("(pointer: coarse)").matches);
  });

  const photoUrl = `${S3_PREFIX}${photo().url}`;

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
            class="max-h-[95vh] max-w-[95vw] rounded-lg shadow-lg select-none brightness-85"
            style={{ display: "block" }}
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
