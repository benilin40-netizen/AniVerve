import React, { useEffect, useRef, useState } from 'react';
import { Film } from 'lucide-react';

interface SafeImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null;
  fallbackSrc?: string | null;
  fallbackLabel?: string;
  fetchPriority?: 'high' | 'low' | 'auto';
}

export function SafeImage({
  src,
  fallbackSrc,
  fallbackLabel,
  alt,
  className = '',
  decoding = 'async',
  fetchPriority,
  onLoad,
  onError,
  ...rest
}: SafeImageProps) {
  const [failed, setFailed] = useState(false);
  const [usedFallbackSrc, setUsedFallbackSrc] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const activeSrc = !failed ? src : !usedFallbackSrc && fallbackSrc ? fallbackSrc : undefined;

  useEffect(() => {
    setFailed(false);
    setUsedFallbackSrc(false);
    setLoaded(false);
  }, [src, fallbackSrc]);

  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [activeSrc]);

  if (!activeSrc) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-[#1A1B24] dark:to-[#111218] text-zinc-500 dark:text-zinc-500 p-4 text-center ${className}`}
        role="img"
        aria-label={alt || fallbackLabel || 'Anime artwork'}
      >
        <Film className="h-6 w-6 mb-2 opacity-60" />
        {fallbackLabel && (
          <span className="text-xs font-medium line-clamp-2 max-w-[14ch]">{fallbackLabel}</span>
        )}
      </div>
    );
  }

  return (
    <img
      ref={imgRef}
      src={activeSrc}
      alt={alt || ''}
      decoding={decoding}
      referrerPolicy="no-referrer"
      fetchPriority={fetchPriority}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      onError={(e) => {
        setLoaded(false);
        if (!failed) {
          setFailed(true);
        } else {
          setUsedFallbackSrc(true);
        }
        onError?.(e);
      }}
      className={`${className} transition-opacity duration-300 ease-out ${
        loaded ? 'opacity-100' : 'opacity-0'
      }`}
      {...rest}
    />
  );
}
