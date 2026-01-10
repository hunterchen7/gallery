import { Camera, Aperture, Image, Telescope, Clock, File } from "lucide-solid";
import { formatDate } from "~/utils/date";
import { type GalleryPhoto, S3_PREFIX } from "~/types/photo";
import { type ExifData } from "~/types/exif";
import { Show } from "solid-js";

interface DrawerContentProps {
  photo: () => GalleryPhoto;
  exif: () => ExifData;
}

export function DrawerContent({ photo, exif }: DrawerContentProps) {
  return (
    <>
      <h2 class="text-lg text-violet-200 mb-4">Photo Info</h2>
      <div class="text-xs md:text-sm text-violet-200 space-y-2 text-left">
        <Show when={photo().url}>
          {(url) => (
            <div class="flex gap-2">
              <File class="w-4 h-4 mt-[2px]" />
              <a
                href={`${S3_PREFIX}${url()}`}
                target="_blank"
                rel="noopener noreferrer"
                class="hover:text-purple-400 break-all underline"
              >
                {url()}
              </a>
              <div>
                <Show when={exif()?.size}>
                  {(size) => `(${(size() / 1024 / 1024).toFixed(2)} MB)`}
                </Show>
              </div>
            </div>
          )}
        </Show>
        <Show when={photo().date}>
          {(date) => (
            <div class="flex gap-2">
              <Clock class="w-4 h-4 mt-[2px]" />
              {formatDate(date())}
            </div>
          )}
        </Show>
        <Show when={exif()?.camera}>
          {(camera) => (
            <div class="flex gap-2">
              <Camera class="w-4 h-4 mt-0.5" />
              {camera()}
            </div>
          )}
        </Show>
        <Show when={exif()?.lensModel}>
          {(lensModel) => (
            <div class="flex gap-2">
              <Telescope class="w-4 h-4 mt-0.5" />
              {lensModel()}
            </div>
          )}
        </Show>
        <Show
          when={
            exif()?.shutter ||
            exif()?.aperture ||
            exif()?.iso ||
            exif()?.focalLength
          }
        >
          <div class="flex space-x-2 justify-left">
            <Aperture class="w-4 h-4 mt-0.5" />
            <Show when={exif()?.shutter}>
              {(shutter) => <div>{shutter()}s</div>}
            </Show>
            <Show when={exif()?.aperture}>
              {(aperture) => <div>{aperture()}</div>}
            </Show>
            <Show when={exif()?.iso}>{(iso) => <div>ISO{iso()}</div>}</Show>
            <Show when={exif()?.focalLength}>
              {(focalLength) => <div>{focalLength()}</div>}
            </Show>
          </div>
        </Show>
        <Show when={exif()?.width && exif()?.height}>
          <div class="flex gap-2">
            <Image class="w-4 h-4" />
            {exif().width} x {exif().height} ({exif().megapixels} MP)
          </div>
        </Show>
      </div>
      <div class="mt-auto text-sm text-gray-500 mb-4">2025 - Hunter Chen</div>
    </>
  );
}
