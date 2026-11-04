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
  { href: '/links', label: '링크' },
];

// 링크 페이지에 표시됩니다. 위에서부터 순서대로.
// 예) { label: 'Instagram', href: 'https://instagram.com/아이디', handle: '@아이디' }
//     { label: 'Email', href: 'mailto:me@example.com', handle: 'me@example.com' }
export const LINKS = [
  { label: 'GitHub', href: 'https://github.com/MAIJEUN', handle: '@MAIJEUN' },
];

// 소개 페이지 — 경력/이력
export const EXPERIENCE = [
  { period: '2024 — 현재', title: '프론트엔드 개발자', org: '어떤 회사', note: '웹 서비스 개발과 디자인 시스템 운영' },
  { period: '2022 — 2024', title: '웹 개발자', org: '다른 회사', note: '사내 도구와 고객용 대시보드 개발' },
  { period: '2018 — 2022', title: '컴퓨터공학 학사', org: '어느 대학교', note: '' },
];

export const SKILLS = ['TypeScript', 'React', 'Astro', 'Node.js', 'Figma', 'SQL'];

// 프로젝트 페이지에 표시됩니다. 위에서부터 순서대로. href 는 비워도 됩니다.
export const PROJECTS = [
  {
    name: 'maijeun.github.io',
    year: '2026',
    description: '이 사이트. Astro로 만들고, 메인 로고는 vgpu(WebGPU)로 그린 유리 블럭입니다.',
    tags: ['Astro', 'WebGPU', 'vgpu'],
    href: 'https://github.com/MAIJEUN/maijeun.github.io',
  },
];
