import { createSignal, Show, onMount, onCleanup } from "solid-js";
import { type GalleryPhoto, S3_PREFIX } from "~/types/photo";
import { LoadingSpinner } from "../LoadingSpinner";
import { formatDate } from "~/utils/date";
import { Check, GripVertical } from "lucide-solid";

interface PhotoProps {
  photo: GalleryPhoto;
  onClick: () => void;
  index: number;
  playAnimation?: boolean;
  editing?: boolean;
  selected?: boolean;
  reorderMode?: boolean;
  onDragStart?: (event: DragEvent) => void;
  onDragOver?: (event: DragEvent) => void;
  onDragEnd?: (event: DragEvent) => void;
}

export function Photo({
  photo,
  onClick,
  index,
  playAnimation = true,
  editing = false,
  selected = false,
  reorderMode = false,
  onDragStart,
  onDragOver,
  onDragEnd,
}: PhotoProps) {
  const [loaded, setLoaded] = createSignal(false);
  const [aspectRatio, setAspectRatio] = createSignal(1); // Default aspect ratio
  const [baseWidth, setBaseWidth] = createSignal(300); // Default base width
  let imgRef: HTMLImageElement | null = null;

  // Function to calculate base width based on screen size
  const updateBaseWidth = () => {
    const width = window.innerWidth;
    if (width < 640) {
      // sm
      setBaseWidth(125);
    } else if (width < 768) {
      // md
      setBaseWidth(150);
    } else if (width < 1024) {
      // lg
      setBaseWidth(175);
    } else if (width < 1536) {
      // xl
      setBaseWidth(200);
    }
  };

  onMount(() => {
    if (typeof window !== "undefined") {
      updateBaseWidth();
      window.addEventListener("resize", updateBaseWidth);
    }
  });

  onCleanup(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", updateBaseWidth);
    }
  });

  // Robustly check if image is already loaded (cached)
  function handleImgRef(el: HTMLImageElement) {
    imgRef = el;
    if (el) {
      // Use microtask to ensure DOM is updated
      setTimeout(() => {
        if (el.complete && el.naturalWidth > 0) {
          setLoaded(true);
          // Calculate aspect ratio from the loaded image
          let ratio = el.naturalWidth / el.naturalHeight;

          // Constrain extreme aspect ratios
          ratio = Math.max(0.5, Math.min(3.0, ratio));

          setAspectRatio(ratio);
        }
      }, 0);
    }
  }

  const handleImageLoad = () => {
    setLoaded(true);
    if (imgRef && imgRef.naturalWidth > 0 && imgRef.naturalHeight > 0) {
      const ratio = imgRef.naturalWidth / imgRef.naturalHeight;

      setAspectRatio(ratio);
    }
  };

  return (
    <div
      draggable={reorderMode}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onClick={onClick}
      class={`flex-grow rounded shadow-lg overflow-hidden border bg-violet-900/20 flex flex-col min-w-[135px] max-w-[600px] min-h-[135px] ${playAnimation ? "content-fade-in" : ""} transition-all ${
        selected
          ? "border-violet-400 ring-4 ring-violet-500/50"
          : editing
            ? "border-zinc-700 hover:border-violet-500"
            : "border-violet-700/50 hover:scale-[1.01]"
      } ${reorderMode ? "cursor-move" : editing ? "cursor-pointer" : ""}`}
      style={`
  flex-basis: ${baseWidth() * aspectRatio()}px;
  ${playAnimation ? `animation-delay: ${Math.min(index * 0.08, 2)}s;` : ""}
  `}
    >
      <div class="relative flex-1">
        {!loaded() && (
          <div class="absolute inset-0 flex items-center justify-center z-10">
            <LoadingSpinner />
          </div>
        )}
        <img
          ref={handleImgRef}
          src={`${S3_PREFIX}${photo.thumbnail}`}
          alt="Gallery photo"
          class={`w-full h-full object-cover transition-opacity duration-300 max-h-96 max-w-[600px] ${
            loaded() ? "opacity-100" : "opacity-0"
          } transition-transform ${editing ? "" : "hover:scale-[1.02] cursor-nesw-resize"}`}
          loading="lazy"
          draggable={false}
          onLoad={handleImageLoad}
        />
        <Show when={editing && !reorderMode}>
          <span
            class={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 shadow-lg ${
              selected
                ? "border-violet-400 bg-violet-500"
                : "border-white/70 bg-black/50"
            }`}
          >
            <Show when={selected}>
              <Check class="h-4 w-4 text-white" />
            </Show>
          </span>
        </Show>
        <Show when={reorderMode}>
          <span class="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs text-white shadow-lg">
            <GripVertical class="h-3.5 w-3.5" />
            {index + 1}
          </span>
        </Show>
      </div>
      <div class="p-1 flex-shrink-0">
        <span class="text-xs text-violet-300 font-mono inline cursor-text">
          {photo.date ? formatDate(photo.date) : ""}
        </span>
      </div>
    </div>
  );
}
