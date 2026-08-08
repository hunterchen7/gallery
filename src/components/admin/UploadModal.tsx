import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Check, ImagePlus, Loader2, RotateCcw, Upload, X } from "lucide-solid";
import { getStoredAuthKey } from "~/lib/auth";
import { processImage, type ProcessedImage } from "~/lib/image-processing";
import { uploadToPresignedUrl } from "~/lib/r2";
import type { Collection } from "~/db/schema";

interface UploadModalProps {
  collections: Collection[];
  defaultCollectionId?: string;
  initialFiles?: File[];
  onClose: () => void;
  onUploadComplete: () => void;
}

type UploadStatus =
  | "processing"
  | "ready"
  | "uploading"
  | "done"
  | "error";

interface UploadState {
  id: string;
  file: File;
  previewUrl: string;
  processed?: ProcessedImage;
  status: UploadStatus;
  progress: number;
  error?: string;
  wasDuplicate?: boolean;
}

export function UploadModal(props: UploadModalProps) {
  const defaultCollections = props.defaultCollectionId
    ? [props.defaultCollectionId]
    : [];
  const [files, setFiles] = createSignal<UploadState[]>([]);
  const [selectedCollections, setSelectedCollections] =
    createSignal<string[]>(defaultCollections);
  const [isDraggingOver, setIsDraggingOver] = createSignal(false);
  const [hasUploaded, setHasUploaded] = createSignal(false);

  const activeCount = createMemo(
    () =>
      files().filter(
        (file) =>
          file.status === "processing" || file.status === "uploading",
      ).length,
  );
  const doneCount = createMemo(
    () => files().filter((file) => file.status === "done").length,
  );
  const collectionSelectionLocked = createMemo(() =>
    files().some(
      (file) => file.status === "uploading" || file.status === "done",
    ),
  );

  onMount(() => {
    if (props.initialFiles?.length) addFiles(props.initialFiles);
  });

  onCleanup(() => {
    files().forEach((file) => URL.revokeObjectURL(file.previewUrl));
  });

  function isImageFile(file: File) {
    return (
      file.type.startsWith("image/") ||
      /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i.test(file.name)
    );
  }

  function updateFile(id: string, updates: Partial<UploadState>) {
    setFiles((current) =>
      current.map((file) => (file.id === id ? { ...file, ...updates } : file)),
    );
  }

  function addFiles(selectedFiles: File[]) {
    const existingKeys = new Set(
      files().map(
        ({ file }) => `${file.name}:${file.size}:${file.lastModified}`,
      ),
    );
    const newFiles = selectedFiles
      .filter(isImageFile)
      .filter(
        (file) =>
          !existingKeys.has(`${file.name}:${file.size}:${file.lastModified}`),
      )
      .map((file): UploadState => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        status: "processing",
        progress: 0,
      }));

    if (newFiles.length === 0) return;
    setFiles((current) => [...current, ...newFiles]);
    newFiles.forEach((file) => void processAndQueue(file));
  }

  async function processAndQueue(uploadState: UploadState) {
    try {
      const processed = await processImage(uploadState.file);
      updateFile(uploadState.id, { processed, status: "ready" });

      const collectionIds = selectedCollections();
      if (collectionIds.length > 0) {
        await uploadFile(uploadState.id, processed, collectionIds);
      }
    } catch (error) {
      updateFile(uploadState.id, {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function uploadFile(
    id: string,
    processed: ProcessedImage,
    collectionIds: string[],
  ) {
    const current = files().find((file) => file.id === id);
    if (!current || current.status === "uploading" || current.status === "done") {
      return;
    }

    updateFile(id, { status: "uploading", error: undefined, progress: 0 });
    const authKey = getStoredAuthKey();

    try {
      const urlRes = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Key": authKey || "",
        },
        body: JSON.stringify({
          contentHash: processed.contentHash,
          contentType: processed.originalContentType,
          sourceFilename: processed.sourceFilename,
        }),
      });

      if (!urlRes.ok) {
        const data = await urlRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to prepare upload");
      }

      const uploadPlan = await urlRes.json();
      const imageCompleteProgress = uploadPlan.imageExists ? 50 : 0;
      if (uploadPlan.imageUrl) {
        await uploadToPresignedUrl(
          uploadPlan.imageUrl,
          processed.original,
          processed.originalContentType,
          (progress) => updateFile(id, { progress: progress * 0.5 }),
        );
      } else {
        updateFile(id, { progress: imageCompleteProgress });
      }
      if (uploadPlan.thumbnailUrl) {
        await uploadToPresignedUrl(
          uploadPlan.thumbnailUrl,
          processed.thumbnail,
          "image/webp",
          (progress) => updateFile(id, { progress: 50 + progress * 0.5 }),
        );
      }

      const photoRes = await fetch("/api/photos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Key": authKey || "",
        },
        body: JSON.stringify({
          url: uploadPlan.photo?.url || uploadPlan.filename || processed.originalFilename,
          thumbnail:
            uploadPlan.photo?.thumbnail ||
            uploadPlan.thumbnailFilename ||
            processed.thumbnailFilename,
          contentHash: processed.contentHash,
          date: processed.date.toISOString(),
          collectionIds,
        }),
      });

      if (!photoRes.ok) {
        const data = await photoRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save photo");
      }

      const savedPhoto = await photoRes.json();
      updateFile(id, {
        status: "done",
        progress: 100,
        wasDuplicate: uploadPlan.duplicate || savedPhoto.duplicate,
      });
      setHasUploaded(true);
    } catch (error) {
      updateFile(id, {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function handleFileSelect(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    if (input.files) addFiles(Array.from(input.files));
    input.value = "";
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    setIsDraggingOver(true);
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
    if (event.dataTransfer?.files) {
      addFiles(Array.from(event.dataTransfer.files));
    }
  }

  function toggleCollection(id: string) {
    if (collectionSelectionLocked()) return;

    const next = selectedCollections().includes(id)
      ? selectedCollections().filter((collectionId) => collectionId !== id)
      : [...selectedCollections(), id];
    setSelectedCollections(next);

    if (next.length > 0) {
      files()
        .filter((file) => file.status === "ready" && file.processed)
        .forEach((file) => void uploadFile(file.id, file.processed!, next));
    }
  }

  function removeFile(id: string) {
    const file = files().find((candidate) => candidate.id === id);
    if (!file || file.status === "uploading") return;
    URL.revokeObjectURL(file.previewUrl);
    setFiles((current) => current.filter((candidate) => candidate.id !== id));
  }

  function retryFile(uploadState: UploadState) {
    if (!uploadState.processed || selectedCollections().length === 0) return;
    void uploadFile(
      uploadState.id,
      uploadState.processed,
      selectedCollections(),
    );
  }

  function closeModal() {
    if (activeCount() > 0) return;
    if (hasUploaded()) props.onUploadComplete();
    else props.onClose();
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 sm:p-4 backdrop-blur-sm">
      <div class="flex h-[calc(100vh-1rem)] sm:h-[calc(100vh-2rem)] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-violet-800 bg-zinc-900 shadow-2xl">
        <header class="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 class="text-xl font-medium text-violet-200">Upload Photos</h2>
            <p class="mt-0.5 text-xs text-zinc-500">
              Photos upload automatically as soon as they are ready.
            </p>
          </div>
          <button
            onClick={closeModal}
            disabled={activeCount() > 0}
            class="rounded p-2 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            title={activeCount() > 0 ? "Wait for active uploads to finish" : "Close"}
          >
            <X class="h-5 w-5 text-violet-400" />
          </button>
        </header>

        <div class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[18rem_1fr]">
          <aside class="border-b border-zinc-800 p-4 lg:border-b-0 lg:border-r">
            <h3 class="mb-2 text-sm font-medium text-violet-400">
              Add to collections
            </h3>
            <p class="mb-3 text-xs text-zinc-500">
              Choose before selecting photos. The selection locks once uploading starts.
            </p>
            <div class="flex max-h-28 flex-wrap gap-2 overflow-y-auto lg:max-h-[calc(100vh-14rem)] lg:flex-col lg:flex-nowrap">
              <For each={props.collections}>
                {(collection) => (
                  <button
                    onClick={() => toggleCollection(collection.id)}
                    disabled={collectionSelectionLocked()}
                    class={`rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed ${
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
            <Show when={selectedCollections().length === 0}>
              <p class="mt-3 text-xs text-amber-400">
                Select at least one collection to start uploads.
              </p>
            </Show>
          </aside>

          <section class="flex min-h-0 flex-col p-4">
            <label
              onDragEnter={handleDragOver}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              class={`mb-4 flex shrink-0 cursor-pointer items-center justify-center gap-3 rounded-lg border-2 border-dashed px-5 py-5 transition-colors ${
                isDraggingOver()
                  ? "border-violet-400 bg-violet-950/40"
                  : "border-violet-700 hover:border-violet-500 hover:bg-zinc-800/50"
              }`}
            >
              <Upload class="h-6 w-6 text-violet-400" />
              <span class="text-sm text-violet-300">
                Select images or drag and drop more at any time
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                class="hidden"
              />
            </label>

            <div class="min-h-0 flex-1 overflow-y-auto pr-1">
              <Show
                when={files().length > 0}
                fallback={
                  <div class="flex h-full min-h-52 flex-col items-center justify-center text-zinc-600">
                    <ImagePlus class="mb-3 h-12 w-12" />
                    <p>No photos selected yet</p>
                  </div>
                }
              >
                <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  <For each={files()}>
                    {(uploadState) => (
                      <article class="group relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
                        <div class="relative aspect-square bg-zinc-800">
                          <img
                            src={uploadState.previewUrl}
                            alt={uploadState.file.name}
                            class="h-full w-full object-cover"
                          />
                          <div class="absolute inset-x-0 bottom-0 h-1.5 bg-zinc-800/90">
                            <div
                              class={`h-full transition-all ${
                                uploadState.status === "error"
                                  ? "bg-red-500"
                                  : uploadState.status === "done"
                                    ? "bg-green-500"
                                    : "bg-violet-500"
                              }`}
                              style={{ width: `${uploadState.progress}%` }}
                            />
                          </div>
                          <div class="absolute right-2 top-2 rounded-full bg-zinc-950/80 p-1.5 backdrop-blur-sm">
                            <Show when={uploadState.status === "processing"}>
                              <Loader2 class="h-4 w-4 animate-spin text-violet-300" />
                            </Show>
                            <Show when={uploadState.status === "uploading"}>
                              <span class="block min-w-7 text-center text-xs text-violet-200">
                                {Math.round(uploadState.progress)}%
                              </span>
                            </Show>
                            <Show when={uploadState.status === "done"}>
                              <Check class="h-4 w-4 text-green-400" />
                            </Show>
                          </div>
                        </div>
                        <div class="p-2.5">
                          <p class="truncate text-xs text-violet-200" title={uploadState.file.name}>
                            {uploadState.file.name}
                          </p>
                          <Show when={uploadState.status === "ready"}>
                            <p class="mt-1 text-xs text-amber-400">Waiting for a collection</p>
                          </Show>
                          <Show when={uploadState.status === "done" && uploadState.wasDuplicate}>
                            <p class="mt-1 text-xs text-sky-400">Existing photo reused</p>
                          </Show>
                          <Show when={uploadState.error}>
                            <p class="mt-1 line-clamp-2 text-xs text-red-400">
                              {uploadState.error}
                            </p>
                          </Show>
                          <div class="mt-2 flex justify-end gap-1">
                            <Show when={uploadState.status === "error"}>
                              <button
                                onClick={() => retryFile(uploadState)}
                                disabled={selectedCollections().length === 0}
                                class="rounded p-1 text-violet-400 hover:bg-zinc-800 disabled:opacity-40"
                                title="Retry"
                              >
                                <RotateCcw class="h-4 w-4" />
                              </button>
                            </Show>
                            <Show when={uploadState.status !== "uploading"}>
                              <button
                                onClick={() => removeFile(uploadState.id)}
                                class="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                                title="Remove"
                              >
                                <X class="h-4 w-4" />
                              </button>
                            </Show>
                          </div>
                        </div>
                      </article>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </section>
        </div>

        <footer class="flex items-center justify-between border-t border-zinc-800 px-5 py-3 text-sm">
          <span class="text-zinc-500">
            {doneCount()} of {files().length} uploaded
            <Show when={activeCount() > 0}> · {activeCount()} active</Show>
          </span>
          <button
            onClick={closeModal}
            disabled={activeCount() > 0}
            class="rounded bg-violet-600 px-4 py-2 font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-violet-800"
          >
            {activeCount() > 0 ? "Uploading…" : hasUploaded() ? "Done" : "Cancel"}
          </button>
        </footer>
      </div>
    </div>
  );
}
