"use client";

import { useEffect, useMemo, useState } from "react";
import PageShell from "../../../components/PageShell";
import { getSupabase } from "../../../lib/supabase";

const supabase = getSupabase();
const SEASON = 2026;
const TYPES = [
  ["bullseye", "Bullseye", "Managers predict their own final score. Closest prediction wins automatically."],
  ["highest_score", "Crystal Ball", "Managers predict the week's highest-scoring team."],
  ["lowest_score", "Cold Take", "Managers predict the week's lowest-scoring team."],
  ["game_of_week", "Game of the Week", "Managers pick the winner of one featured matchup."],
  ["upset_alert", "Upset Alert", "Managers predict YES or NO on a selected underdog winning."],
];

function emptyForm(){return{week:1,title:"",description:"",challenge_type:"bullseye",points:3,lock_at:"",team1_id:"",team2_id:"",underdog_team_id:"",opponent_team_id:""};}

export default function CommissionerChallenges(){
  const [session,setSession]=useState(null),[commissioner,setCommissioner]=useState(false),[teams,setTeams]=useState([]),[challenges,setChallenges]=useState([]),[entries,setEntries]=useState([]),[form,setForm]=useState(emptyForm()),[status,setStatus]=useState(""),[loading,setLoading]=useState(true);

  async function load(){
    if(!supabase)return;
    const {data:s}=await supabase.auth.getSession();
    const active=s.session||null;setSession(active);
    if(!active){setLoading(false);return;}
    const [{data:m},{data:t},{data:c},{data:e}]=await Promise.all([
      supabase.from("manager_teams").select("is_commissioner").eq("user_id",active.user.id).maybeSingle(),
      supabase.from("teams").select("id,name,manager").order("id"),
      supabase.from("commissioner_challenges").select("*").eq("season",SEASON).order("week",{ascending:false}),
      supabase.from("commissioner_challenge_entries").select("id,challenge_id,manager_team_id,answer,is_winner,points_awarded,created_at").order("created_at",{ascending:false}),
    ]);
    setCommissioner(Boolean(m?.is_commissioner));setTeams(t||[]);setChallenges(c||[]);setEntries(e||[]);setLoading(false);
  }

  useEffect(()=>{load();const {data:l}=supabase?.auth.onAuthStateChange(()=>load())||{data:null};return()=>l?.subscription?.unsubscribe()},[]);

  const teamById=useMemo(()=>Object.fromEntries(teams.map(t=>[Number(t.id),t])),[teams]);
  const selected=challenges.find(c=>Number(c.week)===Number(form.week));

  useEffect(()=>{
    if(!selected)return;
    const cfg=selected.config||{};
    setForm({week:selected.week,title:selected.title||"",description:selected.description||"",challenge_type:selected.challenge_type||"bullseye",points:Number(selected.points||2),lock_at:selected.lock_at?new Date(selected.lock_at).toISOString().slice(0,16):"",team1_id:String(cfg.team1_id||""),team2_id:String(cfg.team2_id||""),underdog_team_id:String(cfg.underdog_team_id||""),opponent_team_id:String(cfg.opponent_team_id||"")});
  },[selected?.id]);

  function setField(key,value){setForm(f=>({...f,[key]:value}));}

  async function publish(){
    if(!commissioner)return;
    if(!form.title.trim())return setStatus("Add a challenge title.");
    if(form.challenge_type==="game_of_week"&&(!form.team1_id||!form.team2_id||form.team1_id===form.team2_id))return setStatus("Choose two different teams for Game of the Week.");
    if(form.challenge_type==="upset_alert"&&(!form.underdog_team_id||!form.opponent_team_id||form.underdog_team_id===form.opponent_team_id))return setStatus("Choose the underdog and its opponent.");
    const config=form.challenge_type==="game_of_week"?{team1_id:Number(form.team1_id),team2_id:Number(form.team2_id)}:form.challenge_type==="upset_alert"?{underdog_team_id:Number(form.underdog_team_id),opponent_team_id:Number(form.opponent_team_id)}:{};
    const payload={season:SEASON,week:Number(form.week),title:form.title.trim(),description:form.description.trim(),challenge_type:form.challenge_type,points:Number(form.points),status:"open",lock_at:form.lock_at?new Date(form.lock_at).toISOString():null,config,created_by:session.user.id,scored_at:null};
    const {error}=await supabase.from("commissioner_challenges").upsert(payload,{onConflict:"season,week"});
    setStatus(error?error.message:`Week ${form.week} challenge published. Winner scoring is automatic when all 6 matchup results are saved.`);
    if(!error)await load();
  }

  async function lockChallenge(id){const {error}=await supabase.from("commissioner_challenges").update({status:"locked"}).eq("id",id);setStatus(error?error.message:"Challenge locked.");if(!error)await load();}
  async function reopenChallenge(id){const {error}=await supabase.from("commissioner_challenges").update({status:"open",scored_at:null}).eq("id",id);setStatus(error?error.message:"Challenge reopened.");if(!error)await load();}

  if(loading)return <PageShell title="CHALLENGE HQ" kicker="COMMISSIONER CONTROL"><section className="panel">Loading challenge tools…</section></PageShell>;
  if(!session)return <PageShell title="CHALLENGE HQ" kicker="COMMISSIONER CONTROL"><section className="panel">Sign in through Commissioner HQ first.</section></PageShell>;
  if(!commissioner)return <PageShell title="CHALLENGE HQ" kicker="COMMISSIONER CONTROL"><section className="panel">Commissioner access required.</section></PageShell>;

  const typeHelp=TYPES.find(([v])=>v===form.challenge_type)?.[2]||"";
  return <PageShell title="CHALLENGE HQ" kicker="AUTOMATED WEEKLY CHALLENGES">
    <section className="panel" style={{marginBottom:18}}>
      <span className="eyebrow">AUTOMATED SCORING</span>
      <h2 style={{fontFamily:"Oswald",fontSize:34,margin:"6px 0"}}>Post it once. The database scores it for you.</h2>
      <p>When all six completed league matchups for that week are saved in Commissioner HQ, the challenge automatically finds the winner, awards Draft Race points, and marks the challenge scored.</p>
    </section>

    <div className="commissionerGrid" style={{marginBottom:18}}>
      <section className="panel">
        <div className="panelTitle"><h3>CREATE WEEKLY CHALLENGE</h3><span>2026</span></div>
        <label>Week<input type="number" min="1" max="18" value={form.week} onChange={e=>setField("week",e.target.value)} /></label>
        <label>Challenge type<select value={form.challenge_type} onChange={e=>setField("challenge_type",e.target.value)}>{TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <p style={{opacity:.72}}>{typeHelp}</p>
        <label>Title<input value={form.title} maxLength={80} onChange={e=>setField("title",e.target.value)} placeholder="Week 6 · Bullseye" /></label>
        <label>Description<textarea rows={4} value={form.description} onChange={e=>setField("description",e.target.value)} placeholder="Explain the challenge in one or two sentences." /></label>
        <label>Draft Race points<select value={form.points} onChange={e=>setField("points",e.target.value)}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} points</option>)}</select></label>
        <label>Lock time<input type="datetime-local" value={form.lock_at} onChange={e=>setField("lock_at",e.target.value)} /></label>

        {form.challenge_type==="game_of_week"?<div className="commissionerGrid"><label>Team 1<select value={form.team1_id} onChange={e=>setField("team1_id",e.target.value)}><option value="">Choose team</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Team 2<select value={form.team2_id} onChange={e=>setField("team2_id",e.target.value)}><option value="">Choose team</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div>:null}
        {form.challenge_type==="upset_alert"?<div className="commissionerGrid"><label>Underdog team<select value={form.underdog_team_id} onChange={e=>setField("underdog_team_id",e.target.value)}><option value="">Choose underdog</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Opponent<select value={form.opponent_team_id} onChange={e=>setField("opponent_team_id",e.target.value)}><option value="">Choose opponent</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div>:null}

        <button className="primaryButton" onClick={publish}>{selected?"Update Week Challenge":"Publish Challenge"}</button>
        {status?<p style={{marginTop:12}}>{status}</p>:null}
      </section>

      <section className="panel">
        <div className="panelTitle"><h3>AUTO-SCORING RULES</h3><span>NO REVIEW NEEDED</span></div>
        <div className="recordRow"><span>Bullseye</span><strong>Closest own-team score</strong></div>
        <div className="recordRow"><span>Crystal Ball</span><strong>Highest scorer</strong></div>
        <div className="recordRow"><span>Cold Take</span><strong>Lowest scorer</strong></div>
        <div className="recordRow"><span>Game of the Week</span><strong>Correct winner</strong></div>
        <div className="recordRow"><span>Upset Alert</span><strong>Correct YES / NO</strong></div>
        <p style={{marginTop:14,opacity:.72}}>Bullseye ties award full points to every tied closest prediction. Challenges score only after all six weekly matchup results are complete.</p>
      </section>
    </div>

    <section className="panel">
      <div className="panelTitle"><h3>CHALLENGE HISTORY</h3><span>{challenges.length} POSTED</span></div>
      <div className="franchiseHeadRows">{challenges.length?challenges.map(c=>{const e=entries.filter(x=>Number(x.challenge_id)===Number(c.id));const winners=e.filter(x=>x.is_winner);return <div key={c.id}><div><strong>Week {c.week} · {c.title}</strong><small>{c.challenge_type.replaceAll("_"," ")} · {e.length} entries · {c.status.toUpperCase()}{winners.length?` · Winner${winners.length>1?"s":""}: ${winners.map(w=>teamById[Number(w.manager_team_id)]?.name||`Team ${w.manager_team_id}`).join(", ")}`:""}</small></div><div style={{display:"flex",gap:8,alignItems:"center"}}><b>{Number(c.points).toFixed(0)} pts</b>{c.status==="open"?<button className="secondaryButton" onClick={()=>lockChallenge(c.id)}>Lock</button>:c.status==="locked"?<button className="secondaryButton" onClick={()=>reopenChallenge(c.id)}>Reopen</button>:null}</div></div>}):<div className="emptyPanel">No weekly challenges posted yet.</div>}</div>
    </section>
  </PageShell>;
}
