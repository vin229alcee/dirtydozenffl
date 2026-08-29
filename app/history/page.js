import PageShell from "../../components/PageShell";
const seasons=[
  { season: 2025, champion: "The Price Is Wrong", manager: "Luke Erbacher" },
  { season: 2024, champion: "TBD", manager: "Add champion" },
  { season: 2023, champion: "TBD", manager: "Add champion" },
  { season: 2022, champion: "TBD", manager: "Add champion" },
  { season: 2021, champion: "TBD", manager: "Add champion" },
  { season: 2020, champion: "TBD", manager: "Add champion" },
];
export default function History(){return <PageShell title="LEAGUE HISTORY" kicker="THE ARCHIVES"><div className="historyGrid">{seasons.map((s)=><article className="panel historyCard" key={s.season}><span>{s.season}</span><h2>{s.champion}</h2><p>{s.manager}</p></article>)}</div></PageShell>}
