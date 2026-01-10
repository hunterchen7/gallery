import { LoadingSpinner } from "../../LoadingSpinner";

interface LoaderProps {
    downloadProgress: () => { loaded: number; total: number };
}

export function Loader({ downloadProgress }: LoaderProps) {
    return (
        <span class="absolute inset-0 flex flex-col items-center justify-center z-3">
            <div class="bg-gray-900/50 px-2 pb-2 rounded-lg flex items-center">
                <LoadingSpinner className="h-12 w-12 -mt-4" />
                {downloadProgress().total > 0 && (
                    <span class="text-violet-200 text-xs font-mono mt-18">
                        {Math.round(downloadProgress().loaded / 1024)}/
                        {Math.round(downloadProgress().total / 1024)} KB
                    </span>
                )}
            </div>
        </span>
    );
}
