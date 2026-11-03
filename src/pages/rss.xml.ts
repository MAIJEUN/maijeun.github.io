import type { APIContext } from 'astro';
import { SITE } from '../data/site';
import { getPosts } from '../lib';

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

export async function GET({ site }: APIContext) {
  const posts = await getPosts();
  const items = posts.map((p) => {
    const url = new URL(`/blog/${p.id}`, site).href;
    return `<item><title>${esc(p.data.title)}</title><link>${url}</link><guid>${url}</guid><pubDate>${p.data.date.toUTCString()}</pubDate>${p.data.description ? `<description>${esc(p.data.description)}</description>` : ''}</item>`;
  }).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(SITE.name)}</title><link>${site}</link><description>${esc(SITE.description)}</description><language>ko</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
