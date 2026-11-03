# maijeun.github.io

MIJ Studio 개인 사이트. [Astro](https://astro.build)로 만들고 GitHub Pages로 배포합니다.

메인 페이지에는 로고 하나만 있습니다. 로고는 [vgpu](https://vgpu.sh)(WebGPU)로 그린 '액체' 효과입니다.

- 처음 열면 액체 방울들이 모여 로고가 됩니다.
- 가장자리가 천천히 일렁입니다.
- 마우스 커서(모바일은 터치)가 작은 물방울이 되어 로고에 가까이 가면 끈적하게 합쳐집니다.
- 라이트/다크 모드를 따라갑니다.
- WebGPU를 지원하지 않는 브라우저나 '동작 줄이기' 설정에서는 원본 SVG 로고가 그대로 보입니다.

## 파일 구성

| 무엇 | 파일 |
| --- | --- |
| 메인 페이지 | `src/pages/index.astro` |
| 로고 효과 셰이더 (WGSL) | `src/effects/logo.wgsl` |
| 로고 효과 실행 코드 | `src/effects/liquid-logo.ts` |
| 로고 모양 → 거리장(SDF) 변환 | `src/effects/logo-sdf.ts` |
| 로고 원본 | `public/logo.svg` |
| 이름, 소개, 링크, 경력, 프로젝트 | `src/data/site.ts` |
| 블로그 글 | `src/content/blog/*.md` |

`/about`, `/projects`, `/blog`, `/links` 페이지도 들어 있습니다. 메인에서 이 페이지들로 가는 링크는 아직 없습니다.

### 효과 조절

`src/effects/logo.wgsl`에서 아래 숫자를 바꾸면 됩니다.

- `d += n * scale * 0.5;` 숫자가 클수록 가장자리가 더 크게 일렁입니다.
- `params.drop * scale * 7.0` 숫자가 클수록 커서 물방울이 커집니다.
- `scale * 16.0 * params.drop` 숫자가 클수록 물방울과 로고가 더 끈적하게 붙습니다.

등장 시간은 `src/effects/liquid-logo.ts`의 `t / 1.8`(초)입니다.

## 로컬 실행

```bash
npm install
npm run dev        # http://localhost:4321
```

## 배포

`main` 브랜치에 push하면 GitHub Actions(`.github/workflows/deploy.yml`)가 빌드해서 https://maijeun.github.io 에 올립니다.

처음 한 번은 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정해야 합니다.
