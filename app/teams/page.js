import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import PageShell from "../../components/PageShell";

export const dynamic = "force-dynamic";

async function getTeams() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.from("teams").select("*").order("id");
  return error ? [] : data || [];
}

export default async function Teams() {
  const teams = await getTeams();
  return <PageShell title="TEAMS" kicker="THE 12">
    {teams.length ? <div className="teamGrid leagueTeamGrid">
      {teams.map((t) => <article className="panel teamCard leagueTeamCard" key={t.id}>
        <div className="teamIdentity">
          <div className="logoPlate">{t.logo ? <Image src={t.logo} alt={`${t.name} logo`} width={120} height={140}/> : null}</div>
          <div className="teamIdentityCopy"><h2>{t.name}</h2><p>{t.manager}</p></div>
        </div>
        <div className="statTriplet">
          <span><small>RECORD</small><b>{t.wins ?? 0}-{t.losses ?? 0}</b></span>
          <span><small>POINTS FOR</small><b>{Number(t.points_for || 0).toFixed(1)}</b></span>
          <span><small>TITLES</small><b>{t.championships ?? 0}</b></span>
        </div>
      </article>)}
    </div> : <section className="panel emptyPanel">Team data is unavailable right now.</section>}
  </PageShell>;
}
