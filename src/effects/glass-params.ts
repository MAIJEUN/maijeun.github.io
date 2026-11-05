// 유리 로고 셰이더(logo.wgsl)의 Params 초기값.
// 셰이더에 값을 추가하면 여기에도 꼭 추가해야 합니다 (빠지면 유리 로고가 켜지지 않음).
// `npm run check:glass` 가 배포 전에 이 목록이 셰이더와 맞는지 검사합니다.
export const INITIAL_PARAMS = {
  res: [1, 1],
  center: [0, 0],
  light: [0, 0],
  axisU: [1, 0, 0, 0],
  axisV: [0, 1, 0, 0],
  axisW: [0, 0, 1, 0],
  box: 1,
  range: 1,
  time: 0,
  intro: 1,
  solid: 1,
  thick: 0,
  bgA: 1,
  aa: 1,
  fg: [0, 0, 0, 1],
  bg: [1, 1, 1, 1],
};
