import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Upload } from "lucide-solid";
import type { CollectionNavigationItem } from "~/lib/collection-data";
import { UploadModal } from "./UploadModal";

interface UploadButtonProps {
  collections: CollectionNavigationItem[];
  defaultCollectionId?: string;
  onUploadComplete: () => void;
  enablePageDrop?: boolean;
}

export function UploadButton(props: UploadButtonProps) {
  const [showModal, setShowModal] = createSignal(false);
  const [initialFiles, setInitialFiles] = createSignal<File[]>([]);
  const [pageDragActive, setPageDragActive] = createSignal(false);

  onMount(() => {
    if (!props.enablePageDrop) return;
    window.addEventListener("dragover", handlePageDragOver);
    window.addEventListener("dragleave", handlePageDragLeave);
    window.addEventListener("drop", handlePageDrop);
  });

  onCleanup(() => {
    if (typeof window === "undefined") return;
    window.removeEventListener("dragover", handlePageDragOver);
    window.removeEventListener("dragleave", handlePageDragLeave);
    window.removeEventListener("drop", handlePageDrop);
  });

  function containsFiles(event: DragEvent) {
    return Array.from(event.dataTransfer?.types || []).includes("Files");
  }

  function handlePageDragOver(event: DragEvent) {
    if (!containsFiles(event)) return;
    event.preventDefault();
    if (showModal()) return;
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    setPageDragActive(true);
  }

  function handlePageDragLeave(event: DragEvent) {
    if (
      event.clientX <= 0 ||
      event.clientY <= 0 ||
      event.clientX >= window.innerWidth ||
      event.clientY >= window.innerHeight
    ) {
      setPageDragActive(false);
    }
  }

  function handlePageDrop(event: DragEvent) {
    if (!containsFiles(event)) return;
    event.preventDefault();
    if (showModal()) return;
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length === 0) return;
    setPageDragActive(false);
    setInitialFiles(files);
    setShowModal(true);
  }

  return (
    <>
      <button
        onClick={() => {
          setInitialFiles([]);
          setShowModal(true);
        }}
        class="fixed bottom-4 left-4 z-40 rounded-full bg-violet-600 p-3 text-white shadow-lg transition-colors hover:bg-violet-500"
        title="Upload Photos"
        aria-label="Upload photos"
      >
        <Upload class="w-5 h-5 text-white" />
      </button>

      <Show when={pageDragActive()}>
        <div class="pointer-events-none fixed inset-3 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-violet-400 bg-violet-950/35 text-violet-100 backdrop-blur-sm">
          <Upload class="h-10 w-10" />
        </div>
      </Show>

      <Show when={showModal()}>
        <UploadModal
          collections={props.collections}
          defaultCollectionId={props.defaultCollectionId}
          initialFiles={initialFiles()}
          onClose={() => {
            setShowModal(false);
            setInitialFiles([]);
          }}
          onUploadComplete={() => {
            setShowModal(false);
            setInitialFiles([]);
            props.onUploadComplete();
          }}
        />
      </Show>
    </>
  );
}
