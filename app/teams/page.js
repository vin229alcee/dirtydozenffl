import Image from "next/image";
import PageShell from "../../components/PageShell";
import { teams } from "../../data/league";

export default function Teams() {
  return <PageShell title="TEAMS" kicker="THE 12">
    <div className="teamGrid leagueTeamGrid">
      {teams.map((t) => <article className="panel teamCard leagueTeamCard" key={t.id}>
        <div className="teamIdentity">
          <div className="logoPlate"><Image src={t.logo} alt={`${t.name} logo`} width={120} height={140}/></div>
          <div className="teamIdentityCopy"><h2>{t.name}</h2><p>{t.manager}</p></div>
        </div>
        <div className="statTriplet">
          <span><small>RECORD</small><b>{t.wins}-{t.losses}</b></span>
          <span><small>POINTS FOR</small><b>{t.pointsFor.toFixed(1)}</b></span>
          <span><small>TITLES</small><b>{t.championships}</b></span>
        </div>
      </article>)}
    </div>
  </PageShell>;
}
