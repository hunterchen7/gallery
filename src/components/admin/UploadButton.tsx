import { createSignal, Show } from "solid-js";
import { Upload } from "lucide-solid";
import { UploadModal } from "./UploadModal";
import type { Collection } from "~/db/schema";

interface UploadButtonProps {
  collections: Collection[];
  onUploadComplete: () => void;
}

export function UploadButton(props: UploadButtonProps) {
  const [showModal, setShowModal] = createSignal(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        class="fixed bottom-4 left-4 z-40 p-3 bg-violet-600 hover:bg-violet-500 rounded-full shadow-lg transition-colors flex items-center gap-2"
        title="Upload Photos"
      >
        <Upload class="w-5 h-5 text-white" />
        <span class="text-white font-medium pr-1">Upload</span>
      </button>

      <Show when={showModal()}>
        <UploadModal
          collections={props.collections}
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
