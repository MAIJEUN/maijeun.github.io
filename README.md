# maijeun.github.io

MIJ Studio 개인 사이트. [Astro](https://astro.build)로 만들고 GitHub Pages로 배포합니다.

메인 페이지에는 로고 하나만 있습니다. 로고는 [vgpu](https://vgpu.sh)(WebGPU) 셰이더로 레이마칭해서 그린 **유리 블럭**입니다.

- 로고 외곽선을 두께 있게 돌출시켰습니다. 앞뒤 면은 평평하고 모서리는 90°로 각진 블럭 모양입니다.
- 마우스 쪽을 바라보도록 3D로 기울어지고, 기울면 옆면이 보입니다.
- 클릭하거나 탭하면 한 바퀴 돕니다.
- 빛이 블럭에 들어갈 때와 나올 때 각각 굴절합니다. 나올 때 색마다 꺾이는 정도가 달라 가장자리에 무지개빛이 생깁니다.
- 표면에 반사와 프레넬이 들어가고, 시간에 따라 빛줄기가 천천히 지나갑니다.
- 커서가 광원이 되어 하이라이트를 만듭니다.
- 커서가 바닥을 비추는 조명이 됩니다. 블럭 아래에 그림자와 커스틱(유리를 통과한 빛의 맺힘)이 생기고, 마우스를 움직이면 함께 움직입니다.
  - 옆벽 쪽은 어두운 띠가 되고, 그 안쪽에는 빛이 모인 밝은 선이 일렁입니다.
  - 색마다 꺾이는 정도가 달라 무지개빛이 납니다.
- 로고 주변의 옅은 점 격자가 유리를 통해 굴절되어 보입니다.
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
| `LIGHT_HEIGHT` | 커서 조명 높이. 낮을수록 그림자와 빛 무늬가 길게 늘어집니다. |
| `CAUSTIC_STRENGTH` | 빛 맺힘 세기 |
| `CAUSTIC_SPREAD` | 빛 맺힘의 무지개 퍼짐 |

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
