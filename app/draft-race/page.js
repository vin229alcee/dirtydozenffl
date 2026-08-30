"use client";

import { useEffect, useMemo, useState } from "react";
import PageShell from "../../components/PageShell";
import { getSupabase } from "../../lib/supabase";

const supabase=getSupabase();
const SEASON=2026;

export default function DraftRacePage(){
  const [teams,setTeams]=useState([]),[entries,setEntries]=useState([]),[challengeEntries,setChallengeEntries]=useState([]),[adjustments,setAdjustments]=useState([]),[challenge,setChallenge]=useState(null),[session,setSession]=useState(null),[managerTeam,setManagerTeam]=useState(null),[answer,setAnswer]=useState(''),[status,setStatus]=useState(''),[schedule,setSchedule]=useState({games:[]});

  async function load(){
    if(!supabase)return;
    const [{data:t},{data:e},{data:c},{data:a},{data:s}]=await Promise.all([
      supabase.from('teams').select('id,name,manager').order('id'),
      supabase.from('pick_em_entries').select('*').eq('season',SEASON),
      supabase.from('commissioner_challenge_entries').select('*,commissioner_challenges!inner(season,week,title,points)').eq('commissioner_challenges.season',SEASON),
      supabase.from('draft_race_adjustments').select('*').eq('season',SEASON),
      supabase.auth.getSession()
    ]);
    const {data:ch}=await supabase.from('commissioner_challenges').select('*').eq('season',SEASON).eq('status','open').order('week',{ascending:false}).limit(1).maybeSingle();
    let sched={games:[]};try{sched=await fetch('/api/pick-em',{cache:'no-store'}).then(r=>r.json())}catch{}
    setTeams(t||[]);setEntries(e||[]);setChallengeEntries(c||[]);setAdjustments(a||[]);setChallenge(ch||null);setSession(s?.session||null);setSchedule(sched||{games:[]});
  }

  useEffect(()=>{load();const {data:l}=supabase?.auth.onAuthStateChange(()=>load())||{data:null};return()=>l?.subscription?.unsubscribe()},[]);

  useEffect(()=>{if(!supabase||!session?.user)return setManagerTeam(null);supabase.from('manager_teams').select('team_id').eq('user_id',session.user.id).maybeSingle().then(({data})=>setManagerTeam(data||null))},[session]);

  const teamById=useMemo(()=>Object.fromEntries(teams.map(team=>[Number(team.id),team])),[teams]);
  const gameById=useMemo(()=>Object.fromEntries((schedule.games||[]).filter(g=>g.completed&&g.winnerTeamId).map(g=>[Number(g.id),g])),[schedule]);
  const rows=useMemo(()=>teams.map(team=>{
    const my=entries.filter(e=>Number(e.manager_team_id)===Number(team.id));
    let correct=0,wrong=0,underdogCorrect=0;
    const finalized=[];
    for(const e of my){const g=gameById[Number(e.matchup_id)];if(!g)continue;const ok=Number(e.picked_team_id)===Number(g.winnerTeamId);if(ok)correct++;else wrong++;const home=Number(g.home?.projectedScore),away=Number(g.away?.projectedScore);if(ok&&Number.isFinite(home)&&Number.isFinite(away)){const dog=home<away?Number(g.home.id):away<home?Number(g.away.id):null;if(dog&&Number(e.picked_team_id)===dog)underdogCorrect++;}finalized.push({week:Number(e.week),id:Number(e.matchup_id),ok});}
    finalized.sort((a,b)=>a.week-b.week||a.id-b.id);let streak=0;for(let i=finalized.length-1;i>=0;i--){if(!finalized[i].ok)break;streak++;}
    const challengePts=challengeEntries.filter(x=>Number(x.manager_team_id)===Number(team.id)).reduce((s,x)=>s+Number(x.points_awarded||0),0);
    const manual=adjustments.filter(x=>Number(x.team_id)===Number(team.id)).reduce((s,x)=>s+Number(x.points||0),0);
    const totalPicks=correct+wrong;const pickPct=totalPicks?correct/totalPicks:0;
    const score=Math.round((pickPct*35 + Math.min(underdogCorrect*2.5,25) + Math.min(streak*2,10) + Math.min(challengePts,5) + manual)*10)/10;
    return{team,correct,wrong,underdogCorrect,streak,challengePts,manual,score};
  }).sort((a,b)=>b.score-a.score||b.correct-a.correct||b.underdogCorrect-a.underdogCorrect),[teams,entries,gameById,challengeEntries,adjustments]);

  const locked=Boolean(challenge?.lock_at&&Date.now()>=new Date(challenge.lock_at).getTime());
  const cfg=challenge?.config||{};
  const selectableTeams=challenge?.challenge_type==='game_of_week'?[teamById[Number(cfg.team1_id)],teamById[Number(cfg.team2_id)]].filter(Boolean):teams;

  async function submit(){
    if(!session||!managerTeam||!challenge)return setStatus('Sign in with a linked manager account first.');
    if(locked)return setStatus('This challenge is locked.');
    if(!String(answer).trim())return setStatus('Enter your answer first.');
    const payload={challenge_id:challenge.id,manager_team_id:Number(managerTeam.team_id),user_id:session.user.id,answer:String(answer).trim(),updated_at:new Date().toISOString()};
    const {error}=await supabase.from('commissioner_challenge_entries').upsert(payload,{onConflict:'challenge_id,manager_team_id'});
    setStatus(error?error.message:'Challenge answer submitted.');if(!error){setAnswer('');await load();}
  }

  function challengeInput(){
    if(!challenge)return null;
    if(challenge.challenge_type==='bullseye')return <input type="number" step="0.1" value={answer} onChange={e=>setAnswer(e.target.value)} placeholder="Predict your final score" disabled={locked} style={{width:'100%',margin:'10px 0'}}/>;
    if(challenge.challenge_type==='upset_alert')return <select value={answer} onChange={e=>setAnswer(e.target.value)} disabled={locked} style={{width:'100%',margin:'10px 0'}}><option value="">Choose prediction</option><option value="yes">YES — underdog wins</option><option value="no">NO — favorite wins</option></select>;
    return <select value={answer} onChange={e=>setAnswer(e.target.value)} disabled={locked} style={{width:'100%',margin:'10px 0'}}><option value="">Choose team</option>{selectableTeams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>;
  }

  return <PageShell title="DRAFT RACE" kicker="EARN YOUR 2027 DRAFT SLOT">
    <section className="panel" style={{marginBottom:18}}><span className="eyebrow">SEASON-LONG COMPETITION</span><h2 style={{fontFamily:'Oswald',fontSize:36,margin:'6px 0'}}>Win the right to choose your draft position.</h2><p>Draft Race rewards Pick 'Em accuracy, underdog calls, hot streaks, commissioner challenges, and approved bonus adjustments. The final standings determine the order managers choose their 2027 draft slots.</p></section>

    <section className="commissionerGrid" style={{marginBottom:18}}>
      <article className="panel"><div className="panelTitle"><h3>SCORING FORMULA</h3><span>100 POINT SCALE</span></div><div className="recordRow"><span>Pick 'Em performance</span><strong>35%</strong></div><div className="recordRow"><span>Underdog picks / wins</span><strong>25%</strong></div><div className="recordRow"><span>Hot streaks</span><strong>10%</strong></div><div className="recordRow"><span>Commissioner challenges</span><strong>5%</strong></div><div className="recordRow"><span>Upset / manual bonuses</span><strong>25%</strong></div></article>
      <article className="panel"><div className="panelTitle"><h3>WEEKLY COMMISSIONER CHALLENGE</h3><span>{challenge?`WEEK ${challenge.week}`:'PENDING'}</span></div>{challenge?<><h2 style={{fontFamily:'Oswald'}}>{challenge.title}</h2><p>{challenge.description||''}</p><p><strong>{challenge.points} Draft Race pts</strong>{challenge.lock_at?` · Locks ${new Date(challenge.lock_at).toLocaleString()}`:''}</p>{challenge.challenge_type==='upset_alert'&&cfg.underdog_team_id?<p><strong>{teamById[Number(cfg.underdog_team_id)]?.name||'Underdog'}</strong> vs {teamById[Number(cfg.opponent_team_id)]?.name||'Opponent'}</p>:null}{challengeInput()}<button className="primaryButton" onClick={submit} disabled={locked}>{locked?'Challenge Locked':'Submit Challenge'}</button></>:<div className="emptyPanel">The commissioner has not posted a challenge yet.</div>}{status&&<p>{status}</p>}</article>
    </section>

    <section className="panel"><div className="panelTitle"><h3>2027 DRAFT POSITION RACE</h3><span>{rows.length} MANAGERS</span></div><div className="franchiseHeadRows">{rows.map((r,i)=><div key={r.team.id}><div><strong>#{i+1} · {r.team.name}</strong><small>{r.team.manager} · Pick 'Em {r.correct}-{r.wrong} · 🐶 {r.underdogCorrect} underdog calls · 🔥 {r.streak} streak · Challenges {r.challengePts} pts</small></div><b>{r.score.toFixed(1)}</b></div>)}</div></section>
  </PageShell>;
}
