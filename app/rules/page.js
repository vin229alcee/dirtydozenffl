import PageShell from "../../components/PageShell";

export const dynamic = "force-dynamic";
const ESPN_LEAGUE_ID="2145514194",SEASON=2026;

const LINEUP_SLOTS={0:"QB",2:"RB",4:"WR",6:"TE",16:"D/ST",17:"K",20:"Bench",21:"IR",23:"FLEX",24:"EDGE",25:"DL",26:"LB",27:"DB",28:"DP",29:"HC"};
const DRAFT_TYPES={SNAKE:"Snake",AUCTION:"Auction",OFFLINE:"Offline"};
const ACQUISITION_TYPES={WAIVERS_TRADITIONAL:"Waivers",WAIVERS_CONTINUOUS:"Continuous waivers",FREEAGENT_BUDGET:"FAAB",FREEAGENT_BUDGET_BLIND:"FAAB",NONE:"None"};
const fmtDate=v=>{if(!v)return"Not set";try{return new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",timeZone:"America/Chicago"}).format(new Date(Number(v)));}catch{return"Not set";}};
const yesNo=v=>v?"Yes":"No";
const num=v=>Number(v||0);

async function getEspnSettings(){
  const u=new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${ESPN_LEAGUE_ID}`);
  for(const view of["mSettings","mStatus"])u.searchParams.append("view",view);
  const headers={accept:"application/json, text/plain, */*","user-agent":"DirtyDozensFFL/1.0"};
  if(process.env.ESPN_S2&&process.env.ESPN_SWID)headers.cookie=`espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;
  const r=await fetch(u,{headers,cache:"no-store"});
  if(!r.ok)throw new Error(`ESPN returned ${r.status}`);
  return r.json();
}

function Rows({items}){return <div className="rulesSettings">{items.map(([label,value])=><div className="recordRow" key={label}><span>{label}</span><strong>{value??"Not set"}</strong></div>)}</div>}
function rosterText(counts={}){const order=[0,2,4,6,23,16,17,20,21];return order.filter(id=>num(counts[id])>0).map(id=>`${num(counts[id])} ${LINEUP_SLOTS[id]||`Slot ${id}`}`).join(" · ")||"Roster slots unavailable";}

export default async function Rules(){
  let data=null,error="";
  try{data=await getEspnSettings();}catch(e){error=e?.message||"ESPN settings unavailable";}
  const s=data?.settings||{},draft=s.draftSettings||{},acq=s.acquisitionSettings||{},roster=s.rosterSettings||{},schedule=s.scheduleSettings||{},trade=s.tradeSettings||{},scoring=s.scoringSettings||{};
  const divisions=schedule.divisions||[];
  const regularSeasonWeeks=num(schedule.matchupPeriodCount)||"Not set";
  const playoffTeams=num(schedule.playoffTeamCount)||"Not set";
  const playoffLength=num(schedule.playoffMatchupPeriodLength)||1;
  const scoringItems=scoring.scoringItems||[];
  const bonuses=scoringItems.filter(i=>Array.isArray(i.pointsOverrides)&&i.pointsOverrides.length).length;
  const waiverBudget=acq.isUsingAcquisitionBudget?`$${num(acq.acquisitionBudget)}`:"Not used";
  const waiverType=ACQUISITION_TYPES[acq.acquisitionType]||String(acq.acquisitionType||"Not set").replaceAll("_"," ");
  const draftType=DRAFT_TYPES[draft.type]||String(draft.type||"Not set").replaceAll("_"," ");
  const tradeDeadline=fmtDate(trade.deadline);

  return <PageShell title="LEAGUE RULES" kicker="THE LAW">
    <section className="panel rulesDoc">
      <div className="panelTitle"><h3>OFFICIAL ESPN SETTINGS</h3><span>{data?`SYNCED · ${SEASON}`:"SYNC UNAVAILABLE"}</span></div>
      <p className="lede">The competitive settings below are pulled directly from the Dirty Dozens ESPN league so this page stays aligned with the official fantasy platform.</p>
      {error?<div className="emptyPanel">Live ESPN settings are temporarily unavailable ({error}).</div>:<>
        <div className="ruleRow"><b>01</b><div><h3>League Format</h3><Rows items={[["League",s.name||data?.name||"Dirty Dozens FFL"],["Teams",num(s.size)||data?.teams?.length||12],["Regular-season matchup periods",regularSeasonWeeks],["Divisions",divisions.length||"None"],["Playoff teams",playoffTeams],["Playoff matchup length",`${playoffLength} week${playoffLength===1?"":"s"}`]]}/></div></div>
        <div className="ruleRow"><b>02</b><div><h3>Roster & Lineup</h3><Rows items={[["Roster construction",rosterText(roster.lineupSlotCounts)],["Roster lock type",String(roster.rosterLocktimeType||"Not set").replaceAll("_"," ")],["Season move limit",num(roster.moveLimit)||"No season limit shown"]]}/></div></div>
        <div className="ruleRow"><b>03</b><div><h3>Draft</h3><Rows items={[["Draft format",draftType],["Draft date",fmtDate(draft.date)],["Seconds per pick",num(draft.timePerSelection)||"Not set"],["Keeper count",num(draft.keeperCount)],["Auction budget",draft.type==="AUCTION"?`$${num(draft.auctionBudget)}`:"N/A"]]}/></div></div>
        <div className="ruleRow"><b>04</b><div><h3>Waivers & Free Agency</h3><Rows items={[["Acquisition system",waiverType],["FAAB budget",waiverBudget],["Minimum bid",acq.isUsingAcquisitionBudget?`$${num(acq.minimumBid)}`:"N/A"],["Season acquisition limit",num(acq.acquisitionLimit)||"No season limit shown"],["Matchup acquisition limit",num(acq.matchupAcquisitionLimit)||num(acq.matchupLimitPerScoringPeriod)||"No matchup limit shown"]]}/></div></div>
        <div className="ruleRow"><b>05</b><div><h3>Trades</h3><Rows items={[["Trading enabled",yesNo(draft.isTradingEnabled!==false)],["Trade deadline",tradeDeadline],["Review period",num(trade.revisionHours)?`${num(trade.revisionHours)} hours`:"No review period shown"],["Veto votes required",num(trade.vetoVotesRequired)||"Commissioner / league setting"],["Trade limit",num(trade.max)||"No season limit shown"]]}/></div></div>
        <div className="ruleRow"><b>06</b><div><h3>Scoring</h3><Rows items={[["Scoring type",String(scoring.scoringType||"Head-to-head points").replaceAll("_"," ")],["Configured scoring categories",scoringItems.length||"Unavailable"],["Categories with bonus overrides",bonuses],["Home-team bonus",num(scoring.homeTeamBonus)||0],["Matchup tie rule",String(scoring.matchupTieRule||"ESPN default").replaceAll("_"," ")]]}/><p className="ruleNote">ESPN remains the authoritative source for individual player-stat scoring values. This summary reflects the league-level scoring configuration returned by ESPN.</p></div></div>
        <div className="ruleRow"><b>07</b><div><h3>Playoffs & Tiebreakers</h3><Rows items={[["Playoff field",`${playoffTeams} teams`],["Playoff matchup length",`${playoffLength} week${playoffLength===1?"":"s"}`],["Playoff seeding rule",String(schedule.playoffSeedingRule||"ESPN league setting").replaceAll("_"," ")],["Seeding tiebreaker",String(schedule.playoffSeedingRuleBy||"ESPN league setting").replaceAll("_"," ")],["Matchup tie rule",String(scoring.matchupTieRule||"ESPN default").replaceAll("_"," ")]]}/></div></div>
      </>}
    </section>
    <section className="panel rulesDoc">
      <div className="panelTitle"><h3>DIRTY DOZENS HOUSE RULES</h3><span>COMMISSIONER RULEBOOK</span></div>
      <p className="lede">ESPN can supply gameplay settings, but league-specific policies such as dues, payouts, punishments, disputes and commissioner powers must be maintained separately.</p>
      {["League dues & payouts","Keeper / draft-day house rules","Commissioner powers & disputes","Punishments / last-place rules"].map((r,i)=><div className="ruleRow" key={r}><b>{String(i+8).padStart(2,"0")}</b><div><h3>{r}</h3><p>Add the official Dirty Dozens house rule here.</p></div></div>)}
    </section>
  </PageShell>;
}
