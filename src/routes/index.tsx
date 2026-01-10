import { Title } from "@solidjs/meta";
import { manifest } from "~/constants/photos";
import { Gallery as GalleryComponent } from "~/components/photos/Gallery";

export default function Index() {
    return (
        <>
            <Title>Gallery</Title>
            <GalleryComponent
                manifest={manifest}
                caption="a collection of some photos I took that I like :)"
                seed={46}
            />
        </>
    );
}
