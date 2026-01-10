export interface ExifData {
    camera?: string;
    iso?: string;
    shutter?: string;
    aperture?: string;
    focalLength?: string;
    lensModel?: string;
    width?: number;
    height?: number;
    megapixels?: string | null;
    size?: number; // in bytes
}
