import { getCollection } from 'astro:content';

export async function getPosts() {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** 읽는 시간 (분). 한국어 기준 1분에 약 500자, 코드 블록은 제외 */
export function readingMinutes(body?: string) {
  const text = (body ?? '').replace(/```[\s\S]*?```/g, '').replace(/\s+/g, '');
  return Math.max(1, Math.round(text.length / 500));
}

export const formatDate = (d: Date) =>
  `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
