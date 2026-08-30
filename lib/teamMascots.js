const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const mascotByName = {
  incredibledbags: '/mascots/incredible-d-bags.svg',
  pattricks: '/mascots/pat-tricks.svg',
  tushpushers: '/mascots/tushpushers.svg',
  thepriceiswrong: '/mascots/the-price-is-wrong.svg',
  ginyuforce: '/mascots/ginyu-force.svg',
  thedakstreetboys: '/mascots/the-dakstreet-boys.svg',
  bishopsycamorecenturions: '/mascots/bishop-sycamore-centurions.svg',
  njigbasinparis: '/mascots/njigbas-in-paris.svg',
  sorrynotsorry: '/mascots/sorry-not-sorry.svg',
  buckysarm: '/mascots/buckys-arm.svg',
  sammyscoolcatcafentdclub: '/mascots/sammys-cool-cat-cafe-n-td-club.svg',
  pardnmedouhvanygreybijan: '/mascots/pardn-me-do-u-hv-any-greybijan.svg',
};

export function mascotForTeam(name, fallback = '') {
  return mascotByName[normalize(name)] || fallback || '';
}
