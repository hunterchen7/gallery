import { createSignal, Show } from "solid-js";
import { Upload } from "lucide-solid";
import { UploadModal } from "./UploadModal";
import type { Collection } from "~/db/schema";

interface UploadButtonProps {
  collections: Collection[];
  defaultCollectionId?: string;
  onUploadComplete: () => void;
  placement?: "floating" | "dock";
}

export function UploadButton(props: UploadButtonProps) {
  const [showModal, setShowModal] = createSignal(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        class={`flex items-center gap-2 bg-violet-600 text-white shadow-lg transition-colors hover:bg-violet-500 ${
          props.placement === "dock"
            ? "shrink-0 rounded-lg px-3 py-2 text-sm"
            : "fixed bottom-4 left-4 z-40 rounded-full p-3"
        }`}
        title="Upload Photos"
      >
        <Upload class="w-5 h-5 text-white" />
        <span class="pr-1 font-medium">Upload</span>
      </button>

      <Show when={showModal()}>
        <UploadModal
          collections={props.collections}
          defaultCollectionId={props.defaultCollectionId}
          onClose={() => setShowModal(false)}
          onUploadComplete={() => {
            setShowModal(false);
            props.onUploadComplete();
          }}
        />
      </Show>
    </>
  );
}
