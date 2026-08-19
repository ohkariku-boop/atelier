/** Lightweight document head updates (no react-helmet dependency). */

export function setPageMeta(opts: {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
}) {
  if (opts.title) {
    document.title = opts.title;
    setMetaProperty('og:title', opts.title);
    setMetaName('twitter:title', opts.title);
  }
  if (opts.description) {
    setMetaName('description', opts.description);
    setMetaProperty('og:description', opts.description);
    setMetaName('twitter:description', opts.description);
  }
  if (opts.image) {
    setMetaProperty('og:image', opts.image);
    setMetaName('twitter:image', opts.image);
  }
  if (opts.url) {
    setMetaProperty('og:url', opts.url);
  }
}

function setMetaName(name: string, content: string) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setMetaProperty(property: string, content: string) {
  let el = document.querySelector(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function resetPageMeta() {
  document.title = 'Atelier — Human Art Auctions';
  setMetaName(
    'description',
    'Premium live auction marketplace for 100% human-made, hand-crafted physical art. Studio-verified. No AI.'
  );
}
