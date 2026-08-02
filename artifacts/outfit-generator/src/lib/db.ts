/**
 * Local IndexedDB database for My Digital Cleaning.
 *
 * Works in both the browser (Replit preview) and in the Capacitor iOS WebView —
 * IndexedDB is natively available in both environments and persists to the
 * app's sandboxed storage on-device.
 *
 * Schema v1:
 *   clothing_items  — wardrobe items with embedded image data URLs
 *   saved_outfits   — named outfit collections
 *   outfit_items    — junction: outfit ↔ clothing item
 *   settings        — key/value store for app preferences
 *
 * Schema v2 (migration):
 *   clothing_items gains: visionLabels, visionText, visionVersion
 *   (no structural change — fields default to undefined on old records)
 */

import { openDB, type IDBPDatabase } from "idb";

export const DB_NAME    = "my-digital-suitcase";
export const DB_VERSION = 2;

// ── Stored types (IndexedDB records) ─────────────────────────────────────────

export interface StoredClothingItem {
  id?:            number;        // auto-incremented
  name:           string;
  category:       string;        // "outfits" | "beauty" | "toiletries" | "essentials"
  imageObjectPath: string | null; // JPEG data URL  (e.g. "data:image/jpeg;base64,...")
  isFavorite:     boolean;
  timesWorn:      number;
  color?:         string | null;
  brand?:         string | null;
  size?:          string | null;
  season?:        string | null;
  occasion?:      string | null;
  purchasePrice?: string | null;
  purchaseDate?:  string | null;
  notes?:         string | null;
  hasBeenCleaned?: boolean | null;
  // v2 — photo analysis fields (undefined on old records; use ?? [] / ?? 0)
  visionLabels?:  string[] | null;
  visionText?:    string[] | null;
  visionVersion?: number | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface StoredOutfit {
  id?:            number;
  name:           string;
  notes?:         string | null;
  lastUsedDate?:  string | null;  // "YYYY-MM-DD" local date, null if never logged
  createdAt:      string;
}

export interface StoredOutfitItem {
  id?:             number;
  outfitId:        number;
  clothingItemId:  number;
}

export interface StoredSetting {
  key:   string;
  value: string;
}

// ── Public types (consumed by hooks and pages) ────────────────────────────────

export interface ClothingItem extends Required<StoredClothingItem> {
  id: number;
}

export interface SavedOutfit {
  id:            number;
  name:          string;
  notes?:        string | null;
  lastUsedDate?: string | null;  // "YYYY-MM-DD" local date, null if never logged
  createdAt:     string;
  items:         ClothingItem[];
}

// ── Singleton DB connection ───────────────────────────────────────────────────

let _db: IDBPDatabase | null = null;

export async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db;

  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // ── v1 stores ──────────────────────────────────────────────────────────
      if (oldVersion < 1) {
        // clothing_items
        if (!db.objectStoreNames.contains("clothing_items")) {
          const store = db.createObjectStore("clothing_items", {
            keyPath:       "id",
            autoIncrement: true,
          });
          store.createIndex("by_category", "category");
          store.createIndex("by_favorite", "isFavorite");
        }

        // saved_outfits
        if (!db.objectStoreNames.contains("saved_outfits")) {
          db.createObjectStore("saved_outfits", {
            keyPath:       "id",
            autoIncrement: true,
          });
        }

        // outfit_items
        if (!db.objectStoreNames.contains("outfit_items")) {
          const store = db.createObjectStore("outfit_items", {
            keyPath:       "id",
            autoIncrement: true,
          });
          store.createIndex("by_outfit", "outfitId");
          store.createIndex("by_item",   "clothingItemId");
        }

        // settings
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
      }

      // ── v2: visionLabels / visionText / visionVersion added to items ───────
      // No new object stores or indexes needed — fields are optional on records.
      // Existing records simply won't have them until the background indexer runs.
      // (oldVersion < 2 intentionally left as a no-op structural migration)
    },

    blocked() {
      console.warn("[DB] Upgrade blocked — close other tabs");
    },

    blocking() {
      _db?.close();
      _db = null;
    },
  });

  return _db;
}
