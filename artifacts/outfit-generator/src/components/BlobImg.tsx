/**
 * BlobImg — drop-in <img> replacement that converts data: URLs to blob: URLs
 * before rendering.
 *
 * On iOS WKWebView, large base64 strings embedded directly in <img src> spike
 * memory and can kill the WebContent process (→ white screen). Converting to a
 * blob: URL keeps the bytes in a Blob object instead of the DOM, which the OS
 * manages much more efficiently.
 *
 * Non-data URLs (https://, object-storage paths, etc.) are passed through
 * unchanged.
 */
import { useState, useEffect, useRef, type ImgHTMLAttributes } from "react";

function useBlobSrc(src: string | null | undefined): string | undefined {
  const blobUrlRef = useRef<string | null>(null);
  const [resolved, setResolved] = useState<string | undefined>(undefined);

  useEffect(() => {
    // Revoke previous blob URL
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    if (!src) { setResolved(undefined); return; }

    // Pass through non-data URLs immediately
    if (!src.startsWith("data:")) { setResolved(src); return; }

    let cancelled = false;
    fetch(src)
      .then(r => r.blob())
      .then(blob => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setResolved(url);
      })
      .catch(() => {
        // Fall back to the original data URL if conversion fails
        if (!cancelled) setResolved(src);
      });

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setResolved(undefined);
    };
  }, [src]);

  return resolved;
}

type BlobImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined;
};

export function BlobImg({ src, ...rest }: BlobImgProps) {
  const resolved = useBlobSrc(src);
  // eslint-disable-next-line jsx-a11y/alt-text
  return <img src={resolved} {...rest} />;
}
