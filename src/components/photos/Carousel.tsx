import {
  createSignal,
  createEffect,
  onCleanup,
  onMount,
  JSX,
  For,
  Show,
  on,
} from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { type GalleryPhoto } from "~/types/photo";
import { type ExifData } from "~/types/exif";
import { Lightbox } from "./Lightbox";
import { NavArrow } from "./lightbox/NavArrow";
import { DrawerContent } from "./lightbox/DrawerContent";

export interface CarouselProps {
  photos: readonly GalleryPhoto[];
  initialIndex?: number;
  onClose: () => void;
}

// Movement before a touch is treated as a swipe or a vertical gesture.
const AXIS_LOCK_DISTANCE = 10;
// Only the last stretch of a swipe decides its velocity, so a slow drag that
// ends in a flick still counts as a flick.
const VELOCITY_WINDOW_MS = 100;
// Release speed (px/ms) below which a swipe is a drag rather than a flick.
const FLICK_VELOCITY = 0.4;
const MOUNTED_SLIDE_RADIUS = 2;

interface SwipeGesture {
  startX: number;
  startY: number;
  // Slide offset when the finger landed; non-zero when catching a slide that
  // was still animating.
  baseOffset: number;
  axis: "x" | "y" | undefined;
  samples: Array<{ time: number; x: number }>;
}

export function Carousel(props: CarouselProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentIndex, setCurrentIndex] = createSignal(props.initialIndex ?? 0);
  const [showNavigation, setShowNavigation] = createSignal(false);
  const [dragOffset, setDragOffset] = createSignal(0);
  const [isDragging, setIsDragging] = createSignal(false);
  let rootRef: HTMLDivElement | undefined;
  let drawerRef: HTMLElement | undefined;
  let gesture: SwipeGesture | undefined;
  // Set once a second finger lands; the gesture stays dead until every finger
  // lifts so the remaining finger can't turn a pinch into a swipe.
  let multiTouch = false;
  const [imageExifs, setImageExifs] = createSignal<Record<string, ExifData>>(
    {},
  );

  // Shared drawer state
  const [drawerOpen, setDrawerOpen] = createSignal(false);

  // Keep the URL pointing at the current photo. Replace rather than push so
  // swiping doesn't fill history with one entry per photo. Deferred because
  // whoever opened the carousel already put the first photo in the URL, and
  // a same-tick replace would swallow the opener's history entry.
  createEffect(
    on(
      currentIndex,
      (index) => {
        const currentPhoto = props.photos[index];
        if (currentPhoto) {
          setSearchParams({ image: currentPhoto.url }, { replace: true });
        }
      },
      { defer: true },
    ),
  );

  // No transition lock: CSS transitions retarget from wherever the slide
  // currently is, so rapid navigation stays smooth.
  const goToPrevious = () => {
    if (currentIndex() > 0) setCurrentIndex(currentIndex() - 1);
  };

  const goToNext = () => {
    if (currentIndex() < props.photos.length - 1) {
      setCurrentIndex(currentIndex() + 1);
    }
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

  // Where the current slide is on screen right now, including any transition
  // still in flight.
  const visibleSlideOffset = () => {
    const slide = rootRef?.querySelector<HTMLElement>(
      `[data-slide-index="${currentIndex()}"]`,
    );
    if (!slide) return 0;
    return new DOMMatrixReadOnly(getComputedStyle(slide).transform).m41;
  };

  const isPinchZoomed = () => (window.visualViewport?.scale ?? 1) > 1.01;

  const endGesture = () => {
    gesture = undefined;
    setIsDragging(false);
    setDragOffset(0);
  };

  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length > 1) {
      multiTouch = true;
      if (gesture) endGesture();
      return;
    }
    if (
      multiTouch ||
      drawerOpen() ||
      // While zoomed in, one finger pans the zoomed view instead of swiping.
      isPinchZoomed() ||
      (e.target instanceof Node && drawerRef?.contains(e.target))
    ) {
      return;
    }

    const touch = e.touches[0];
    const baseOffset = visibleSlideOffset();
    gesture = {
      startX: touch.clientX,
      startY: touch.clientY,
      baseOffset,
      axis: undefined,
      samples: [{ time: e.timeStamp, x: touch.clientX }],
    };
    // Freeze a slide that was mid-transition where it is instead of letting it
    // jump to its destination.
    setDragOffset(baseOffset);
    setIsDragging(true);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!gesture || e.touches.length !== 1) return;
    // Nothing in the carousel scrolls, so keep the page underneath from
    // scrolling or pull-to-refreshing during any one-finger gesture.
    if (e.cancelable) e.preventDefault();

    const touch = e.touches[0];
    const deltaX = touch.clientX - gesture.startX;
    const deltaY = touch.clientY - gesture.startY;

    if (!gesture.axis) {
      if (Math.hypot(deltaX, deltaY) < AXIS_LOCK_DISTANCE) return;
      gesture.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
    }
    // A gesture that started vertical never becomes a swipe, and a swipe
    // keeps following the finger even if it drifts vertically.
    if (gesture.axis === "y") return;

    gesture.samples.push({ time: e.timeStamp, x: touch.clientX });
    while (
      gesture.samples.length > 2 &&
      e.timeStamp - gesture.samples[0].time > VELOCITY_WINDOW_MS
    ) {
      gesture.samples.shift();
    }

    let offset = gesture.baseOffset + deltaX;
    const atStart = currentIndex() === 0 && offset > 0;
    const atEnd = currentIndex() === props.photos.length - 1 && offset < 0;
    if (atStart || atEnd) offset /= 2;

    const screenWidth = window.innerWidth;
    setDragOffset(Math.max(-screenWidth, Math.min(offset, screenWidth)));
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (e.touches.length === 0) multiTouch = false;
    const finished = gesture;
    if (!finished) return;

    if (finished.axis !== "x") {
      // A tap or vertical gesture leaves any caught slide to finish settling
      // on the current photo.
      endGesture();
      return;
    }

    const first = finished.samples[0];
    const last = finished.samples[finished.samples.length - 1];
    const elapsed = last.time - first.time;
    const velocity = elapsed > 0 ? (last.x - first.x) / elapsed : 0;

    // A flick moves one photo in its direction, even when it caught a slide
    // that was still settling. Flicking back against the drag isn't a flick.
    const travel = last.x - finished.startX;
    const isFlick =
      Math.abs(velocity) >= FLICK_VELOCITY &&
      Math.sign(velocity) === Math.sign(travel);
    // Otherwise settle on whichever photo shows more.
    const pages = isFlick
      ? Math.sign(velocity)
      : Math.max(-1, Math.min(1, Math.round(dragOffset() / window.innerWidth)));

    endGesture();
    if (pages > 0) goToPrevious();
    else if (pages < 0) goToNext();
  };

  const handleTouchCancel = (e: TouchEvent) => {
    if (e.touches.length === 0) multiTouch = false;
    if (gesture) endGesture();
  };

  onMount(() => {
    const root = rootRef!;
    // Native listeners: Solid delegates touch events to the document, where
    // browsers force them passive and preventDefault is ignored.
    root.addEventListener("touchstart", handleTouchStart, { passive: true });
    root.addEventListener("touchmove", handleTouchMove, { passive: false });
    root.addEventListener("touchend", handleTouchEnd);
    root.addEventListener("touchcancel", handleTouchCancel);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousemove", handleMouseMove);

    const html = document.documentElement;
    const previousOverflow = html.style.overflow;
    html.style.overflow = "hidden";

    onCleanup(() => {
      root.removeEventListener("touchstart", handleTouchStart);
      root.removeEventListener("touchmove", handleTouchMove);
      root.removeEventListener("touchend", handleTouchEnd);
      root.removeEventListener("touchcancel", handleTouchCancel);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousemove", handleMouseMove);
      html.style.overflow = previousOverflow;
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

  // Only slides near the current one exist in the DOM. Two on each side keeps
  // the next photo's thumbnail ready during rapid swiping without mounting
  // and restyling the whole collection on every touchmove.
  const isMounted = (index: number) =>
    Math.abs(index - currentIndex()) <= MOUNTED_SLIDE_RADIUS;

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
      ref={rootRef}
      class="fixed inset-0 z-50 bg-black/95 overflow-hidden overscroll-none"
      onClick={props.onClose}
      onMouseLeave={() => setShowNavigation(false)}
    >
      {/* Carousel container */}
      <div class="relative w-full h-full overflow-hidden">
        <For each={props.photos}>
          {(photo, index) => (
            <Show when={isMounted(index())}>
              <div
                data-slide-index={index()}
                style={getCarouselItemStyle(index())}
              >
                <Lightbox
                  photo={() => photo}
                  exif={() => imageExifs()[photo.url] || {}}
                  onExif={(exif) =>
                    setImageExifs((prev) => ({ ...prev, [photo.url]: exif }))
                  }
                  setDrawerOpen={setDrawerOpen}
                  shouldLoad={() => shouldLoadHighRes(index())}
                />
              </div>
            </Show>
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
        ref={drawerRef}
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
