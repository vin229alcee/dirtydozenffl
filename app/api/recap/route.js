import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
const ESPN_LEAGUE_ID = "2145514194";
const SEASON = 2026;
const norm = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const finalGame = (g) => Boolean(g?.winner && g.winner !== "UNDECIDED");
const score = (side) => Number(side?.totalPoints || 0);

function autoRankings(teams, schedule, currentWeek, names) {
  const rows = teams.map((t) => {
    const r = t?.record?.overall || {};
    const games = Number(r.wins || 0) + Number(r.losses || 0) + Number(r.ties || 0);
    return { id:Number(t.id), name:names[Number(t.id)]?.name || t.name || `Team ${t.id}`, wins:Number(r.wins||0), losses:Number(r.losses||0), winPct:games?(Number(r.wins||0)+Number(r.ties||0)*.5)/games:0, pointsFor:Number(r.pointsFor||0), qualityWins:0 };
  });
  const byId = Object.fromEntries(rows.map((t) => [t.id, t]));
  for (const g of schedule) {
    if (!g?.home || !g?.away || Number(g.matchupPeriodId) >= currentWeek || !finalGame(g)) continue;
    const h=byId[Number(g.home.teamId)], a=byId[Number(g.away.teamId)]; if(!h||!a) continue;
    const hs=score(g.home), as=score(g.away); if(hs>as) h.qualityWins+=a.winPct; else if(as>hs) a.qualityWins+=h.winPct;
  }
  const maxPF=Math.max(...rows.map(t=>t.pointsFor),1), maxQ=Math.max(...rows.map(t=>t.qualityWins),1);
  return rows.map(t=>({...t,powerScore:t.winPct*.45+(t.pointsFor/maxPF)*.40+(t.qualityWins/maxQ)*.15})).sort((a,b)=>b.powerScore-a.powerScore||b.pointsFor-a.pointsFor).map((t,i)=>({...t,rank:i+1}));
}

export async function GET() {
  try {
    const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL, supabaseKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const localTeams={}; let savedRankings=[], commissionerTake=null, trashTalk=null;
    if (supabaseUrl && supabaseKey) {
      const s=createClient(supabaseUrl,supabaseKey,{auth:{persistSession:false,autoRefreshToken:false}});
      const [teamRes,rankRes,takeRes,trashRes]=await Promise.all([
        s.from("teams").select("id,name,manager,wins,losses,points_for"),
        s.from("power_rankings").select("week,rank,team_id").eq("season",SEASON).order("week",{ascending:false}),
        s.from("weekly_commissioner_takes").select("week,body").eq("season",SEASON).order("week",{ascending:false}).limit(1),
        s.from("trash_talk_posts").select("team_id,body,created_at").not("body","is",null).order("created_at",{ascending:false}).limit(1),
      ]);
      for(const t of teamRes.data||[]) localTeams[Number(t.id)]=t;
      savedRankings=rankRes.data||[]; commissionerTake=takeRes.data?.[0]||null;
      if(trashRes.data?.[0]) trashTalk={...trashRes.data[0],team:localTeams[Number(trashRes.data[0].team_id)]||null};
    }

    const url=new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${ESPN_LEAGUE_ID}`);
    for(const view of ["mTeam","mMatchupScore","mStandings"]) url.searchParams.append("view",view);
    const headers={accept:"application/json, text/plain, */*","user-agent":"DirtyDozensFFL/1.0"};
    if(process.env.ESPN_S2&&process.env.ESPN_SWID) headers.cookie=`espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;
    const response=await fetch(url,{headers,cache:"no-store"}); if(!response.ok) throw new Error(`ESPN returned ${response.status}`);
    const data=await response.json(), currentWeek=Number(data?.status?.currentMatchupPeriod||1), schedule=data?.schedule||[], espnTeams=data?.teams||[];
    const completedWeeks=[...new Set(schedule.filter(g=>g?.home&&g?.away&&finalGame(g)).map(g=>Number(g.matchupPeriodId)).filter(w=>w&&w<=currentWeek))];
    if(!completedWeeks.length) return NextResponse.json({ready:false,currentWeek,commissionerTake,trashTalk});
    const week=Math.max(...completedWeeks);
    const games=schedule.filter(g=>Number(g.matchupPeriodId)===week&&g?.home&&g?.away&&finalGame(g)).map(g=>{
      const home=localTeams[Number(g.home.teamId)]||{id:Number(g.home.teamId),name:`Team ${g.home.teamId}`,manager:""}, away=localTeams[Number(g.away.teamId)]||{id:Number(g.away.teamId),name:`Team ${g.away.teamId}`,manager:""};
      const homeScore=score(g.home),awayScore=score(g.away),homeWon=homeScore>awayScore;
      return{id:g.id,home,away,homeScore,awayScore,margin:Math.abs(homeScore-awayScore),combined:homeScore+awayScore,winner:homeWon?home:away,loser:homeWon?away:home};
    });
    const performances=games.flatMap(g=>[{team:g.home,score:g.homeScore,won:g.homeScore>g.awayScore},{team:g.away,score:g.awayScore,won:g.awayScore>g.homeScore}]).sort((a,b)=>b.score-a.score);
    const biggest=[...games].sort((a,b)=>b.margin-a.margin)[0],closest=[...games].sort((a,b)=>a.margin-b.margin||b.combined-a.combined)[0];
    const average=performances.reduce((sum,p)=>sum+p.score,0)/performances.length;
    const toughLoss=[...performances].filter(p=>!p.won).sort((a,b)=>b.score-a.score)[0];

    let currentRanks=autoRankings(espnTeams,schedule,currentWeek,localTeams), previousRanks=autoRankings(espnTeams,schedule,Math.max(1,currentWeek-1),localTeams);
    const savedCurrent=savedRankings.filter(r=>Number(r.week)===currentWeek); if(savedCurrent.length===12) currentRanks=savedCurrent.map(r=>({id:Number(r.team_id),name:localTeams[Number(r.team_id)]?.name||"Team",rank:Number(r.rank)}));
    const savedPrevious=savedRankings.filter(r=>Number(r.week)===currentWeek-1); if(savedPrevious.length===12) previousRanks=savedPrevious.map(r=>({id:Number(r.team_id),name:localTeams[Number(r.team_id)]?.name||"Team",rank:Number(r.rank)}));
    const prevById=Object.fromEntries(previousRanks.map(r=>[Number(r.id),Number(r.rank)]));
    const movers=currentRanks.map(r=>({...r,move:(prevById[Number(r.id)]||r.rank)-r.rank})).sort((a,b)=>b.move-a.move||a.rank-b.rank);
    const biggestMover=movers[0]?.move>0?movers[0]:null;

    const upcoming=schedule.filter(g=>Number(g.matchupPeriodId)===currentWeek&&g?.home&&g?.away&&!finalGame(g));
    const rankById=Object.fromEntries(currentRanks.map(r=>[Number(r.id),Number(r.rank)]));
    const gameOfWeek=upcoming.map(g=>{const h=Number(g.home.teamId),a=Number(g.away.teamId),r1=rankById[h]||12,r2=rankById[a]||12;return{home:localTeams[h]||{name:`Team ${h}`},away:localTeams[a]||{name:`Team ${a}`},homeRank:r1,awayRank:r2,score:(13-r1)+(13-r2)+(12-Math.min(11,Math.abs(r1-r2)))};}).sort((a,b)=>b.score-a.score)[0]||null;

    return NextResponse.json({ready:true,week,currentWeek,high:performances[0],low:performances[performances.length-1],toughLoss,biggest:{winner:biggest.winner,loser:biggest.loser,margin:biggest.margin},closest:{winner:closest.winner,loser:closest.loser,margin:closest.margin},average,biggestMover,gameOfWeek,commissionerTake:commissionerTake&&Number(commissionerTake.week)<=currentWeek?commissionerTake:null,trashTalk});
  } catch(error) { return NextResponse.json({ready:false,error:error?.message||"Recap unavailable"},{status:200}); }
}
