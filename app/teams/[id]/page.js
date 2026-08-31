import Image from "next/image";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import PageShell from "../../../components/PageShell";
import FranchiseProfileBlocks,{DEFAULT_PROFILE_BLOCKS} from "../../../components/FranchiseProfileBlocks";
import { mascotForTeam } from "../../../lib/teamMascots";

export const dynamic="force-dynamic";
const ESPN_LEAGUE_ID="2145514194",CURRENT_SEASON=2026,START_SEASON=2022,MAP_RECORD="__OWNER_MAP__";
const normalize=value=>String(value||"").toLowerCase().replace(/[^a-z0-9]/g,"");
const KNOWN_TITLE_COUNTS={antoniosamilton:1,lukeerbacher:2,vinalcee:1};

function teamName(team){if(!team)return"Team";return team.name||[team.location,team.nickname].filter(Boolean).join(" ").trim()||team.abbrev||`Team ${team.id}`;}
function headers(){const h={accept:"application/json, text/plain, */*","user-agent":"DirtyDozensFFL/1.0"};if(process.env.ESPN_S2&&process.env.ESPN_SWID)h.cookie=`espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;return h;}
function rawOwner(team,members){const member=members.get(team?.owners?.[0]);return member?.displayName||[member?.firstName,member?.lastName].filter(Boolean).join(" ")||"";}
function readableOwner(value){const clean=normalize(value);return !!clean&&!/^espnfan\d+$/i.test(clean)&&!/^[a-z]+\d{2,}$/i.test(clean);}

async function getLocal(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return{teams:[],rankings:[],mappings:new Map(),profiles:new Map(),personalRecords:new Map()};
  const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const [{data:teams},{data:rankings},{data:rows},{data:profiles},{data:records}]=await Promise.all([
    supabase.from("teams").select("*").order("id"),
    supabase.from("power_rankings").select("*").eq("season",CURRENT_SEASON).order("week",{ascending:false}).order("rank"),
    supabase.from("league_records").select("record_value,team_id").eq("record_name",MAP_RECORD),
    supabase.from("team_profiles").select("team_id,profile_image_path,manager_bio,franchise_bio,updated_at,layout_order"),
    supabase.from("manager_personal_records").select("id,team_id,title,record_value,note,season,week,sort_order").order("sort_order").order("id")
  ]);
  const teamRows=teams||[],byId=Object.fromEntries(teamRows.map(team=>[Number(team.id),team]));
  const mappings=new Map((rows||[]).map(row=>{const team=byId[Number(row.team_id)];return[normalize(row.record_value),team?{manager:team.manager||team.name,currentTeam:team.name||""}:null];}).filter(([,value])=>value));
  const profileMap=new Map((profiles||[]).map(profile=>{const imageUrl=profile.profile_image_path?supabase.storage.from("manager-profiles").getPublicUrl(profile.profile_image_path).data.publicUrl:"";return[Number(profile.team_id),{...profile,imageUrl,layout_order:Array.isArray(profile.layout_order)?profile.layout_order:DEFAULT_PROFILE_BLOCKS}];}));
  const personalRecords=new Map();for(const record of records||[]){const id=Number(record.team_id);if(!personalRecords.has(id))personalRecords.set(id,[]);personalRecords.get(id).push(record);}
  return{teams:teamRows,rankings:rankings||[],mappings,profiles:profileMap,personalRecords};
}

async function fetchSeason(season){const url=new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${ESPN_LEAGUE_ID}`);for(const view of["mTeam","mStandings","mMatchupScore","mStatus"])url.searchParams.append("view",view);const response=await fetch(url,{headers:headers(),cache:"no-store"});if(!response.ok)throw new Error(`ESPN ${season}: ${response.status}`);return response.json();}
async function getArchive(){const seasons=Array.from({length:CURRENT_SEASON-START_SEASON+1},(_,index)=>START_SEASON+index);const rows=await Promise.all(seasons.map(async season=>{try{return{season,data:await fetchSeason(season)}}catch{return null}}));return rows.filter(Boolean);}
function resolvedManager(team,members,mappings){const raw=rawOwner(team,members),mapped=mappings.get(normalize(raw));if(mapped)return mapped.manager;return readableOwner(raw)?raw:"";}

function autoRanks(teams,schedule,currentWeek){
  const base=(teams||[]).map(team=>{const overall=team?.record?.overall||{},games=Number(overall.wins||0)+Number(overall.losses||0)+Number(overall.ties||0);return{id:Number(team.id),wins:Number(overall.wins||0),pointsFor:Number(overall.pointsFor||0),winPct:games?(Number(overall.wins||0)+Number(overall.ties||0)*.5)/games:0,qualityWins:0};}),byId=Object.fromEntries(base.map(team=>[team.id,team]));
  for(const game of schedule||[]){if(!game?.home||!game?.away||Number(game.matchupPeriodId)>=currentWeek)continue;const home=byId[Number(game.home.teamId)],away=byId[Number(game.away.teamId)];if(!home||!away)continue;const hs=Number(game.home.totalPoints||0),as=Number(game.away.totalPoints||0);if(hs>as)home.qualityWins+=away.winPct;else if(as>hs)away.qualityWins+=home.winPct;}
  const maxPF=Math.max(...base.map(team=>team.pointsFor),1),maxQuality=Math.max(...base.map(team=>team.qualityWins),1);
  return base.map(team=>({...team,score:team.winPct*.45+(team.pointsFor/maxPF)*.4+(team.qualityWins/maxQuality)*.15})).sort((a,b)=>b.score-a.score||b.pointsFor-a.pointsFor||b.wins-a.wins).map((team,index)=>({...team,rank:index+1}));
}

function buildAllTime(localTeam,archive,mappings){
  const target=normalize(localTeam.manager),games=[],seasonRows=[],titleYears=new Set();
  for(const {season,data} of archive){const members=new Map((data?.members||[]).map(member=>[member.id,member])),teamsById=new Map();let mine=null;for(const team of data?.teams||[]){const manager=resolvedManager(team,members,mappings),item={team,manager,name:teamName(team)};teamsById.set(Number(team.id),item);if(manager&&normalize(manager)===target)mine=item;}if(!mine)continue;if(Number(mine.team.rankCalculatedFinal)===1)titleYears.add(season);const overall=mine.team?.record?.overall||{},wins=Number(overall.wins||0),losses=Number(overall.losses||0),ties=Number(overall.ties||0),played=wins+losses+ties;seasonRows.push({season,wins,losses,ties,pf:Number(overall.pointsFor||0),winPct:played?(wins+ties*.5)/played:0});for(const game of data?.schedule||[]){if(!game?.home||!game?.away||!game.winner||game.winner==="UNDECIDED")continue;const homeId=Number(game.home.teamId),awayId=Number(game.away.teamId),myId=Number(mine.team.id);if(homeId!==myId&&awayId!==myId)continue;const isHome=homeId===myId,mySide=isHome?game.home:game.away,oppSide=isHome?game.away:game.home,opponent=teamsById.get(Number(oppSide.teamId));if(!opponent?.manager)continue;const myScore=Number(mySide.totalPoints),oppScore=Number(oppSide.totalPoints);if(!Number.isFinite(myScore)||!Number.isFinite(oppScore))continue;games.push({season,week:Number(game.matchupPeriodId||0),opponent:opponent.manager,opponentTeam:opponent.name,myScore,oppScore,result:myScore>oppScore?"W":myScore<oppScore?"L":"T",margin:myScore-oppScore});}}
  const wins=games.filter(g=>g.result==="W").length,losses=games.filter(g=>g.result==="L").length,ties=games.filter(g=>g.result==="T").length,pf=games.reduce((s,g)=>s+g.myScore,0),pa=games.reduce((s,g)=>s+g.oppScore,0),high=games.length?[...games].sort((a,b)=>b.myScore-a.myScore)[0]:null,biggest=games.filter(g=>g.result==="W").sort((a,b)=>b.margin-a.margin)[0]||null,bestSeason=seasonRows.length?[...seasonRows].sort((a,b)=>b.winPct-a.winPct||b.wins-a.wins||b.pf-a.pf)[0]:null;
  const head={};for(const game of games){const key=normalize(game.opponent);if(!head[key])head[key]={opponent:game.opponent,w:0,l:0,t:0,pf:0,pa:0,meetings:0};const row=head[key];row.meetings++;row.pf+=game.myScore;row.pa+=game.oppScore;if(game.result==="W")row.w++;else if(game.result==="L")row.l++;else row.t++;}
  return{games:games.sort((a,b)=>b.season-a.season||b.week-a.week),opponents:Object.values(head).sort((a,b)=>b.meetings-a.meetings||b.w-a.w),wins,losses,ties,pf,pa,high,biggest,bestSeason,seasons:seasonRows.sort((a,b)=>b.season-a.season),espnTitles:titleYears.size};
}

export default async function TeamProfile({params}){
  const {id}=await params,local=await getLocal(),localTeam=local.teams.find(team=>String(team.id)===String(id));
  if(!localTeam)return <PageShell title="TEAM PROFILE" kicker="FRANCHISE FILE"><section className="panel emptyPanel">This franchise could not be found. <Link href="/teams">Return to Teams</Link></section></PageShell>;
  const profile=local.profiles.get(Number(localTeam.id))||null,personalRecords=local.personalRecords.get(Number(localTeam.id))||[],archive=await getArchive(),allTime=buildAllTime(localTeam,archive,local.mappings),knownTitles=KNOWN_TITLE_COUNTS[normalize(localTeam.manager)]||0,titles=Math.max(Number(localTeam.championships||0),knownTitles,allTime.espnTitles);
  let current={wins:Number(localTeam.wins||0),losses:Number(localTeam.losses||0),ties:0,pf:Number(localTeam.points_for||0),pa:Number(localTeam.points_against||0),rank:null,week:1};
  const currentArchive=archive.find(row=>row.season===CURRENT_SEASON);if(currentArchive){const data=currentArchive.data,members=new Map((data?.members||[]).map(member=>[member.id,member])),team=(data?.teams||[]).find(item=>normalize(resolvedManager(item,members,local.mappings))===normalize(localTeam.manager))||(data?.teams||[]).find(item=>normalize(teamName(item))===normalize(localTeam.name));if(team){const overall=team?.record?.overall||{},week=Number(data?.status?.currentMatchupPeriod||1),auto=autoRanks(data?.teams||[],data?.schedule||[],week).find(row=>row.id===Number(team.id)),rows=local.rankings.filter(row=>Number(row.week)===week),override=rows.length===12?rows.find(row=>Number(row.team_id)===Number(localTeam.id)):null;current={wins:Number(overall.wins||0),losses:Number(overall.losses||0),ties:Number(overall.ties||0),pf:Number(overall.pointsFor||0),pa:Number(overall.pointsAgainst||0),rank:Number(override?.rank||auto?.rank||0)||null,week};}}
  const currentRecord=`${current.wins}-${current.losses}${current.ties?`-${current.ties}`:""}`,mascot=mascotForTeam(localTeam.name,localTeam.logo||""),initials=String(localTeam.manager||"DD").split(" ").map(part=>part[0]).join("").slice(0,2).toUpperCase();
  return <PageShell title={localTeam.name} kicker="FRANCHISE PROFILE"><section className="panel franchiseProfileHero"><div className="franchiseProfileVisuals"><div className="franchiseManagerPhoto">{profile?.imageUrl?<img src={profile.imageUrl} alt={`${localTeam.manager} profile`}/>:<strong>{initials}</strong>}</div><div className="franchiseMascotWrap">{mascot?<Image src={mascot} alt={`${localTeam.name} mascot`} width={190} height={190}/>:null}</div></div><div className="franchiseProfileCopy"><span className="eyebrow">OWNER & FRANCHISE FILE</span><h2>{localTeam.name}</h2><p className="franchiseManagerName">Managed by <strong>{localTeam.manager}</strong></p><div className="franchiseHeroBadges"><span>{current.rank?`#${current.rank} POWER RANK`:"POWER RANK PENDING"}</span><span>{currentRecord} CURRENT RECORD</span><span>{titles} {titles===1?"TITLE":"TITLES"}</span></div>{profile?.manager_bio?<p className="franchiseHeroBio">{profile.manager_bio}</p>:<p className="franchiseHeroBio franchiseProfileEmpty">This manager has not added an About Me yet.</p>}<div className="franchiseHeroActions"><Link href="/teams" className="secondaryButton">← All Teams</Link><Link href="/manager" className="secondaryButton">Manager HQ</Link></div></div></section><FranchiseProfileBlocks layoutOrder={profile?.layout_order||DEFAULT_PROFILE_BLOCKS} personalRecords={personalRecords} allTime={{...allTime,profileStory:profile?.franchise_bio||""}} current={current} titles={titles} currentSeason={CURRENT_SEASON} startSeason={START_SEASON}/></PageShell>;
}
