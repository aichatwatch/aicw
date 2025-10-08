export const tipsToShow = [
  'Run this weekly to track changes over time!'
];

export const getRandomTip = () => {
  return tipsToShow[Math.floor(Math.random() * tipsToShow.length)];
};