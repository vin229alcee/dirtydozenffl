'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getSupabase } from '../lib/supabase';

const supabase=getSupabase();
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function gradeLetter(n){if(n>=97)return'A+';if(n>=93)return'A';if(n>=90)return'A-';if(n>=87)return'B+';if(n>=83)return'B';if(n>=80)return'B-';if(n>=77)return'C+';if(n>=73)return'C';if(n>=70)return'C-';if(n>=67)return'D+';if(n>=63)return'D';if(n>=60)return'D-';return'F'}
function weekKey(){const d=new Date(),start=new Date(d.getFullYear(),0,1);return `${d.getFullYear()}-${Math.ceil((((d-start)/86400000)+start.getDay()+1)/7)}`}

export default function ProfileExtras(){
  const pathname=usePathname();
  const match=pathname?.match(/^\/teams\/(\d+)\/?$/);
  const teamId=match?Number(match[1]):null;
  const [session,setSession]=useState(null),[profile,setProfile]=useState(null),[team,setTeam]=useState(null),[rank,setRank]=useState(null),[reactions,setReactions]=useState([]),[poll,setPoll]=useState(null),[votes,setVotes]=useState([]),[visits,setVisits]=useState(0),[roster,setRoster]=useState(null),[status,setStatus]=useState('');

  useEffect(()=>{if(!supabase||!teamId)return;let active=true;(async()=>{
    const [{data:p},{data:t},{data:r},{data:rx},{data:pl},{data:v},{count:vc},{data:s}]=await Promise.all([
      supabase.from('team_profiles').select('*').eq('team_id',teamId).maybeSingle(),
      supabase.from('teams').select('*').eq('id',teamId).maybeSingle(),
      supabase.from('power_rankings').select('*').eq('team_id',teamId).eq('season',2026).order('week',{ascending:false}).limit(1).maybeSingle(),
      supabase.from('profile_reactions').select('*').eq('team_id',teamId).eq('week_key',weekKey()),
      supabase.from('manager_polls').select('*').eq('team_id',teamId).eq('is_active',true).order('created_at',{ascending:false}).limit(1).maybeSingle(),
      supabase.from('manager_poll_votes').select('*'),
      supabase.from('profile_visits').select('*',{count:'exact',head:true}).eq('team_id',teamId),
      supabase.auth.getSession()
    ]);
    if(!active)return;setProfile(p||null);setTeam(t||null);setRank(r||null);setReactions(rx||[]);setPoll(pl||null);setVotes((v||[]).filter(x=>!pl||Number(x.poll_id)===Number(pl.id)));setVisits(vc||0);setSession(s?.session||null);
    try{const res=await fetch(`/api/profile-roster/${teamId}`,{cache:'no-store'});if(res.ok)setRoster(await res.json())}catch{}
    try{let key=localStorage.getItem('dd_profile_visitor');if(!key){key=crypto.randomUUID();localStorage.setItem('dd_profile_visitor',key)}await supabase.from('profile_visits').upsert({team_id:teamId,visitor_key:key,visit_day:new Date().toISOString().slice(0,10)},{onConflict:'team_id,visitor_key,visit_day'});}catch{}
  })();return()=>{active=false}},[teamId]);

  useEffect(()=>{if(!profile)return;document.documentElement.style.setProperty('--franchise-primary',profile.primary_color||'#d62828');document.documentElement.style.setProperty('--franchise-secondary',profile.secondary_color||'#3a86ff');return()=>{document.documentElement.style.removeProperty('--franchise-primary');document.documentElement.style.removeProperty('--franchise-secondary')}},[profile]);

  const respect=reactions.filter(r=>r.reaction==='respect').length,disrespect=reactions.filter(r=>r.reaction==='disrespect').length;
  const grade=useMemo(()=>{if(!team)return null;const w=Number(team.wins||0),l=Number(team.losses||0),games=w+l,win=games?w/games:.5,pf=Number(team.points_for||0),ppg=games?pf/games:110,rankScore=rank?.rank?1-(Number(rank.rank)-1)/11:.5;const score=clamp(Math.round((win*.5+rankScore*.3+clamp((ppg-80)/80,0,1)*.2)*100),40,99);return{score,letter:gradeLetter(score)}} ,[team,rank]);
  if(!teamId||!supabase)return null;

  async function react(reaction){if(!session){setStatus('Sign in to Manager HQ to vote.');return}const row={team_id:teamId,user_id:session.user.id,reaction,week_key:weekKey()};const {error}=await supabase.from('profile_reactions').upsert(row,{onConflict:'team_id,user_id,week_key'});if(error){setStatus(error.message);return}setReactions(old=>[...old.filter(x=>x.user_id!==session.user.id),row]);setStatus('Reaction counted.')}
  async function vote(choice){if(!session){setStatus('Sign in to Manager HQ to vote.');return}if(!poll)return;const row={poll_id:poll.id,user_id:session.user.id,choice};const {error}=await supabase.from('manager_poll_votes').upsert(row,{onConflict:'poll_id,user_id'});if(error){setStatus(error.message);return}setVotes(old=>[...old.filter(x=>x.user_id!==session.user.id),row]);setStatus('Vote counted.')}
  const a=votes.filter(v=>v.choice==='a').length,b=votes.filter(v=>v.choice==='b').length,total=a+b;

  return <section className="profileExtrasWrap">
    <div className="profileExtrasGrid">
      <article className="panel profileGradeCard"><span className="eyebrow">FRANCHISE GRADE</span><strong>{grade?.letter||'—'}</strong><b>{grade?`${grade.score}/100`:'Season data pending'}</b><small>Record · scoring · power rank</small></article>
      <article className="panel"><div className="panelTitle"><h3>LEAGUE REPUTATION</h3><span>THIS WEEK</span></div><div className="reactionButtons"><button onClick={()=>react('respect')}>👍 RESPECT <b>{respect}</b></button><button onClick={()=>react('disrespect')}>👎 DISRESPECT <b>{disrespect}</b></button></div></article>
      <article className="panel profileVisits"><span className="eyebrow">PROFILE VISITS</span><strong>👀 {visits}</strong><small>Franchise scouting reports opened</small></article>
    </div>
    <div className="profileExtrasGrid two">
      <article className="panel rosterSpotlight"><div className="panelTitle"><h3>⭐ FRANCHISE STAR</h3><span>ROSTER SPOTLIGHT</span></div>{roster?.star?<><strong>{roster.star.name}</strong><p>{roster.star.position}{roster.star.proTeam?` · ${roster.star.proTeam}`:''}</p><b>{roster.star.points?.toFixed?.(1)??roster.star.points} fantasy pts</b></>:<div className="emptyPanel">Star player will appear when ESPN roster stats are available.</div>}</article>
      <article className="panel rosterSpotlight"><div className="panelTitle"><h3>📉 MOST UNDERPERFORMING</h3><span>VS PROJECTION</span></div>{roster?.underperformer?<><strong>{roster.underperformer.name}</strong><p>{roster.underperformer.position}{roster.underperformer.proTeam?` · ${roster.underperformer.proTeam}`:''}</p><b>{roster.underperformer.delta.toFixed(1)} vs projection</b></>:<div className="emptyPanel">Underperformance data will appear once projections and results are available.</div>}</article>
    </div>
    {poll&&<article className="panel managerPollCard"><div className="panelTitle"><h3>MANAGER POLL</h3><span>{total} VOTES</span></div><h2>{poll.question}</h2><div className="pollButtons"><button onClick={()=>vote('a')}>{poll.option_a}<b>{total?Math.round(a/total*100):0}%</b></button><button onClick={()=>vote('b')}>{poll.option_b}<b>{total?Math.round(b/total*100):0}%</b></button></div></article>}
    {status&&<p className="profileExtrasStatus">{status}</p>}
  </section>
}
