"use client";

import { useEffect, useMemo, useState } from "react";
import PageShell from "../../components/PageShell";
import { getSupabase } from "../../lib/supabase";

const supabase=getSupabase();
const SEASON=2026;
const safeColor=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(String(value||""))?String(value):fallback;

export default function DraftRacePage(){
  const [teams,setTeams]=useState([]),[entries,setEntries]=useState([]),[challengeEntries,setChallengeEntries]=useState([]),[adjustments,setAdjustments]=useState([]),[schedule,setSchedule]=useState({games:[]});

  async function load(){
    if(!supabase)return;
    const [{data:t},{data:e},{data:c},{data:a},{data:p}]=await Promise.all([
      supabase.from('teams').select('id,name,manager').order('id'),
      supabase.from('pick_em_entries').select('*').eq('season',SEASON),
      supabase.from('commissioner_challenge_entries').select('*,commissioner_challenges!inner(season,week,title,points,status)').eq('commissioner_challenges.season',SEASON),
      supabase.from('draft_race_adjustments').select('*').eq('season',SEASON),
      supabase.from('team_profiles').select('team_id,primary_color,secondary_color')
    ]);
    const profileByTeam=Object.fromEntries((p||[]).map(profile=>[Number(profile.team_id),profile]));
    const coloredTeams=(t||[]).map(team=>{const profile=profileByTeam[Number(team.id)]||{};return{...team,primary_color:safeColor(profile.primary_color,'#d62828'),secondary_color:safeColor(profile.secondary_color,'#3a86ff')}});
    let sched={games:[]};try{sched=await fetch('/api/pick-em',{cache:'no-store'}).then(r=>r.json())}catch{}
    setTeams(coloredTeams);setEntries(e||[]);setChallengeEntries(c||[]);setAdjustments(a||[]);setSchedule(sched||{games:[]});
  }

  useEffect(()=>{load()},[]);

  const teamById=useMemo(()=>Object.fromEntries(teams.map(team=>[Number(team.id),team])),[teams]);
  const gameById=useMemo(()=>Object.fromEntries((schedule.games||[]).filter(g=>g.completed&&g.winnerTeamId).map(g=>[Number(g.id),g])),[schedule]);

  const challengeWinners=useMemo(()=>{
    const grouped=new Map();
    for(const entry of challengeEntries){
      if(!entry.is_winner)continue;
      const challenge=entry.commissioner_challenges;
      if(!challenge)continue;
      const week=Number(challenge.week);
      if(!grouped.has(week))grouped.set(week,{week,title:challenge.title,points:Number(challenge.points||0),winners:[]});
      grouped.get(week).winners.push({team:teamById[Number(entry.manager_team_id)],points:Number(entry.points_awarded||challenge.points||0)});
    }
    return [...grouped.values()].sort((a,b)=>b.week-a.week);
  },[challengeEntries,teamById]);

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

  return <PageShell title="DRAFT RACE" kicker="EARN YOUR 2027 DRAFT SLOT">
    <section className="panel" style={{marginBottom:18}}><span className="eyebrow">SEASON-LONG COMPETITION</span><h2 style={{fontFamily:'Oswald',fontSize:36,margin:'6px 0'}}>Win the right to choose your draft position.</h2><p>Draft Race rewards Pick 'Em accuracy, underdog calls, hot streaks, commissioner challenges, and approved bonus adjustments. The final standings determine the order managers choose their 2027 draft slots.</p></section>

    <section className="commissionerGrid" style={{marginBottom:18}}>
      <article className="panel"><div className="panelTitle"><h3>SCORING FORMULA</h3><span>100 POINT SCALE</span></div><div className="recordRow"><span>Pick 'Em performance</span><strong>35%</strong></div><div className="recordRow"><span>Underdog picks / wins</span><strong>25%</strong></div><div className="recordRow"><span>Hot streaks</span><strong>10%</strong></div><div className="recordRow"><span>Commissioner challenges</span><strong>5%</strong></div><div className="recordRow"><span>Upset / manual bonuses</span><strong>25%</strong></div></article>
      <article className="panel"><div className="panelTitle"><h3>WEEKLY CHALLENGE WINNERS</h3><span>{challengeWinners.length} SCORED</span></div>{challengeWinners.length?<div className="franchiseHeadRows">{challengeWinners.map(row=><div key={row.week}><div><strong>Week {row.week} · {row.title}</strong><small>{row.winners.map(w=><span className="teamColorGlow teamNameInline" style={{"--team-primary":w.team?.primary_color||'#d62828'}} key={w.team?.id||w.team?.name}>{w.team?.name||'Team'}</span>)}</small></div><b>{row.winners.map(w=>`${w.points} pt${w.points===1?'':'s'}`).join(' · ')}</b></div>)}</div>:<div className="emptyPanel">Weekly challenge winners will appear here after challenges are scored.</div>}</article>
    </section>

    <section className="panel"><div className="panelTitle"><h3>2027 DRAFT POSITION RACE</h3><span>{rows.length} MANAGERS</span></div><div className="franchiseHeadRows draftRaceRows">{rows.map((r,i)=><div className="teamAccentRow" style={{"--team-primary":r.team.primary_color,"--team-secondary":r.team.secondary_color}} key={r.team.id}><div><strong className="teamColorGlow">#{i+1} · {r.team.name}</strong><small>{r.team.manager} · Pick 'Em {r.correct}-{r.wrong} · 🐶 {r.underdogCorrect} underdog calls · 🔥 {r.streak} streak · Challenges {r.challengePts} pts</small></div><b>{r.score.toFixed(1)}</b></div>)}</div></section>
  </PageShell>;
}
