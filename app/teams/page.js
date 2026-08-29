import Image from "next/image";
import PageShell from "../../components/PageShell";
import { teams } from "../../data/league";
export default function Teams(){return <PageShell title="TEAMS" kicker="THE 12"><div className="teamGrid">{teams.map(t=><article className="panel teamCard" key={t.id}><div className="logoPlate"><Image src={t.logo} alt={`${t.name} logo`} width={120} height={140}/></div><h2>{t.name}</h2><p>{t.manager}</p><div className="statTriplet"><span><b>{t.wins}-{t.losses}</b>Record</span><span><b>{t.pointsFor.toFixed(1)}</b>PF</span><span><b>{t.championships}</b>Titles</span></div></article>)}</div></PageShell>}
