import {
  createSignal,
  createMemo,
  onCleanup,
  createEffect,
  onMount,
  JSX,
} from "solid-js";
import { S3_PREFIX, type GalleryPhoto } from "~/types/photo";
import { type ExifData } from "~/types/exif";
import { extractExif } from "~/utils/exif";
import { InfoBar } from "./lightbox/InfoBar";

const magnifierSize = 500; // px
// EXIF lives at the start of the file; 64KB covers it for these photos.
const EXIF_PREFIX_BYTES = 64 * 1024;
const magnifierZoom = 0.75;

export function Lightbox({
  photo,
  exif,
  onExif,
  setDrawerOpen,
  shouldLoad = () => true,
}: {
  photo: () => GalleryPhoto;
  exif: () => ExifData;
  onExif?: (exif: ExifData) => void;
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
  const [aspectRatio, setAspectRatio] = createSignal<number>();
  const [infoBarHeight, setInfoBarHeight] = createSignal(0);
  let infoBarRef: HTMLDivElement | undefined;
  const [loadProgress, setLoadProgress] = createSignal<number | null>(null);
  const [loadedBytes, setLoadedBytes] = createSignal(0);
  const [totalBytes, setTotalBytes] = createSignal(0);

  onMount(() => {
    setIsMobile(window.matchMedia("(pointer: coarse)").matches);

    // The info bar wraps to more lines as the photo narrows, so track its
    // real height rather than assuming one.
    const measureInfoBar = () => setInfoBarHeight(infoBarRef?.offsetHeight ?? 0);
    measureInfoBar();
    const infoBarObserver = new ResizeObserver(measureInfoBar);
    if (infoBarRef) infoBarObserver.observe(infoBarRef);
    window.addEventListener("resize", measureInfoBar);
    onCleanup(() => {
      infoBarObserver.disconnect();
      window.removeEventListener("resize", measureInfoBar);
    });
  });

  // Largest size that fits the photo and its info bar inside 95% of the
  // viewport. Left to CSS so rotation and mobile browser chrome showing or
  // hiding re-fit without waiting on resize events, which can fire before
  // the new dimensions settle.
  const fittedWidth = () => {
    const ar = aspectRatio();
    if (!ar) return undefined;
    return `min(95vw, calc((95dvh - ${infoBarHeight()}px) * ${ar}))`;
  };

  const photoUrl = `${S3_PREFIX}${photo().url}`;

  // The only download of the full image: it drives the progress bar, yields
  // EXIF from the first bytes, and becomes the <img> source as a blob. A
  // separate <img src> request can't reuse this one from the HTTP cache: the
  // photo host varies on Origin, and <img> sends none.
  const [imageSrc, setImageSrc] = createSignal<string>();
  // shouldLoad reads the carousel's index, so it re-fires on every swipe even
  // when its answer is unchanged; only restart the download when it flips.
  const loading = createMemo(shouldLoad);
  createEffect(() => {
    if (!loading()) return;
    setLoadProgress(null);

    const controller = new AbortController();
    let objectUrl: string | undefined;
    void (async () => {
      try {
        const res = await fetch(photoUrl, { signal: controller.signal });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const total = Number(res.headers.get("Content-Length") || 0);
        setTotalBytes(total);
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let loaded = 0;
        let exifRead = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.byteLength;
          setLoadedBytes(loaded);
          if (total) setLoadProgress(loaded / total);
          if (!exifRead && loaded >= EXIF_PREFIX_BYTES) {
            const exif = extractExif(await new Blob(chunks).arrayBuffer(), total);
            exifRead = Object.keys(exif).length > 0;
            if (exifRead) onExif?.(exif);
          }
        }
        const blob = new Blob(chunks, {
          type: res.headers.get("Content-Type") || "image/jpeg",
        });
        if (!exifRead) {
          const exif = extractExif(await blob.arrayBuffer(), total || blob.size);
          if (Object.keys(exif).length > 0) onExif?.(exif);
        }
        objectUrl = URL.createObjectURL(blob);
        setImageSrc(objectUrl);
      } catch {
        // Let the browser try the photo directly; it just loses progress and
        // EXIF.
        if (!controller.signal.aborted) setImageSrc(photoUrl);
      }
    })();

    onCleanup(() => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setImageSrc(undefined);
      setImageLoaded(false);
    });
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
      "background-image": `url(${imageSrc() ?? photoUrl})`,
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
          // Placeholder size until the thumbnail is fitted; afterwards these
          // minimums would overflow short landscape screens.
          class="relative"
          classList={{
            "min-w-32 min-h-32 md:min-w-96 md:min-h-96": !fittedWidth(),
          }}
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
            onLoad={(e) =>
              setAspectRatio(
                e.currentTarget.naturalWidth / e.currentTarget.naturalHeight,
              )
            }
            style={{
              display: "block",
              ...(fittedWidth()
                ? { width: fittedWidth(), "aspect-ratio": `${aspectRatio()}` }
                : { "max-width": "95vw", "max-height": "95vh" }),
            }}
          />
          {shouldLoad() && imageSrc() && (
            <img
              ref={setImgRef}
              src={imageSrc()}
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
        <div ref={infoBarRef} class="w-full">
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
    </div>
  );
}
