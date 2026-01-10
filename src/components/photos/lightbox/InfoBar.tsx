import { ZoomIn, ZoomOut, Info, Download, Share } from "lucide-solid";
import { createSignal } from "solid-js";
import { formatDate } from "~/utils/date";
import { S3_PREFIX, type GalleryPhoto } from "~/types/photo";
import { type ExifData } from "~/types/exif";

interface InfoBarProps {
  photo: () => GalleryPhoto;
  exif: () => ExifData;
  isMobile: () => boolean;
  isZoomMode: () => boolean;
  setIsZoomMode: (v: boolean) => void;
  setDrawerOpen: (v: boolean) => void;
}

export function InfoBar({
  photo,
  exif,
  isMobile,
  isZoomMode,
  setIsZoomMode,
  setDrawerOpen,
}: InfoBarProps) {
  const [showCopiedPopover, setShowCopiedPopover] = createSignal(false);
  const [hoveredButton, setHoveredButton] = createSignal<string | null>(null);

  const copyImageLink = async () => {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("image", photo().url);

    try {
      await navigator.clipboard.writeText(currentUrl.toString());
      setShowCopiedPopover(true);

      // Hide popover after 2 seconds
      setTimeout(() => {
        setShowCopiedPopover(false);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  };

  const downloadImage = () => {
    fetch(`${S3_PREFIX}${photo().url}`)
      .then((response) => response.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = photo().url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      });
  };

  const ButtonWithPopover = (props: {
    label: string;
    children: any;
    onClick: () => void;
    buttonId: string;
  }) => (
    <div
      class="relative"
      onMouseEnter={() => setHoveredButton(props.buttonId)}
      onMouseLeave={() => setHoveredButton(null)}
    >
      <div onClick={props.onClick}>{props.children}</div>
      {hoveredButton() === props.buttonId && (
        <div class="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-10">
          {props.label}
          <div class="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-800"></div>
        </div>
      )}
    </div>
  );

  return (
    <span class="text-xs text-violet-200 font-mono flex flex-col sm:flex-row justify-between w-full p-1">
      <div class="flex flex-col sm:flex-row sm:gap-2">
        <div class="border-violet-300 max-w-xs sm:max-w-none mx-auto">
          {photo().date ? formatDate(photo().date) : ""}
          {exif().iso && <span> | ISO {exif().iso} |</span>}
          {exif().shutter && <span> {exif().shutter}s |</span>}
          {exif().aperture && <span> {exif().aperture} |</span>}
          {exif().focalLength && <span> {exif().focalLength} </span>}
        </div>
      </div>
      <div class="flex justify-center mt-1 sm:mt-0 gap-1 relative select-none">
        {!isMobile() &&
          (!isZoomMode() ? (
            <ButtonWithPopover
              label="Zoom in"
              buttonId="zoom-in"
              onClick={() => setIsZoomMode(true)}
            >
              <ZoomIn class="inline h-4 w-4 cursor-pointer hover:text-purple-400" />
            </ButtonWithPopover>
          ) : (
            <ButtonWithPopover
              label="Zoom out"
              buttonId="zoom-out"
              onClick={() => setIsZoomMode(false)}
            >
              <ZoomOut class="inline h-4 w-4 cursor-pointer hover:text-purple-400" />
            </ButtonWithPopover>
          ))}
        <ButtonWithPopover
          label="View details"
          buttonId="info"
          onClick={() => setDrawerOpen(true)}
        >
          <Info class="inline h-4 w-4 cursor-pointer hover:text-purple-400" />
        </ButtonWithPopover>
        <ButtonWithPopover
          label="Share image"
          buttonId="share"
          onClick={copyImageLink}
        >
          <Share class="inline h-4 w-4 cursor-pointer hover:text-purple-400" />
          {showCopiedPopover() && (
            <div class="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-20">
              Link copied!
              <div class="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-800"></div>
            </div>
          )}
        </ButtonWithPopover>
        <ButtonWithPopover
          label="Download image"
          buttonId="download"
          onClick={downloadImage}
        >
          <Download class="inline h-4 w-4 cursor-pointer hover:text-purple-400" />
        </ButtonWithPopover>
      </div>
    </span>
  );
}
