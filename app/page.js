import Link from "next/link";
import Header from "../components/Header";
import TeamBadge from "../components/TeamBadge";
import { league, teams, weeklyMatchups, weeklyHighScores, records, headlines } from "../data/league";

export default function Home() {
  return <>
    <div className="topline">{league.tagline}</div>
    <Header />
    <main className="homeGrid pageWrap">
      <section className="pageHero homeHero">
        <div className="heroCopy">
          <span className="eyebrow">WELCOME TO</span>
          <h1>DIRTY DOZENS <em>FFL</em></h1>
          <p>{league.subtagline}</p>
          <Link className="button" href="/teams">Meet the Dirty Dozen →</Link>
        </div>
        <div className="heroMark">12</div>
      </section>

      <section className="panel championCard">
        <span className="eyebrow">DEFENDING CHAMPION</span>
        <h2>{league.defendingChampion}</h2>
        <strong>{league.defendingChampionManager}</strong>
        <div className="belt">CHAMPION</div>
        <p>{league.defendingChampionSeason} SEASON</p>
      </section>

      <section className="panel matchupFeature">
        <div className="panelTitle"><h3>NEXT UP — WEEK 1</h3></div>
        <div className="pendingState"><strong>SCHEDULE PENDING</strong><p>Add the official ESPN matchups when they are set.</p></div>
        <Link className="ghostButton" href="/matchups">View matchups</Link>
      </section>

      <section className="panel span2">
        <div className="panelTitle"><h3>WEEK 1 MATCHUPS</h3><Link href="/matchups">VIEW ALL</Link></div>
        {weeklyMatchups.length ? <div className="scoreList">{weeklyMatchups.map((m,i) => <div className="scoreRow" key={i}><TeamBadge team={m.home}/><strong>{m.scoreHome?.toFixed(1) ?? "—"}</strong><span>{m.status ?? "SCHEDULED"}</span><strong>{m.scoreAway?.toFixed(1) ?? "—"}</strong><TeamBadge team={m.away}/></div>)}</div> : <div className="emptyPanel">Official Week 1 matchups have not been added yet.</div>}
      </section>

      <section className="panel span2 highScoreTracker">
        <div className="panelTitle"><h3>WEEKLY HIGH SCORE TRACKER</h3><span>2026 SEASON</span></div>
        {weeklyHighScores.length ? <div className="scoreList">{weeklyHighScores.map((entry) => <div className="scoreRow" key={entry.week}><strong>WEEK {entry.week}</strong><span>{entry.team}</span><strong>{entry.score.toFixed(1)}</strong></div>)}</div> : <div className="emptyPanel">Week 1 high score will appear here after the official ESPN results are final.</div>}
      </section>

      <section className="panel standingsPanel">
        <div className="panelTitle"><h3>STANDINGS</h3><Link href="/standings">FULL</Link></div>
        <table><thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>PF</th></tr></thead><tbody>{teams.slice(0,8).map((t,i)=><tr key={t.id}><td>{i+1}</td><td>{t.name}</td><td>{t.wins}</td><td>{t.losses}</td><td>—</td></tr>)}</tbody></table>
      </section>

      <section className="panel rankingsPanel">
        <div className="panelTitle"><h3>POWER RANKINGS</h3><Link href="/power-rankings">FULL</Link></div>
        <div className="emptyPanel">Preseason rankings have not been published.</div>
      </section>

      <section className="panel newsPanel">
        <div className="panelTitle"><h3>LEAGUE NEWS</h3><Link href="/news">VIEW ALL</Link></div>
        {headlines.map((h,i)=><article key={i}><span className="newsIndex">0{i+1}</span><div><h4>{h.title}</h4><p>{h.deck}</p></div></article>)}
      </section>

      <section className="panel recordsPanel">
        <div className="panelTitle"><h3>RECORD BOOK</h3><Link href="/records">VIEW ALL</Link></div>
        {records.map(([label,value])=><div className="recordRow" key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </section>

      <section className="panel dirtyPlayer">
        <span className="eyebrow">DIRTY PLAYER OF THE WEEK</span>
        <div className="trashIcon">★</div>
        <h2>COMING WEEK 1</h2><strong>WHO EARNS IT?</strong><p>The week's top performance will be featured here.</p>
      </section>

      <section className="panel trashTalk">
        <div className="panelTitle"><h3>TRASH TALK FEED</h3></div>
        <blockquote>“Receipts will be kept.”</blockquote>
        <blockquote>“Twelve teams. One trophy.”</blockquote>
        <blockquote>“Nobody is safe from the weekly recap.”</blockquote>
      </section>
    </main>
    <footer><strong>DIRTY DOZENS <span>FFL</span></strong><small>{league.subtagline}</small></footer>
  </>;
}
