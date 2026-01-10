import { createSignal } from "solid-js";
import type { Collection } from "~/db/schema";

// Shared store for collections (cached across navigation)
const [collections, setCollections] = createSignal<Collection[]>([]);
const [collectionsLoaded, setCollectionsLoaded] = createSignal(false);

// Session storage key prefix for tracking if animations have played per collection
const ANIMATIONS_PLAYED_PREFIX = "gallery-animations-played-";

export function useCollections() {
  return {
    collections,
    collectionsLoaded,
    async loadCollections() {
      if (collectionsLoaded()) return; // Already loaded

      try {
        const res = await fetch("/api/collections");
        if (res.ok) {
          const data = await res.json();
          setCollections(data);
        }
      } catch (e) {
        console.error("Failed to fetch collections:", e);
      }
      setCollectionsLoaded(true);
    },
  };
}

export function shouldPlayAnimations(collectionId?: string): boolean {
  if (typeof window === "undefined") return false;

  const key = collectionId
    ? `${ANIMATIONS_PLAYED_PREFIX}${collectionId}`
    : ANIMATIONS_PLAYED_PREFIX;
  const hasPlayed = sessionStorage.getItem(key);
  if (!hasPlayed) {
    sessionStorage.setItem(key, "true");
    return true;
  }
  return false;
}
