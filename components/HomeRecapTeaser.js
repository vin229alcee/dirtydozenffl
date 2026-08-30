"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
const format=(v)=>Number(v||0).toFixed(1);

export default function HomeRecapTeaser(){
  const [recap,setRecap]=useState(null);
  useEffect(()=>{let active=true;fetch("/api/recap",{cache:"no-store"}).then(r=>r.json()).then(d=>active&&setRecap(d)).catch(()=>active&&setRecap({ready:false}));return()=>{active=false};},[]);
  return <section className="panel span2 recapLead homeRecapTeaser">
    <div className="panelTitle"><h3>THE DIRTY DOZENS WEEKLY</h3><Link href="/recap">FULL RECAP</Link></div>
    {!recap?<p className="recapCopy">Building this week&apos;s league check-in…</p>:recap.ready?<>
      <span className="eyebrow">WEEK {recap.week} IN REVIEW · ESPN AUTO</span>
      <h2>{recap.high.team.name} wears the crown</h2>
      <p>League-high <strong>{format(recap.high.score)}</strong> points · league average <strong>{format(recap.average)}</strong> · biggest win <strong>{recap.biggest.winner.name} +{format(recap.biggest.margin)}</strong>.</p>
      <div className="recapGrid" style={{marginTop:14}}>
        <article className="recapStat"><span>👑 WEEKLY KING</span><h3>{recap.high.team.name}</h3><strong>{format(recap.high.score)} PTS</strong></article>
        <article className="recapStat"><span>😬 TOUGHEST LOSS</span><h3>{recap.toughLoss?.team?.name||recap.closest.loser.name}</h3><strong>{format(recap.toughLoss?.score)} PTS</strong></article>
        <article className="recapStat"><span>📈 BIGGEST MOVER</span><h3>{recap.biggestMover?.name||"No mover yet"}</h3><strong>{recap.biggestMover?.move?`+${recap.biggestMover.move} SPOTS`:"—"}</strong></article>
        <article className="recapStat"><span>🔥 NEXT UP</span><h3>{recap.gameOfWeek?`${recap.gameOfWeek.home.name} vs ${recap.gameOfWeek.away.name}`:"Matchups pending"}</h3><strong>{recap.gameOfWeek?`#${recap.gameOfWeek.homeRank} vs #${recap.gameOfWeek.awayRank}`:"—"}</strong></article>
      </div>
      {recap.trashTalk?.body&&<div className="recapCopy" style={{marginTop:16}}><span className="eyebrow">💬 TRASH TALK CHECK</span><p><strong>{recap.trashTalk.team?.name||"League manager"}:</strong> “{recap.trashTalk.body}”</p></div>}
      {recap.commissionerTake?.body&&<div className="recapCopy" style={{marginTop:16}}><span className="eyebrow">FROM THE COMMISH</span><p>{recap.commissionerTake.body}</p></div>}
    </>:<><span className="eyebrow">WEEK IN REVIEW</span><h2>Dirty Dozens Weekly is warming up</h2><p>Once ESPN posts final results, the weekly king, toughest loss, power-ranking mover and next featured matchup will populate automatically.</p></>}
  </section>;
}
