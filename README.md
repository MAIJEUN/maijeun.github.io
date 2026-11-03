# maijeun.github.io

MIJ Studio 개인 사이트. [Astro](https://astro.build)로 만들고 GitHub Pages로 배포합니다.

메인 페이지에는 로고 하나만 있습니다. 로고는 [vgpu](https://vgpu.sh)(WebGPU) 셰이더로 레이마칭해서 그린 **유리 블럭**입니다.

- 로고 외곽선을 두께 있게 돌출시켰습니다. 앞뒤 면은 평평하고 모서리는 90°로 각진 블럭 모양입니다.
- 마우스 쪽을 바라보도록 3D로 기울어지고, 기울면 옆면이 보입니다.
- 클릭하거나 탭하면 한 바퀴 돕니다.
- 빛이 블럭에 들어갈 때와 나올 때 각각 굴절합니다. 나올 때 색마다 꺾이는 정도가 달라 가장자리에 무지개빛이 생깁니다.
- 애플 리퀴드 글래스처럼 앞면 가운데는 평평하고 가장자리만 렌즈처럼 휘어 있습니다. 그래서 가장자리 근처에서 뒤에 있는 것이 크게 굴절돼 보입니다.
- 가장자리에 가는 빛선이 생깁니다. 커서 쪽을 향한 가장자리가 가장 밝고, 반대쪽도 은은하게 빛납니다.
- 경계가 또렷한 스튜디오 조명이 비쳐서 플라스틱이 아닌 유리처럼 보입니다. 커서를 움직이면 조명 반사가 따라 미끄러지고, 빛줄기도 천천히 지나갑니다.
- 바닥에 그림자가 생기고, 유리를 통과한 빛이 커스틱(색깔 빛 맺힘)을 만듭니다. 로고 주변의 옅은 점 격자는 유리를 통해 굴절되어 보입니다.
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

`src/effects/logo.wgsl` 맨 위의 상수:

| 상수 | 뜻 |
| --- | --- |
| `DEPTH` | 블럭 두께의 절반 (로고 단위, viewBox 128 기준) |
| `IOR` | 굴절률 |
| `DISPERSION` | 무지개빛 강도 |
| `TINT` | 유리 색. 두꺼울수록 진해집니다. |
| `PERSPECTIVE` | 원근감. 작을수록 원근이 강해집니다. |
| `FLOAT` | 바닥에서 떠 있는 높이 |
| `AA_SAMPLES` | 모서리 안티앨리어싱. 0이면 꺼지고 조금 가벼워집니다. |
| `LENS_WIDTH`, `LENS` | 리퀴드 글래스 가장자리 렌즈의 폭과 휘는 세기 |
| `RIM_WIDTH`, `RIM_STRENGTH` | 가장자리 빛선의 두께와 밝기 |
| `GLASS_LIFT` | 다크 모드에서 유리 몸통을 살짝 밝게 띄우는 정도 |

`src/effects/glass-logo.ts`에서 바꿀 수 있는 값:

- `MAX_TILT`: 최대 기울기
- `spring(...)`: 따라가는 속도
- `click` 처리: 클릭했을 때 회전

## 로컬 실행

```bash
npm install
npm run dev        # http://localhost:4321
```

## 배포

`main` 브랜치에 push하면 GitHub Actions(`.github/workflows/deploy.yml`)가 빌드해서 https://maijeun.github.io 에 올립니다.

처음 한 번은 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정해야 합니다.
