import { createSignal, For, Show } from "solid-js";
import { X, Upload, Check, Loader2 } from "lucide-solid";
import { getStoredAuthKey } from "~/lib/auth";
import { processImage, type ProcessedImage } from "~/lib/image-processing";
import { uploadToPresignedUrl } from "~/lib/r2";
import type { Collection } from "~/db/schema";

interface UploadModalProps {
  collections: Collection[];
  onClose: () => void;
  onUploadComplete: () => void;
}

interface UploadState {
  file: File;
  processed?: ProcessedImage;
  status: "pending" | "processing" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

export function UploadModal(props: UploadModalProps) {
  const [files, setFiles] = createSignal<UploadState[]>([]);
  const [selectedCollections, setSelectedCollections] = createSignal<string[]>(
    [],
  );
  const [uploading, setUploading] = createSignal(false);

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files) return;

    const newFiles: UploadState[] = Array.from(input.files).map((file) => ({
      file,
      status: "pending" as const,
      progress: 0,
    }));

    setFiles((prev) => [...prev, ...newFiles]);

    // Process each file
    newFiles.forEach(async (uploadState, index) => {
      const actualIndex = files().length - newFiles.length + index;
      updateFileStatus(actualIndex, "processing");

      try {
        const processed = await processImage(uploadState.file);
        setFiles((prev) => {
          const updated = [...prev];
          updated[actualIndex] = {
            ...updated[actualIndex],
            processed,
            status: "pending",
          };
          return updated;
        });
      } catch (error) {
        updateFileStatus(actualIndex, "error", String(error));
      }
    });
  }

  function updateFileStatus(
    index: number,
    status: UploadState["status"],
    error?: string,
  ) {
    setFiles((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], status, error };
      return updated;
    });
  }

  function updateFileProgress(index: number, progress: number) {
    setFiles((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], progress };
      return updated;
    });
  }

  function toggleCollection(id: string) {
    setSelectedCollections((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleUpload() {
    if (selectedCollections().length === 0) {
      alert("Please select at least one collection");
      return;
    }

    const readyFiles = files().filter(
      (f) => f.status === "pending" && f.processed,
    );
    if (readyFiles.length === 0) {
      alert("No files ready to upload");
      return;
    }

    setUploading(true);
    const authKey = getStoredAuthKey();

    for (let i = 0; i < files().length; i++) {
      const uploadState = files()[i];
      if (uploadState.status !== "pending" || !uploadState.processed) continue;

      updateFileStatus(i, "uploading");

      try {
        const processed = uploadState.processed;

        // Get presigned URLs
        const urlRes = await fetch("/api/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Auth-Key": authKey || "",
          },
          body: JSON.stringify({
            filename: processed.originalFilename,
            thumbnailFilename: processed.thumbnailFilename,
          }),
        });

        if (!urlRes.ok) {
          throw new Error("Failed to get upload URLs");
        }

        const { imageUrl, thumbnailUrl } = await urlRes.json();

        // Upload original image
        await uploadToPresignedUrl(
          imageUrl,
          processed.original,
          "image/jpeg",
          (progress) => updateFileProgress(i, progress * 0.5),
        );

        // Upload thumbnail
        await uploadToPresignedUrl(
          thumbnailUrl,
          processed.thumbnail,
          "image/webp",
          (progress) => updateFileProgress(i, 50 + progress * 0.5),
        );

        // Create photo record in database
        const photoRes = await fetch("/api/photos", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Auth-Key": authKey || "",
          },
          body: JSON.stringify({
            url: processed.originalFilename,
            thumbnail: processed.thumbnailFilename,
            date: processed.date.toISOString(),
            collectionIds: selectedCollections(),
          }),
        });

        if (!photoRes.ok) {
          throw new Error("Failed to create photo record");
        }

        updateFileStatus(i, "done");
        updateFileProgress(i, 100);
      } catch (error) {
        updateFileStatus(i, "error", String(error));
      }
    }

    setUploading(false);

    // If all uploads succeeded, close the modal
    const allDone = files().every(
      (f) => f.status === "done" || f.status === "error",
    );
    if (allDone && files().some((f) => f.status === "done")) {
      props.onUploadComplete();
    }
  }

  return (
    <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm overflow-y-auto">
      <div class="bg-zinc-900 border border-violet-800 rounded-lg p-6 w-full max-w-2xl mx-4 my-8 shadow-xl">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-xl font-medium text-violet-200">Upload Photos</h2>
          <button onClick={props.onClose} class="p-1 hover:bg-zinc-800 rounded">
            <X class="w-5 h-5 text-violet-400" />
          </button>
        </div>

        {/* File input */}
        <div class="mb-6">
          <label class="block w-full p-8 border-2 border-dashed border-violet-700 rounded-lg text-center cursor-pointer hover:border-violet-500 hover:bg-zinc-800/50 transition-colors">
            <Upload class="w-8 h-8 mx-auto mb-2 text-violet-400" />
            <span class="text-violet-300">
              Click to select images or drag and drop
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              class="hidden"
            />
          </label>
        </div>

        {/* Selected files */}
        <Show when={files().length > 0}>
          <div class="mb-6 max-h-48 overflow-y-auto">
            <h3 class="text-sm font-medium text-violet-400 mb-2">
              Selected Files ({files().length})
            </h3>
            <div class="space-y-2">
              <For each={files()}>
                {(uploadState, index) => (
                  <div class="flex items-center gap-3 bg-zinc-800 rounded p-2">
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-violet-200 truncate">
                        {uploadState.file.name}
                      </p>
                      <Show when={uploadState.status === "uploading"}>
                        <div class="w-full bg-zinc-700 rounded-full h-1 mt-1">
                          <div
                            class="bg-violet-500 h-1 rounded-full transition-all"
                            style={{ width: `${uploadState.progress}%` }}
                          />
                        </div>
                      </Show>
                      <Show when={uploadState.error}>
                        <p class="text-xs text-red-400 mt-1">
                          {uploadState.error}
                        </p>
                      </Show>
                    </div>
                    <div class="flex items-center gap-2">
                      <Show when={uploadState.status === "processing"}>
                        <Loader2 class="w-4 h-4 text-violet-400 animate-spin" />
                      </Show>
                      <Show when={uploadState.status === "done"}>
                        <Check class="w-4 h-4 text-green-400" />
                      </Show>
                      <Show
                        when={
                          uploadState.status === "pending" ||
                          uploadState.status === "error"
                        }
                      >
                        <button
                          onClick={() => removeFile(index())}
                          class="p-1 hover:bg-zinc-700 rounded"
                        >
                          <X class="w-4 h-4 text-violet-400" />
                        </button>
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* Collection selection */}
        <div class="mb-6">
          <h3 class="text-sm font-medium text-violet-400 mb-2">
            Add to Collections
          </h3>
          <div class="flex flex-wrap gap-2">
            <For each={props.collections}>
              {(collection) => (
                <button
                  onClick={() => toggleCollection(collection.id)}
                  class={`px-3 py-1 rounded-full text-sm transition-colors ${
                    selectedCollections().includes(collection.id)
                      ? "bg-violet-600 text-white"
                      : "bg-zinc-800 text-violet-300 hover:bg-zinc-700"
                  }`}
                >
                  {collection.name}
                </button>
              )}
            </For>
          </div>
          <Show when={props.collections.length === 0}>
            <p class="text-sm text-zinc-500">
              No collections yet.{" "}
              <a href="/admin" class="text-violet-400 underline">
                Create one first
              </a>
            </p>
          </Show>
        </div>

        {/* Upload button */}
        <div class="flex justify-end gap-3">
          <button
            onClick={props.onClose}
            class="px-4 py-2 text-violet-300 hover:text-violet-200"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={
              uploading() ||
              files().filter((f) => f.status === "pending" && f.processed)
                .length === 0 ||
              selectedCollections().length === 0
            }
            class="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 disabled:cursor-not-allowed rounded text-white font-medium transition-colors flex items-center gap-2"
          >
            <Show when={uploading()}>
              <Loader2 class="w-4 h-4 animate-spin" />
            </Show>
            {uploading() ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
