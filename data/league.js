export const league = {
  name: "Dirty Dozens FFL",
  tagline: "12 Teams. 1 Champion. No Mercy.",
  subtagline: "Bad beats. Big mouths. One champion.",
  season: 2026,
  platform: "ESPN",
  founded: "20XX",
  defendingChampion: "The Price Is Wrong",
  defendingChampionManager: "Luke Erbacher",
  defendingChampionSeason: 2025,
};

export const teams = [
  { id: 1, name: "Incredible D Bags", manager: "Vin Alcee", short: "IDB", logo: "/logos/incredible-d-bags.svg" },
  { id: 2, name: "Pat Tricks", manager: "Antonio Samilton", short: "PAT", logo: "/logos/pat-tricks.svg" },
  { id: 3, name: "Tush Pushers", manager: "Joshua Grant", short: "TUSH", logo: "/logos/tush-pushers.svg" },
  { id: 4, name: "The Price Is Wrong", manager: "Luke Erbacher", short: "PIR", logo: "/logos/the-price-is-wrong.svg" },
  { id: 5, name: "Ginyu Force", manager: "Dominique Hamilton", short: "GF", logo: "/logos/ginyu-force.svg" },
  { id: 6, name: "The Dakstreet Boys", manager: "Trevor McKay", short: "DSB", logo: "/logos/the-dakstreet-boys.svg" },
  { id: 7, name: "Bishop Sycamore Centurions", manager: "Thomas Cargile", short: "BSC", logo: "/logos/bishop-sycamore-centurions.svg" },
  { id: 8, name: "Njigbas in Paris", manager: "Brenden Anderson", short: "NIP", logo: "/logos/njigbas-in-paris.svg" },
  { id: 9, name: "Sorry Not Sorry", manager: "Nicholaus Hancock", short: "SNS", logo: "/logos/sorry-not-sorry.svg" },
  { id: 10, name: "Bucky's Arm", manager: "Dallas Hancock", short: "BUCK", logo: "/logos/buckys-arm.svg" },
  { id: 11, name: "Sammy's Cool Cat Cafe n TD Club", manager: "Sam Clancy", short: "SCC", logo: "/logos/sammys-cool-cat-cafe-n-td-club.svg" },
  { id: 12, name: "Pardon Me, Do U Hv Any GreyBijan", manager: "Joshua Roegiers", short: "GBJ", logo: "/logos/greybijan.svg" },
].map((team) => ({
  ...team,
  wins: 0,
  losses: 0,
  pointsFor: 0,
  pointsAgainst: 0,
  championships: team.name === "The Price Is Wrong" ? 1 : 0,
}));

// Add the official ESPN Week 1 schedule here when available.
export const weeklyMatchups = [];

// Fill this in each week with the highest-scoring team and official ESPN score.
export const weeklyHighScores = [];

// Keep these blank until we add the verified Dirty Dozens record book.
export const records = [
  ["Highest score — regular season", "TBD"],
  ["Lowest score — regular season", "TBD"],
  ["Biggest blowout", "TBD"],
  ["Longest win streak", "TBD"],
  ["Most points in a loss", "TBD"],
  ["Most championships", "TBD"],
];

export const headlines = [
  { title: "2026 Season Loading", deck: "Dirty Dozens FFL is getting ready for another season of bad beats, receipts, and championship dreams." },
  { title: "Power Rankings Coming Soon", deck: "The commissioner's first rankings will land here once the season gets underway." },
  { title: "League Archive Under Construction", deck: "Past champions, records, rivalries, and legendary moments are next on the build list." },
];
