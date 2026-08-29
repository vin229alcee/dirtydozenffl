import { createClient } from "@supabase/supabase-js";
import PageShell from "../../components/PageShell";

export const dynamic = "force-dynamic";

async function getHistory() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { teams: [], champions: [] };
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [{ data: teams }, { data: champions }] = await Promise.all([
    supabase.from("teams").select("id,name,manager,logo").order("id"),
    supabase.from("champions").select("*").order("season", { ascending: false }),
  ]);
  return { teams: teams || [], champions: champions || [] };
}

export default async function History() {
  const { teams, champions } = await getHistory();
  const byId = Object.fromEntries(teams.map((team) => [team.id, team]));
  const titleCounts = champions.reduce((counts, champion) => {
    counts[champion.team_id] = (counts[champion.team_id] || 0) + 1;
    return counts;
  }, {});

  return <PageShell title="LEAGUE HISTORY" kicker="THE ARCHIVES">
    {champions.length ? <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14}}>
      {champions.map((champion, index) => {
        const team = byId[champion.team_id];
        const titles = titleCounts[champion.team_id] || 1;
        return <article className="panel" key={champion.id} style={{borderRadius:14,position:"relative",overflow:"hidden"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,borderBottom:"1px solid #2a3138",paddingBottom:12,marginBottom:16}}>
            <span style={{fontFamily:"Oswald, sans-serif",fontSize:30,fontWeight:700}}>{champion.season}</span>
            <b style={{fontSize:9,letterSpacing:1.2,color:index===0?"#d9aa4e":"#8e98a3"}}>{index === 0 ? "DEFENDING CHAMPION" : "LEAGUE CHAMPION"}</b>
          </div>
          <div style={{fontSize:38,marginBottom:8}}>🏆</div>
          <h2 style={{fontFamily:"Oswald, sans-serif",fontSize:24,lineHeight:1.1,margin:"0 0 6px"}}>{team?.name || "Champion"}</h2>
          <p style={{color:"#8e98a3",margin:"0 0 18px"}}>{team?.manager || "Manager"}</p>
          <small style={{fontSize:9,letterSpacing:1,color:"#d9aa4e",fontWeight:800}}>{titles} {titles === 1 ? "TITLE" : "TITLES"} IN RECORDED HISTORY</small>
        </article>;
      })}
    </div> : <section className="panel emptyPanel">Championship history will appear here as seasons are added by the Commissioner.</section>}
  </PageShell>;
}
