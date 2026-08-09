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
      onPointerDown={props.onReorderPointerDown}
      onClick={props.onClick}
      class={`gallery-photo-card group relative flex-grow rounded shadow-lg overflow-hidden border bg-violet-900/20 flex flex-col min-w-[135px] max-w-[600px] min-h-[135px] transition-[border-color,box-shadow,transform,opacity] ${
        props.selected
          ? "border-violet-200 ring-4 ring-inset ring-violet-400 shadow-[0_0_28px_rgba(139,92,246,0.65)]"
          : props.editing
            ? "border-zinc-700 hover:border-violet-500"
            : "border-violet-700/50"
      } ${props.editing ? "touch-none cursor-grab select-none active:cursor-grabbing" : ""} ${props.dragging ? "border-dashed border-violet-400 bg-violet-950/50 opacity-20" : ""}`}
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
          } transition-transform ${props.editing ? "pointer-events-none select-none" : "hover:scale-[1.02] cursor-nesw-resize"}`}
          loading="lazy"
          draggable={false}
          onLoad={handleImageLoad}
        />
        <Show when={props.selected}>
          <span class="pointer-events-none absolute inset-0 bg-violet-500/20" />
        </Show>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            props.onSelect();
          }}
          class={`absolute right-2 top-2 z-20 flex h-9 w-9 items-center justify-center rounded-full border-2 shadow-xl transition-all duration-150 focus:opacity-100 focus:outline-none ${
            props.selected
              ? "scale-100 border-white bg-violet-500 opacity-100 ring-2 ring-violet-300/70"
              : "scale-90 border-white/80 bg-black/55 opacity-0 hover:bg-violet-600 group-hover:scale-100 group-hover:opacity-100"
          }`}
          aria-label={props.selected ? "Deselect photo" : "Select photo"}
          aria-pressed={props.selected}
        >
          <Show when={props.selected}>
            <Check class="h-5 w-5 stroke-[3] text-white" />
          </Show>
        </button>
        <Show when={props.editing}>
          <span
            class="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
          >
            <GripVertical class="h-3.5 w-3.5" />
            {props.index + 1}
          </span>
        </Show>
      </div>
      <div class="flex-shrink-0 p-1">
        <span
          class={`inline font-mono text-xs text-violet-300 ${props.editing ? "cursor-grab" : "cursor-text"}`}
        >
          {props.photo.date ? formatDate(props.photo.date) : ""}
        </span>
      </div>
    </div>
  );
}
