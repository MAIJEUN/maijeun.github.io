// ✏️ 사이트 정보는 대부분 이 파일 하나만 고치면 됩니다.

export const SITE = {
  name: 'MAIJEUN',
  title: 'MAIJEUN',
  description: '만들고, 기록하고, 공유합니다.',
  role: '개발자 · 메이커',
  location: 'Seoul, KR',
  email: 'hello@example.com',
  intro: [
    '안녕하세요. 웹을 만들고 그 과정을 기록하는 MAIJEUN입니다.',
    '이곳에는 제가 만든 것들, 생각한 것들, 그리고 저를 찾을 수 있는 곳들을 모아둡니다.',
  ],
};

export const NAV = [
  { href: '/about', label: '소개' },
  { href: '/projects', label: '프로젝트' },
  { href: '/blog', label: '블로그' },
  { href: '/sns', label: 'SNS' },
];

// SNS 페이지 (벤토 카드). 위에서부터 순서대로, 2열 그리드에 채워집니다.
// - service: 아이콘과 색 ('github' | 'youtube' | 'discord' | 'steam' | 'tuforums' | 'link'). link 는 기본 지구본 아이콘
// - wide: true 면 한 줄을 다 씀
// - items: 카드 안의 칸. 2개 이상이면 카드가 나뉨 (첫 칸이 조금 더 넓음)
//   - href: 누르면 이동 / copy: 누르면 이 글자를 복사 (둘 중 하나)
//   - note: 짧은 한 줄 설명 (선택)
export type LinkItem = { title: string; handle: string; href?: string; copy?: string; note?: string };
export type LinkGroup = { service: 'github' | 'youtube' | 'discord' | 'steam' | 'tuforums' | 'link'; wide?: boolean; items: LinkItem[] };

export const LINK_GROUPS: LinkGroup[] = [
  {
    service: 'github',
    wide: true,
    items: [
      { title: 'GitHub', handle: 'github.com/MAIJEUN', href: 'https://github.com/MAIJEUN' },
      { title: 'MIJ Studio', handle: 'github.com/mij-studio', href: 'https://github.com/mij-studio' },
    ],
  },
  {
    service: 'youtube',
    items: [
      { title: 'YouTube', handle: '@maijeun', href: 'https://www.youtube.com/@maijeun' },
      { title: '유매실', handle: '@yougreenplum', href: 'https://www.youtube.com/@yougreenplum' },
    ],
  },
  {
    service: 'discord',
    items: [
      { title: 'Discord', handle: '@maijeun', copy: 'maijeun' },
      { title: 'Server', handle: 'discord.gg/ZyDf6RJrVu', href: 'https://discord.gg/ZyDf6RJrVu' },
    ],
  },
  {
    service: 'steam',
    items: [{ title: 'Steam', handle: 'steamcommunity.com/id/MAIJEUN', href: 'https://steamcommunity.com/id/MAIJEUN/' }],
  },
  {
    service: 'tuforums',
    items: [{ title: 'TUForums', handle: 'tuforums.com/profile/1342', href: 'https://tuforums.com/profile/1342' }],
  },
];

// 다른 곳(소개 페이지 등)에서 쓰는 단순 목록
export const LINKS = LINK_GROUPS.flatMap((g) =>
  g.items.filter((i) => i.href).map((i) => ({ label: i.title, href: i.href!, handle: i.handle })),
);

// 소개 페이지 — 경력/이력
export const EXPERIENCE = [
  { period: '2024 — 현재', title: '프론트엔드 개발자', org: '어떤 회사', note: '웹 서비스 개발과 디자인 시스템 운영' },
  { period: '2022 — 2024', title: '웹 개발자', org: '다른 회사', note: '사내 도구와 고객용 대시보드 개발' },
  { period: '2018 — 2022', title: '컴퓨터공학 학사', org: '어느 대학교', note: '' },
];

export const SKILLS = ['TypeScript', 'React', 'Astro', 'Node.js', 'Figma', 'SQL'];

// 프로젝트 페이지에 표시됩니다. 위에서부터 순서대로. href 는 비워도 됩니다.
export const PROJECTS: { name: string; year: string; description: string; tags: string[]; href: string }[] = [
  // 예) { name: '프로젝트 이름', year: '2026', description: '한두 문장 설명', tags: ['Web'], href: 'https://...' },
];
