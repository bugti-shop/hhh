import { useEffect } from 'react';

const SITE_ORIGIN = 'https://www.flowist.me';

interface PageMeta {
  title: string;
  description: string;
  path: string;
}

/**
 * Lightweight per-route head manager. Sets <title>, meta description,
 * canonical, og:title/description/url, and twitter equivalents. Restores
 * the original sitewide values on unmount so each route owns its own meta.
 */
export function usePageMeta({ title, description, path }: PageMeta) {
  useEffect(() => {
    const canonicalHref = `${SITE_ORIGIN}${path}`;

    const setMeta = (selector: string, attr: string, value: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(selector);
      if (!el) {
        el = document.createElement('meta');
        const [, key, name] = selector.match(/^meta\[(name|property)="([^"]+)"\]$/) || [];
        if (key && name) el.setAttribute(key, name);
        document.head.appendChild(el);
      }
      el.setAttribute(attr, value);
    };

    const prevTitle = document.title;
    const prevDesc = document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.content || '';
    const canonicalEl = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const prevCanonical = canonicalEl?.href || '';
    const prevOgTitle = document.head.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content || '';
    const prevOgDesc = document.head.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content || '';
    const prevOgUrl = document.head.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content || '';
    const prevTwTitle = document.head.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.content || '';
    const prevTwDesc = document.head.querySelector<HTMLMetaElement>('meta[name="twitter:description"]')?.content || '';

    document.title = title;
    setMeta('meta[name="description"]', 'content', description);
    if (canonicalEl) canonicalEl.href = canonicalHref;
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[property="og:url"]', 'content', canonicalHref);
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', description);

    return () => {
      document.title = prevTitle;
      if (prevDesc) setMeta('meta[name="description"]', 'content', prevDesc);
      if (canonicalEl && prevCanonical) canonicalEl.href = prevCanonical;
      if (prevOgTitle) setMeta('meta[property="og:title"]', 'content', prevOgTitle);
      if (prevOgDesc) setMeta('meta[property="og:description"]', 'content', prevOgDesc);
      if (prevOgUrl) setMeta('meta[property="og:url"]', 'content', prevOgUrl);
      if (prevTwTitle) setMeta('meta[name="twitter:title"]', 'content', prevTwTitle);
      if (prevTwDesc) setMeta('meta[name="twitter:description"]', 'content', prevTwDesc);
    };
  }, [title, description, path]);
}
