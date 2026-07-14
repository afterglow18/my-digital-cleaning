import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns a displayable image URL.
 *
 * Local-first: all images are stored as data URLs (e.g. "data:image/jpeg;base64,…").
 * Legacy object-storage paths ("/..." that don't start with "data:") are returned
 * as-is so any migrated items still resolve via the API proxy — though new items
 * will always use data URLs.
 */
export function getImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return path;
}
