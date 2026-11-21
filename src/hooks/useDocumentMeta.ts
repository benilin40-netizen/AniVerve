import { useEffect } from 'react';

export type JsonLdNode = Record<string, unknown>;

interface MetaOptions {
  title: string;
  description?: string;
  image?: string | null;
  type?: 'website' | 'article' | 'video.tv_show';
  noindex?: boolean;
  canonicalPath?: string;
  jsonLd?: JsonLdNode | JsonLdNode[] | null;
}

export function useDocumentMeta({
  title,
  description,
  image,
  type = 'website',
  noindex = false,
  canonicalPath,
  jsonLd,
}: MetaOptions) {
  useEffect(() => {
    const fullTitle = title.includes('AniVerve') ? title : `${title} | AniVerve`;
    document.title = fullTitle;

    const setMeta = (
      selector: string,
      attr: 'name' | 'property',
      key: string,
      content?: string | null
    ) => {
      if (!content) return;
      let el = document.querySelector<HTMLMetaElement>(selector);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    const canonicalUrl =
      window.location.origin + (canonicalPath ? canonicalPath : window.location.pathname);
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    setMeta('meta[name="description"]', 'name', 'description', description);
    setMeta('meta[name="robots"]', 'name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
    setMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle);
    setMeta('meta[property="og:description"]', 'property', 'og:description', description);
    setMeta('meta[property="og:type"]', 'property', 'og:type', type);
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', 'AniVerve');
    if (image) {
      setMeta('meta[property="og:image"]', 'property', 'og:image', image);
      setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image);
    }
    setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);

    const existingScript = document.getElementById('dynamic-json-ld');
    if (existingScript) existingScript.remove();
    if (jsonLd) {
      const script = document.createElement('script');
      script.id = 'dynamic-json-ld';
      script.type = 'application/ld+json';
      const payload = Array.isArray(jsonLd)
        ? {
            '@context': 'https://schema.org',
            '@graph': jsonLd.map((node) => {
              const clone = { ...node };
              delete clone['@context'];
              return clone;
            }),
          }
        : jsonLd;
      script.textContent = JSON.stringify(payload);
      document.head.appendChild(script);
    }
  }, [title, description, image, type, noindex, canonicalPath, jsonLd]);
}
