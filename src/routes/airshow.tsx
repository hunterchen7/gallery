import { Title, Meta } from "@solidjs/meta";
import { Gallery } from "~/components/photos/Gallery";
import { manifest } from "~/constants/airshow";

export default function AirshowGallery() {
    const previewImage = "https://photos.hunterchen.ca/HC_06821.jpg";

    return (
        <>
            <Title>London Airshow</Title>
            <Meta property="og:title" content="London Airshow" />
            <Meta
                property="og:description"
                content="Hunter's photos from 2025 london airshow 🛩️"
            />
            <Meta property="og:type" content="website" />
            <Meta property="og:image" content={previewImage} />
            <Meta property="og:image:alt" content="London Airshow photo" />

            <Meta name="twitter:card" content="summary_large_image" />
            <Meta name="twitter:title" content="London Airshow" />
            <Meta
                name="twitter:description"
                content="Hunter's photos from 2025 london airshow 🛩️"
            />
            <Meta name="twitter:image" content={previewImage} />

            <Gallery
                manifest={manifest}
                caption={
                    <>
                        favourite photos from{" "}
                        <a
                            href="https://airshowlondon.com/"
                            class="underline hover:text-violet-300 text-violet-400"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            airshow london 2025 🛩️
                        </a>{" "}
                        (borrowed a Sony FE 200-600mm G 💜)
                    </>
                }
                seed={354}
            />
        </>
    );
}
