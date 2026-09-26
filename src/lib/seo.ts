const SITE_URL = 'https://react-boxbox.vercel.app';
const SITE_NAME = 'boxbox';
const DEFAULT_IMAGE = '/og/default.png';

export type SeoInput = {
  title: string;
  description: string;
  path: string;
  image?: string;
};

export type SeoMeta =
  | { title: string }
  | { name: string; content: string }
  | {
      property: string;
      content: string;
    };

function absoluteUrl(pathOrUrl: string) {
  return pathOrUrl.startsWith('http') ? pathOrUrl : `${SITE_URL}${pathOrUrl}`;
}

export function seo({ title, description, path, image = DEFAULT_IMAGE }: SeoInput): SeoMeta[] {
  const url = absoluteUrl(path);
  const imageUrl = absoluteUrl(image);

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: SITE_NAME },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { property: 'og:image', content: imageUrl },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: imageUrl },
  ];
}
