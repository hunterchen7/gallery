import { createSignal, Show } from "solid-js";
import { type GalleryPhoto, S3_PREFIX } from "~/types/photo";
import { LoadingSpinner } from "../LoadingSpinner";
import { formatDate } from "~/utils/date";
import { Check, GripVertical } from "lucide-solid";

interface PhotoProps {
  photo: GalleryPhoto;
  onClick: () => void;
  index: number;
  editing?: boolean;
  selected?: boolean;
  dragging?: boolean;
  onSelect: () => void;
  onReorderPointerDown?: (event: PointerEvent) => void;
}

export function Photo(props: PhotoProps) {
  const [loaded, setLoaded] = createSignal(false);
  const aspectRatio = () => {
    if (!props.photo.width || !props.photo.height) return 1;
    return Math.max(0.5, Math.min(3, props.photo.width / props.photo.height));
  };

  // Robustly check if image is already loaded (cached)
  function handleImgRef(el: HTMLImageElement) {
    queueMicrotask(() => {
      if (el.complete && el.naturalWidth > 0) setLoaded(true);
    });
  }

  const handleImageLoad = () => setLoaded(true);

  return (
    <div
      data-reorder-photo-id={props.editing ? props.photo.id : undefined}
      onClick={props.onClick}
      class={`gallery-photo-card group relative flex-grow rounded shadow-lg overflow-hidden border bg-violet-900/20 flex flex-col min-w-[135px] max-w-[600px] min-h-[135px] transition-[border-color,box-shadow,transform,opacity] ${
        props.editing
          ? "border-zinc-700 hover:border-violet-500"
          : "border-violet-700/50"
      } ${props.dragging ? "border-dashed border-violet-400 bg-violet-950/50 opacity-20" : ""}`}
      style={`--photo-aspect: ${aspectRatio()};`}
    >
      <div class="relative flex-1">
        {!loaded() && (
          <div class="absolute inset-0 flex items-center justify-center z-10">
            <LoadingSpinner />
          </div>
        )}
        <img
          ref={handleImgRef}
          src={`${S3_PREFIX}${props.photo.thumbnail}`}
          alt="Gallery photo"
          width={props.photo.width || 1}
          height={props.photo.height || 1}
          class={`h-full w-full max-h-96 max-w-[600px] object-cover transition-opacity duration-300 ${
            loaded() ? "opacity-100" : "opacity-0"
          } cursor-nesw-resize transition-transform hover:scale-[1.02]`}
          loading={props.index < 12 ? "eager" : "lazy"}
          fetchpriority={props.index < 4 ? "high" : "auto"}
          draggable={false}
          onLoad={handleImageLoad}
        />
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            props.onSelect();
          }}
          class={`absolute right-1 top-1 z-20 flex h-10 w-10 items-center justify-center text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] transition-opacity duration-150 hover:opacity-100 focus:opacity-100 focus:outline-none ${
            props.selected
              ? "opacity-100"
              : "opacity-0"
          }`}
          aria-label={props.selected ? "Deselect photo" : "Select photo"}
          aria-pressed={props.selected}
        >
          <Check class="h-6 w-6 stroke-[3]" />
        </button>
        <Show when={props.editing}>
          <button
            type="button"
            onPointerDown={(event) => {
              event.stopPropagation();
              props.onReorderPointerDown?.(event);
            }}
            onClick={(event) => event.stopPropagation()}
            class="absolute left-2 top-2 z-20 flex touch-none cursor-grab items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-all hover:bg-violet-600 focus:opacity-100 focus:outline-none active:cursor-grabbing group-hover:opacity-100"
            title="Drag to reorder"
            aria-label={`Drag photo ${props.index + 1} to reorder`}
          >
            <GripVertical class="h-3.5 w-3.5" />
            {props.index + 1}
          </button>
        </Show>
      </div>
      <div class="flex-shrink-0 p-1">
        <span
          class="inline cursor-text font-mono text-xs text-violet-300"
        >
          {props.photo.date ? formatDate(props.photo.date) : ""}
        </span>
      </div>
    </div>
  );
}
