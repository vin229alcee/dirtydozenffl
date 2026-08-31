'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageShell from '../../components/PageShell';
import ManagerProfilePanel from '../../components/ManagerProfilePanel';
import { getSupabase } from '../../lib/supabase';

const supabase = getSupabase();
const SEASON = 2026;
const safeColor=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):fallback;
function pct(w,l){const g=Number(w||0)+Number(l||0);return g?`${Math.round((Number(w||0)/g)*100)}%`:'—'}
function score(v){return v==null?'—':Number(v).toFixed(1)}
function formatDate(v){try{return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(new Date(v))}catch{return''}}

export default function ManagerDashboard(){
  const [session,setSession]=useState(null),[loading,setLoading]=useState(true),[status,setStatus]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[team,setTeam]=useState(null),[profile,setProfile]=useState(null),[isCommissioner,setIsCommissioner]=useState(false),[teams,setTeams]=useState([]),[matchups,setMatchups]=useState([]),[rankings,setRankings]=useState([]),[champions,setChampions]=useState([]),[highScores,setHighScores]=useState([]),[dirtyAwards,setDirtyAwards]=useState([]),[trash,setTrash]=useState([]);

  useEffect(()=>{if(!supabase){setLoading(false);return}supabase.auth.getSession().then(({data})=>setSession(data.session||null));const{data:listener}=supabase.auth.onAuthStateChange((_e,next)=>setSession(next));return()=>listener.subscription.unsubscribe()},[]);
  useEffect(()=>{if(session)loadDashboard();else{setLoading(false);setTeam(null)}},[session]);

  async function loadDashboard(){
    setLoading(true);setStatus('');
    const {data:link,error:linkError}=await supabase.from('manager_teams').select('team_id,is_commissioner').eq('user_id',session.user.id).maybeSingle();
    if(linkError||!link){setStatus(linkError?.message||'This login is not linked to a Dirty Dozens team yet.');setLoading(false);return}
    setIsCommissioner(!!link.is_commissioner);const teamId=Number(link.team_id);
    const [teamRes,profileRes,teamsRes,matchRes,rankRes,champRes,highRes,dirtyRes,trashRes]=await Promise.all([
      supabase.from('teams').select('*').eq('id',teamId).maybeSingle(),
      supabase.from('team_profiles').select('primary_color,secondary_color').eq('team_id',teamId).maybeSingle(),
      supabase.from('teams').select('id,name,manager').order('id'),
      supabase.from('matchups').select('*').or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`).order('season',{ascending:false}).order('week',{ascending:false}),
      supabase.from('power_rankings').select('*').eq('team_id',teamId).order('season',{ascending:false}).order('week',{ascending:false}),
      supabase.from('champions').select('*').eq('team_id',teamId).order('season',{ascending:false}),
      supabase.from('weekly_high_scores').select('*').eq('team_id',teamId).order('season',{ascending:false}).order('week',{ascending:false}),
      supabase.from('dirty_players').select('*').eq('team_id',teamId).order('season',{ascending:false}).order('week',{ascending:false}),
      supabase.from('trash_talk_posts').select('id,body,created_at,media_path').eq('author_id',session.user.id).order('created_at',{ascending:false}).limit(5)
    ]);
    setTeam(teamRes.data||null);setProfile(profileRes.data||null);setTeams(teamsRes.data||[]);setMatchups(matchRes.data||[]);setRankings(rankRes.data||[]);setChampions(champRes.data||[]);setHighScores(highRes.data||[]);setDirtyAwards(dirtyRes.data||[]);setTrash(trashRes.data||[]);setLoading(false);
  }

  async function signIn(e){e.preventDefault();setStatus('Signing in…');const{error}=await supabase.auth.signInWithPassword({email:email.trim(),password});setStatus(error?error.message:'')}
  async function signOut(){await supabase.auth.signOut();setStatus('')}

  const teamById=useMemo(()=>Object.fromEntries(teams.map(t=>[Number(t.id),t])),[teams]);
  const latestRank=rankings.find(r=>Number(r.season)===SEASON)||rankings[0]||null;
  const currentGames=matchups.filter(m=>Number(m.season)===SEASON),recentGames=currentGames.slice(0,5),career={wins:0,losses:0,pointsFor:0,pointsAgainst:0},rivalries={};
  for(const m of matchups){const mineHome=Number(m.team1_id)===Number(team?.id),oppId=mineHome?Number(m.team2_id):Number(m.team1_id),mine=Number(mineHome?m.team1_score:m.team2_score),opp=Number(mineHome?m.team2_score:m.team1_score);if(!Number.isFinite(mine)||!Number.isFinite(opp))continue;career.pointsFor+=mine;career.pointsAgainst+=opp;if(mine>opp)career.wins++;else if(opp>mine)career.losses++;rivalries[oppId]||={oppId,wins:0,losses:0,games:0,pf:0,pa:0};const r=rivalries[oppId];r.games++;r.pf+=mine;r.pa+=opp;if(mine>opp)r.wins++;else if(opp>mine)r.losses++}
  const topRivalry=Object.values(rivalries).sort((a,b)=>b.games-a.games||Math.abs(a.wins-a.losses)-Math.abs(b.wins-b.losses))[0]||null;
  const primary=safeColor(profile?.primary_color,'#d62828'),secondary=safeColor(profile?.secondary_color,'#3a86ff'),theme={"--team-primary":primary,"--team-secondary":secondary};

  if(!supabase)return <PageShell title="MANAGER HQ" kicker="PERSONAL DASHBOARD"><section className="panel">Supabase is not configured.</section></PageShell>;
  if(!session)return <PageShell title="MANAGER HQ" kicker="PERSONAL DASHBOARD"><section className="panel trashTalkLogin managerLoginCard"><div><span className="eyebrow">MANAGER LOGIN</span><h2>Your team. Your history. Your receipts.</h2><p>Sign in with the account linked to your Dirty Dozens team.</p></div><form onSubmit={signIn}><input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required/><input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required/><button className="primaryButton">Open Manager HQ</button></form>{status&&<p className="trashTalkStatus">{status}</p>}<p style={{marginTop:14}}><Link href="/join">Need an account? Join here →</Link></p></section></PageShell>;
  if(loading)return <PageShell title="MANAGER HQ" kicker="PERSONAL DASHBOARD"><section className="panel emptyPanel">Loading your franchise…</section></PageShell>;
  if(!team)return <PageShell title="MANAGER HQ" kicker="PERSONAL DASHBOARD"><section className="panel"><h2>Account not linked</h2><p>{status}</p><button className="secondaryButton" onClick={signOut}>Sign Out</button></section></PageShell>;

  return <PageShell title="MANAGER HQ" kicker="PERSONAL DASHBOARD"><div className="managerDashboard" style={theme}>
    <section className="panel managerHero"><div className="managerHeroCopy"><span className="eyebrow">{isCommissioner?'COMMISSIONER · MANAGER':'DIRTY DOZENS MANAGER'}</span><h2 className="teamColorGlow">{team.name}</h2><p>{team.manager} · {team.wins??0}-{team.losses??0} · {score(team.points_for)} PF</p></div><div className="managerQuickActions">{isCommissioner&&<Link className="secondaryButton" href="/commissioner">Commissioner</Link>}<Link className="secondaryButton" href={`/teams/${team.id}`}>Public Profile</Link><Link className="primaryButton" href="/trash-talk">Trash Talk</Link><button className="secondaryButton" onClick={signOut}>Sign Out</button></div></section>

    <ManagerProfilePanel session={session} team={team}/>

    <section className="managerStatGrid">{[['CURRENT RECORD',`${team.wins??0}-${team.losses??0}`],['WIN RATE',pct(team.wins,team.losses)],['POWER RANK',latestRank?`#${latestRank.rank}`:'—'],['POINTS FOR',score(team.points_for)],['CHAMPIONSHIPS',champions.length||team.championships||0],['WEEKLY HIGHS',highScores.length]].map(([label,value])=><div className="panel managerStatCard" key={label}><small>{label}</small><strong>{value}</strong></div>)}</section>

    <section className="commissionerGrid managerInfoGrid">
      <div className="panel"><div className="panelTitle"><h3>RECENT RESULTS</h3><span>2026</span></div>{recentGames.length?recentGames.map(m=>{const home=Number(m.team1_id)===Number(team.id),opp=teamById[home?Number(m.team2_id):Number(m.team1_id)],mine=home?m.team1_score:m.team2_score,theirs=home?m.team2_score:m.team1_score,win=Number(mine)>Number(theirs);return <div className="recordRow managerResultRow" key={m.id}><span><b className={win?'resultWin':'resultLoss'}>{win?'W':'L'}</b> WEEK {m.week} · vs {opp?.name||'Opponent'}</span><strong>{score(mine)}–{score(theirs)}</strong></div>}):<div className="emptyPanel">No completed results yet.</div>}</div>
      <div className="panel"><div className="panelTitle"><h3>FRANCHISE HISTORY</h3><span>ALL SAVED SEASONS</span></div><div className="recordRow"><span>Career record</span><strong>{career.wins}-{career.losses}</strong></div><div className="recordRow"><span>Career points</span><strong>{score(career.pointsFor)}</strong></div><div className="recordRow"><span>Championship seasons</span><strong>{champions.length?champions.map(c=>c.season).join(', '):'—'}</strong></div><div className="recordRow"><span>Dirty Player awards</span><strong>{dirtyAwards.length}</strong></div></div>
    </section>

    <section className="commissionerGrid managerInfoGrid">
      <div className="panel"><div className="panelTitle"><h3>TOP RIVALRY</h3><Link href="/rivalries">FULL RIVALRIES</Link></div>{topRivalry?<><h2 className="managerSectionLead">{teamById[topRivalry.oppId]?.name||'Opponent'}</h2><p>{topRivalry.games} meetings · {topRivalry.wins}-{topRivalry.losses} record</p><div className="recordRow"><span>Points scored</span><strong>{score(topRivalry.pf)}</strong></div><div className="recordRow"><span>Points allowed</span><strong>{score(topRivalry.pa)}</strong></div></>:<div className="emptyPanel">Rivalry data will grow as matchup history is added.</div>}</div>
      <div className="panel"><div className="panelTitle"><h3>RECENT TRASH TALK</h3><Link href="/trash-talk">OPEN FEED</Link></div>{trash.length?trash.map(p=><article className="managerTrashItem" key={p.id}><small>{formatDate(p.created_at)}</small><p>{p.body||'Meme post'}</p></article>):<div className="emptyPanel">No posts yet. Go start something.</div>}</div>
    </section>

    <section className="panel managerAchievements"><div className="panelTitle"><h3>ACHIEVEMENTS</h3><span>FRANCHISE RESUME</span></div><div className="managerAchievementGrid">{[[champions.length,'League Championships'],[highScores.length,'Weekly High Scores'],[dirtyAwards.length,'Dirty Player Selections'],[trash.length,'Recent Trash Talk Posts']].map(([value,label])=><div key={label}><strong>{value}</strong><p>{label}</p></div>)}</div></section>
  </div></PageShell>;
}
