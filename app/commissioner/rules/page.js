'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageShell from '../../../components/PageShell';
import { getSupabase } from '../../../lib/supabase';

const supabase=getSupabase();
const SCORE_PREFIX='__RULE_SCORE__:';
const HOUSE_PREFIX='__HOUSE_RULE__:';
const STAT_NAMES={0:'Passing Yards',1:'Passing Touchdowns',2:'Passing 2-Point Conversions',3:'Passing Interceptions',4:'Rushing Yards',5:'Rushing Touchdowns',6:'Rushing 2-Point Conversions',7:'Receptions',8:'Receiving Yards',9:'Receiving Touchdowns',10:'Receiving 2-Point Conversions',11:'Return Touchdowns',12:'Miscellaneous Touchdowns',13:'Fumbles Lost',14:'Fumble Return Touchdowns',15:'Passing Attempts',16:'Passing Completions',17:'Rushing Attempts',18:'Receiving Targets',19:'Field Goals Made',20:'Field Goals Attempted',21:'Extra Points Made',22:'Extra Points Attempted',23:'Field Goals Missed',24:'Extra Points Missed',25:'Points Allowed',26:'Sacks',27:'Safeties',28:'Interceptions',29:'Fumble Recoveries',30:'Blocked Kicks',31:'Kickoff / Punt Return Touchdowns',32:'Points Allowed 0',33:'Points Allowed 1–6',34:'Points Allowed 7–13',35:'Points Allowed 14–17',36:'Points Allowed 18–21',37:'Points Allowed 22–27',38:'Points Allowed 28–34',39:'Points Allowed 35–45',40:'Points Allowed 46+',41:'Yards Allowed',42:'Yards Allowed 0–99',43:'Yards Allowed 100–199',44:'Yards Allowed 200–299',45:'Yards Allowed 300–349',46:'Yards Allowed 350–399',47:'Yards Allowed 400–449',48:'Yards Allowed 450–499',49:'Yards Allowed 500–549',50:'Yards Allowed 550+',53:'50+ Yard Field Goals Made',54:'40–49 Yard Field Goals Made',55:'0–39 Yard Field Goals Made',56:'50+ Yard Field Goals Missed',57:'40–49 Yard Field Goals Missed',58:'0–39 Yard Field Goals Missed',60:'Offensive Fumble Return TD',63:'Pick Six Thrown',66:'Team Win',67:'Team Loss',68:'Team Tie',69:'Points Scored',70:'Margin of Victory',72:'Net Punts',73:'Punt Yards',74:'Punts Inside 10',75:'Punts Inside 20',76:'Blocked Punts',77:'Punt Return Yards',78:'Kickoff Return Yards',79:'Total Return Yards',80:'Punt Return TD',81:'Kickoff Return TD',82:'Fumble Return TD',83:'Interception Return TD',84:'Blocked Kick Return TD',85:'Missed FG Return TD',86:'Defensive 2-Point Return',89:'1-Point Safety',95:'Reception Bonus',96:'Rushing First Downs',97:'Receiving First Downs',98:'Passing First Downs',99:'100–199 Yard Rushing Game',100:'200+ Yard Rushing Game',101:'100–199 Yard Receiving Game',102:'200+ Yard Receiving Game',103:'300–399 Yard Passing Game',104:'400+ Yard Passing Game'};
const DEFAULT_HOUSE=[
  {key:'dues',title:'League dues & payouts',body:''},
  {key:'draft',title:'Keeper / draft-day house rules',body:''},
  {key:'commissioner',title:'Commissioner powers & disputes',body:''},
  {key:'punishment',title:'Punishments / last-place rules',body:''},
];
const pointText=v=>{const n=Number(v);if(!Number.isFinite(n))return String(v??'Configured');return `${n>0?'+':''}${Number.isInteger(n)?n:n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'')} pts`;};
function espnValue(item){if(item?.points!=null&&Number(item.points)!==0)return pointText(item.points);const o=item?.pointsOverrides;if(o&&typeof o==='object'&&!Array.isArray(o)){const vals=Object.values(o).filter(v=>Number(v)!==0);if(vals.length===1)return pointText(vals[0]);}return 'Configured';}

export default function CommissionerRules(){
  const [session,setSession]=useState(null),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[status,setStatus]=useState('');
  const [items,setItems]=useState([]),[overrides,setOverrides]=useState({}),[house,setHouse]=useState(DEFAULT_HOUSE),[loading,setLoading]=useState(true);

  useEffect(()=>{if(!supabase)return;supabase.auth.getSession().then(({data})=>setSession(data.session));const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe();},[]);
  useEffect(()=>{if(session)load();},[session]);

  async function load(){
    setLoading(true);setStatus('');
    try{
      const [espnRes,dbRes]=await Promise.all([fetch('/api/espn/settings',{cache:'no-store'}),supabase.from('league_records').select('*').order('id')]);
      const espn=await espnRes.json();if(!espnRes.ok)throw new Error(espn.error||'ESPN settings unavailable');
      setItems(espn?.settings?.scoringSettings?.scoringItems||[]);
      const score={},houseRows={};
      for(const row of dbRes.data||[]){
        if(String(row.record_name||'').startsWith(SCORE_PREFIX))score[String(row.record_name).slice(SCORE_PREFIX.length)]=row.record_value||'';
        if(String(row.record_name||'').startsWith(HOUSE_PREFIX))houseRows[String(row.record_name).slice(HOUSE_PREFIX.length)]=row.record_value||'';
      }
      setOverrides(score);
      setHouse(DEFAULT_HOUSE.map(rule=>{try{const saved=JSON.parse(houseRows[rule.key]||'');return {...rule,...saved};}catch{return rule;}}));
    }catch(e){setStatus(e.message);}finally{setLoading(false);}
  }

  async function signIn(e){e.preventDefault();const {error}=await supabase.auth.signInWithPassword({email,password});setStatus(error?error.message:'Signed in.');}
  async function saveScoring(){
    setStatus('Saving scoring overrides…');
    const {data:existing,error:readError}=await supabase.from('league_records').select('id,record_name').like('record_name',`${SCORE_PREFIX}%`);
    if(readError)return setStatus(readError.message);
    if(existing?.length){const {error}=await supabase.from('league_records').delete().in('id',existing.map(r=>r.id));if(error)return setStatus(error.message);}
    const rows=Object.entries(overrides).filter(([,v])=>String(v).trim()!=='').map(([id,v])=>({record_name:`${SCORE_PREFIX}${id}`,record_value:String(v).trim(),season:2026}));
    if(rows.length){const {error}=await supabase.from('league_records').insert(rows);if(error)return setStatus(error.message);}
    setStatus('Scoring display overrides saved. ESPN remains the scoring engine.');
  }
  async function saveHouse(){
    setStatus('Saving house rules…');
    const {data:existing,error:readError}=await supabase.from('league_records').select('id,record_name').like('record_name',`${HOUSE_PREFIX}%`);
    if(readError)return setStatus(readError.message);
    if(existing?.length){const {error}=await supabase.from('league_records').delete().in('id',existing.map(r=>r.id));if(error)return setStatus(error.message);}
    const rows=house.map(r=>({record_name:`${HOUSE_PREFIX}${r.key}`,record_value:JSON.stringify({title:r.title.trim(),body:r.body.trim()}),season:2026}));
    const {error}=await supabase.from('league_records').insert(rows);setStatus(error?error.message:'House rules saved.');
  }
  const sorted=useMemo(()=>[...items].sort((a,b)=>Number(a.statId)-Number(b.statId)),[items]);

  if(!supabase)return <PageShell title="Commissioner Rules"><section className="panel">Supabase configuration is missing.</section></PageShell>;
  if(!session)return <PageShell title="Commissioner Rules"><section className="panel commissionerAuth"><div className="panelTitle"><h3>COMMISSIONER LOGIN</h3><span>RULEBOOK ACCESS</span></div><form className="commissionerForm" onSubmit={signIn}><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="primaryButton">Sign In</button></form>{status&&<p>{status}</p>}</section></PageShell>;

  return <PageShell title="Commissioner Rules" kicker="RULEBOOK CONTROL">
    <div className="commissionerTopbar"><div><strong>Rules & Scoring Editor</strong><div style={{color:'#8e98a3',fontSize:12}}>Edit the website rulebook without changing ESPN's actual scoring engine.</div></div><div style={{display:'flex',gap:8}}><Link className="secondaryButton" href="/commissioner">Control Room</Link><button className="secondaryButton" onClick={()=>supabase.auth.signOut()}>Sign Out</button></div></div>
    <section className="panel commissionerPanel"><div className="panelTitle"><h3>SCORING CATEGORIES</h3><span>COMMISSIONER OVERRIDES</span></div><p className="ruleNote">Leave a field blank to display ESPN's live value. Enter a value only when you want the Rules page to show a commissioner-defined description or point value.</p>{loading?<div className="emptyPanel">Loading ESPN scoring…</div>:<div className="ruleEditorGrid">{sorted.map(item=><label className="ruleEditItem" key={item.statId}><span><strong>{STAT_NAMES[Number(item.statId)]||`ESPN Stat ${item.statId}`}</strong><small>ESPN: {espnValue(item)}</small></span><input placeholder="Use ESPN value" value={overrides[item.statId]||''} onChange={e=>setOverrides({...overrides,[item.statId]:e.target.value})}/></label>)}</div>}<button className="primaryButton" onClick={saveScoring} disabled={loading}>Save Scoring Overrides</button></section>
    <section className="panel commissionerPanel"><div className="panelTitle"><h3>HOUSE RULES</h3><span>DIRTY DOZENS CONSTITUTION</span></div><div className="houseRuleEditor">{house.map((rule,i)=><article className="ruleEditCard" key={rule.key}><label>Rule title<input value={rule.title} onChange={e=>setHouse(prev=>prev.map((r,x)=>x===i?{...r,title:e.target.value}:r))}/></label><label>Official rule<textarea rows="5" placeholder="Enter the official league rule…" value={rule.body} onChange={e=>setHouse(prev=>prev.map((r,x)=>x===i?{...r,body:e.target.value}:r))}/></label></article>)}</div><button className="primaryButton" onClick={saveHouse}>Save House Rules</button></section>
    {status&&<div className="statusBar" onClick={()=>setStatus('')}>{status}<span>×</span></div>}
  </PageShell>;
}
