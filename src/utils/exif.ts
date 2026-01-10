import ExifReader from "exifreader";

export const extractExif = (buffer: ArrayBuffer, size?: number) => {
    try {
        const tags = ExifReader.load(buffer);
        const make = tags.Make?.description || "";
        const model = tags.Model?.description || "";
        const camera = make && model ? `${make} ${model}` : make || model;
        const width = tags["Image Width"]?.value;
        const height = tags["Image Height"]?.value;
        const megapixels =
            width && height ? ((width * height) / 1_000_000).toFixed(1) : null;
        return {
            camera,
            iso: tags.ISOSpeedRatings?.description,
            shutter: tags.ExposureTime?.description,
            aperture: tags.FNumber?.description,
            focalLength: tags.FocalLength35efl?.description,
            lensModel: tags.LensModel?.description,
            width,
            height,
            megapixels,
            size,
        };
    } catch (err) {
        return {};
    }
};
