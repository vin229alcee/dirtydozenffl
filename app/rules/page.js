import PageShell from "../../components/PageShell";

export const dynamic = "force-dynamic";
const ESPN_LEAGUE_ID="2145514194",SEASON=2026;

const LINEUP_SLOTS={0:"QB",2:"RB",4:"WR",6:"TE",16:"D/ST",17:"K",20:"Bench",21:"IR",23:"FLEX",24:"EDGE",25:"DL",26:"LB",27:"DB",28:"DP",29:"HC"};
const DRAFT_TYPES={SNAKE:"Snake",AUCTION:"Auction",OFFLINE:"Offline"};
const ACQUISITION_TYPES={WAIVERS_TRADITIONAL:"Waivers",WAIVERS_CONTINUOUS:"Continuous waivers",FREEAGENT_BUDGET:"FAAB",FREEAGENT_BUDGET_BLIND:"FAAB",NONE:"None"};
const STAT_NAMES={
  0:"Passing Yards",1:"Passing Touchdowns",2:"Passing 2-Point Conversions",3:"Passing Interceptions",4:"Rushing Yards",5:"Rushing Touchdowns",6:"Rushing 2-Point Conversions",7:"Receptions",8:"Receiving Yards",9:"Receiving Touchdowns",10:"Receiving 2-Point Conversions",11:"Return Touchdowns",12:"Miscellaneous Touchdowns",13:"Fumbles Lost",14:"Fumble Return Touchdowns",15:"Passing Attempts",16:"Passing Completions",17:"Rushing Attempts",18:"Receiving Targets",19:"Field Goals Made",20:"Field Goals Attempted",21:"Extra Points Made",22:"Extra Points Attempted",23:"Field Goals Missed",24:"Extra Points Missed",25:"Points Allowed",26:"Sacks",27:"Safeties",28:"Interceptions",29:"Fumble Recoveries",30:"Blocked Kicks",31:"Kickoff / Punt Return Touchdowns",32:"Points Allowed 0",33:"Points Allowed 1–6",34:"Points Allowed 7–13",35:"Points Allowed 14–17",36:"Points Allowed 18–21",37:"Points Allowed 22–27",38:"Points Allowed 28–34",39:"Points Allowed 35–45",40:"Points Allowed 46+",41:"Yards Allowed",42:"Yards Allowed 0–99",43:"Yards Allowed 100–199",44:"Yards Allowed 200–299",45:"Yards Allowed 300–349",46:"Yards Allowed 350–399",47:"Yards Allowed 400–449",48:"Yards Allowed 450–499",49:"Yards Allowed 500–549",50:"Yards Allowed 550+",53:"50+ Yard Field Goals Made",54:"40–49 Yard Field Goals Made",55:"0–39 Yard Field Goals Made",56:"50+ Yard Field Goals Missed",57:"40–49 Yard Field Goals Missed",58:"0–39 Yard Field Goals Missed",60:"Offensive Fumble Return TD",63:"Pick Six Thrown",66:"Team Win",67:"Team Loss",68:"Team Tie",69:"Points Scored",70:"Margin of Victory",72:"Net Punts",73:"Punt Yards",74:"Punts Inside 10",75:"Punts Inside 20",76:"Blocked Punts",77:"Punt Return Yards",78:"Kickoff Return Yards",79:"Total Return Yards",80:"Punt Return TD",81:"Kickoff Return TD",82:"Fumble Return TD",83:"Interception Return TD",84:"Blocked Kick Return TD",85:"Missed FG Return TD",86:"Defensive 2-Point Return",89:"1-Point Safety",95:"Reception Bonus",96:"Rushing First Downs",97:"Receiving First Downs",98:"Passing First Downs",99:"100–199 Yard Rushing Game",100:"200+ Yard Rushing Game",101:"100–199 Yard Receiving Game",102:"200+ Yard Receiving Game",103:"300–399 Yard Passing Game",104:"400+ Yard Passing Game"};
const SCORING_GROUPS=[
  ["Passing",[0,1,2,3,15,16,63,98,103,104]],
  ["Rushing",[4,5,6,17,96,99,100]],
  ["Receiving",[7,8,9,10,18,95,97,101,102]],
  ["Kicking",[19,20,21,22,23,24,53,54,55,56,57,58]],
  ["Defense / Special Teams",[25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,77,78,79,80,81,82,83,84,85,86,89]],
  ["Miscellaneous",[11,12,13,14,60,66,67,68,69,70,72,73,74,75,76]]
];
const fmtDate=v=>{if(!v)return"Not set";try{return new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",timeZone:"America/Chicago"}).format(new Date(Number(v)));}catch{return"Not set";}};
const yesNo=v=>v?"Yes":"No";
const num=v=>Number(v||0);
const pretty=v=>String(v??"").replaceAll("_"," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
const pointText=v=>{const n=Number(v);if(!Number.isFinite(n))return String(v??"—");return `${n>0?"+":""}${Number.isInteger(n)?n:n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'')} pts`;};

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
function scoringName(item){return STAT_NAMES[Number(item?.statId)]||`ESPN Stat ${item?.statId}`;}
function baseScoring(item){const p=item?.points;if(p!=null&&Number(p)!==0)return pointText(p);const overrides=item?.pointsOverrides;if(overrides&&typeof overrides==="object"&&!Array.isArray(overrides)){const vals=Object.values(overrides).filter(v=>Number(v)!==0);if(vals.length===1)return pointText(vals[0]);}return "Configured";}
function ScoringCard({title,items}){if(!items.length)return null;return <section className="scoringGroup"><div className="scoringGroupHead"><h4>{title}</h4><span>{items.length} CATEGORIES</span></div><div className="scoringTable">{items.map((item,i)=><div className="scoringLine" key={`${item.statId}-${i}`}><div><strong>{scoringName(item)}</strong>{item?.isReverseItem?<small>Reverse scoring</small>:null}</div><b>{baseScoring(item)}</b></div>)}</div></section>}

export default async function Rules(){
  let data=null,error="";
  try{data=await getEspnSettings();}catch(e){error=e?.message||"ESPN settings unavailable";}
  const s=data?.settings||{},draft=s.draftSettings||{},acq=s.acquisitionSettings||{},roster=s.rosterSettings||{},schedule=s.scheduleSettings||{},trade=s.tradeSettings||{},scoring=s.scoringSettings||{};
  const divisions=schedule.divisions||[],regularSeasonWeeks=num(schedule.matchupPeriodCount)||"Not set",playoffTeams=num(schedule.playoffTeamCount)||"Not set",playoffLength=num(schedule.playoffMatchupPeriodLength)||1;
  const scoringItems=scoring.scoringItems||[],used=new Set();
  const grouped=SCORING_GROUPS.map(([title,ids])=>{const items=scoringItems.filter(i=>ids.includes(Number(i.statId)));items.forEach(i=>used.add(i));return [title,items];});
  const other=scoringItems.filter(i=>!used.has(i));if(other.length)grouped.push(["Other ESPN Scoring",other]);
  const waiverBudget=acq.isUsingAcquisitionBudget?`$${num(acq.acquisitionBudget)}`:"Not used",waiverType=ACQUISITION_TYPES[acq.acquisitionType]||pretty(acq.acquisitionType||"Not set"),draftType=DRAFT_TYPES[draft.type]||pretty(draft.type||"Not set");

  return <PageShell title="LEAGUE RULES" kicker="THE LAW">
    <section className="panel rulesDoc rulesIntro">
      <div className="panelTitle"><h3>2026 OFFICIAL SETTINGS</h3><span>{data?"LIVE FROM ESPN":"SYNC UNAVAILABLE"}</span></div>
      <p className="lede">The official competitive settings for Dirty Dozens FFL. ESPN-controlled rules and scoring update from the league configuration automatically; custom league policies live in the House Rules section below.</p>
      {error?<div className="emptyPanel">Live ESPN settings are temporarily unavailable ({error}).</div>:<div className="rulesQuickGrid">
        <div><span>TEAMS</span><strong>{num(s.size)||data?.teams?.length||12}</strong></div><div><span>REG. SEASON</span><strong>{regularSeasonWeeks} WKS</strong></div><div><span>PLAYOFF FIELD</span><strong>{playoffTeams} TEAMS</strong></div><div><span>SCORING</span><strong>{pretty(scoring.scoringType||"H2H Points")}</strong></div>
      </div>}
    </section>
    {!error&&<>
      <section className="rulesSection"><div className="rulesSectionTitle"><b>01</b><div><span>LEAGUE STRUCTURE</span><h2>Format & Competition</h2></div></div><div className="rulesCardGrid">
        <article className="panel ruleCard"><h3>League Format</h3><Rows items={[["League",s.name||data?.name||"Dirty Dozens FFL"],["Teams",num(s.size)||data?.teams?.length||12],["Regular-season matchup periods",regularSeasonWeeks],["Divisions",divisions.length||"None"]]}/></article>
        <article className="panel ruleCard"><h3>Playoffs</h3><Rows items={[["Playoff field",`${playoffTeams} teams`],["Matchup length",`${playoffLength} week${playoffLength===1?"":"s"}`],["Seeding",pretty(schedule.playoffSeedingRule||"ESPN league setting")],["Tiebreaker",pretty(schedule.playoffSeedingRuleBy||scoring.matchupTieRule||"ESPN default")]]}/></article>
        <article className="panel ruleCard"><h3>Roster & Lineup</h3><Rows items={[["Roster construction",rosterText(roster.lineupSlotCounts)],["Roster lock",pretty(roster.rosterLocktimeType||"Not set")],["Season move limit",num(roster.moveLimit)||"No limit shown"]]}/></article>
        <article className="panel ruleCard"><h3>Draft</h3><Rows items={[["Format",draftType],["Draft date",fmtDate(draft.date)],["Seconds per pick",num(draft.timePerSelection)||"Not set"],["Keepers",num(draft.keeperCount)],["Auction budget",draft.type==="AUCTION"?`$${num(draft.auctionBudget)}`:"N/A"]]}/></article>
        <article className="panel ruleCard"><h3>Waivers & Free Agency</h3><Rows items={[["System",waiverType],["FAAB budget",waiverBudget],["Minimum bid",acq.isUsingAcquisitionBudget?`$${num(acq.minimumBid)}`:"N/A"],["Season acquisition limit",num(acq.acquisitionLimit)||"No limit shown"],["Matchup acquisition limit",num(acq.matchupAcquisitionLimit)||num(acq.matchupLimitPerScoringPeriod)||"No limit shown"]]}/></article>
        <article className="panel ruleCard"><h3>Trades</h3><Rows items={[["Trading enabled",yesNo(draft.isTradingEnabled!==false)],["Deadline",fmtDate(trade.deadline)],["Review period",num(trade.revisionHours)?`${num(trade.revisionHours)} hours`:"No review period shown"],["Veto votes",num(trade.vetoVotesRequired)||"Commissioner / league setting"],["Trade limit",num(trade.max)||"No limit shown"]]}/></article>
      </div></section>
      <section className="panel rulesDoc scoringRules"><div className="rulesSectionTitle"><b>02</b><div><span>POINT SYSTEM</span><h2>Scoring Categories</h2></div></div><p className="lede">Every scoring category below comes from the active ESPN league configuration. Positive and negative point values are displayed directly from ESPN when supplied.</p><div className="scoringSummary"><div><span>FORMAT</span><strong>{pretty(scoring.scoringType||"Head-to-head points")}</strong></div><div><span>ACTIVE CATEGORIES</span><strong>{scoringItems.length}</strong></div><div><span>MATCHUP TIES</span><strong>{pretty(scoring.matchupTieRule||"ESPN default")}</strong></div><div><span>HOME BONUS</span><strong>{pointText(num(scoring.homeTeamBonus))}</strong></div></div><div className="scoringGrid">{grouped.map(([title,items])=><ScoringCard key={title} title={title} items={items}/>)}</div><p className="ruleNote">Some ESPN scoring categories use threshold or range overrides instead of a single point value. Those remain governed by the live ESPN configuration.</p></section>
    </>}
    <section className="panel rulesDoc houseRules"><div className="rulesSectionTitle"><b>03</b><div><span>DIRTY DOZENS CONSTITUTION</span><h2>House Rules</h2></div></div><p className="lede">These policies are unique to the league and are not stored by ESPN. They can be filled in and maintained by the commissioner.</p><div className="houseRuleGrid">{["League dues & payouts","Keeper / draft-day house rules","Commissioner powers & disputes","Punishments / last-place rules"].map(r=><article className="houseRule" key={r}><h3>{r}</h3><p>Official rule to be added.</p></article>)}</div></section>
  </PageShell>;
}
