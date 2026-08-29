import PageShell from "../../components/PageShell";
import { teams } from "../../data/league";
export default function Rankings(){return <PageShell title="POWER RANKINGS" kicker="COMMISSIONER'S BOARD"><section className="panel emptyPage"><h2>PRESEASON RANKINGS PENDING</h2><p>The first official Dirty Dozens ranking has not been published yet.</p></section><div className="rankingCards mutedRankings">{teams.map((t,i)=><article className="panel rankCard" key={t.id}><b className="rankNumber">—</b><div><h2>{t.name}</h2><p>{t.manager}</p></div><strong>UNRANKED</strong></article>)}</div></PageShell>}
