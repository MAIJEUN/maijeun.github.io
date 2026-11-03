# maijeun.github.io

MIJ Studio 개인 사이트. [Astro](https://astro.build)로 만들고 GitHub Pages로 배포합니다.

메인 페이지에는 로고 하나만 있습니다. 로고는 [vgpu](https://vgpu.sh)(WebGPU) 셰이더로 그린 **유리 로고**입니다.

- 로고가 마우스 쪽을 바라보도록 3D로 기울어집니다.
- 둥근 유리 단면에 굴절, 프리즘 무지개빛, 반사, 프레넬이 들어갑니다.
- 커서가 광원이 되어 하이라이트가 표면을 따라 움직입니다.
- 바닥에 그림자가 생기고, 로고가 기울면 그림자도 같이 움직입니다.
- 마우스 입력이 없으면 혼자 천천히 흔들립니다. 안드로이드에서는 폰 기울기를 따라갑니다.
- 라이트/다크 모드를 따라갑니다.
- WebGPU를 지원하지 않는 브라우저나 '동작 줄이기' 설정에서는 원본 SVG 로고가 그대로 보입니다.

## 파일 구성

| 무엇 | 파일 |
| --- | --- |
| 메인 페이지 | `src/pages/index.astro` |
| 로고 효과 셰이더 (WGSL) | `src/effects/logo.wgsl` |
| 로고 효과 실행 코드 (마우스·기울기·애니메이션) | `src/effects/glass-logo.ts` |
| 로고 모양 → 거리장(SDF) 변환 | `src/effects/logo-sdf.ts` |
| 로고 원본 | `public/logo.svg` |
| 이름, 소개, 링크, 경력, 프로젝트 | `src/data/site.ts` |
| 블로그 글 | `src/content/blog/*.md` |

`/about`, `/projects`, `/blog`, `/links` 페이지도 들어 있습니다. 메인에서 이 페이지들로 가는 링크는 아직 없습니다.

### 효과 조절

`src/effects/logo.wgsl`에서 바꿀 수 있는 값:

- `MAX_TILT`: 최대 기울기. 0.5는 약 27°입니다.
- `PERSPECTIVE`: 원근감. 작을수록 원근이 강해집니다.
- `let bevel = scale * 11.0;`: 유리 가장자리가 둥근 정도입니다.
- `1.0 / 1.42`, `1.47`, `1.53`: 채널별 굴절률입니다. 값들의 차이가 클수록 무지개빛이 강해집니다.
- `0.16 * params.intro`: 그림자 진하기입니다.

`src/effects/glass-logo.ts`에서 바꿀 수 있는 값:

- `spring(40)`: 마우스를 따라가는 속도
- 하이라이트를 따라가는 속도

## 로컬 실행

```bash
npm install
npm run dev        # http://localhost:4321
```

## 배포

`main` 브랜치에 push하면 GitHub Actions(`.github/workflows/deploy.yml`)가 빌드해서 https://maijeun.github.io 에 올립니다.

처음 한 번은 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정해야 합니다.
