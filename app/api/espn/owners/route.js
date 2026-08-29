import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ESPN_LEAGUE_ID = '2145514194';
const START_SEASON = 2022;
const CURRENT_SEASON = 2026;

function teamName(team) {
  if (!team) return 'Team';
  if (team.name) return team.name;
  return [team.location, team.nickname].filter(Boolean).join(' ').trim() || team.abbrev || `Team ${team.id}`;
}

function headers() {
  const h = { accept: 'application/json, text/plain, */*', 'user-agent': 'DirtyDozensFFL/1.0' };
  if (process.env.ESPN_S2 && process.env.ESPN_SWID) h.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;
  return h;
}

async function fetchSeason(season) {
  const url = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${ESPN_LEAGUE_ID}`);
  url.searchParams.append('view', 'mTeam');
  const response = await fetch(url, { headers: headers(), cache: 'no-store' });
  if (!response.ok) throw new Error(`ESPN ${season}: ${response.status}`);
  return response.json();
}

export async function GET() {
  const seasons = Array.from({ length: CURRENT_SEASON - START_SEASON + 1 }, (_, i) => START_SEASON + i);
  const results = await Promise.all(seasons.map(async season => {
    try { return { season, data: await fetchSeason(season) }; }
    catch { return null; }
  }));

  const owners = new Map();
  for (const result of results.filter(Boolean)) {
    const { season, data } = result;
    const members = new Map((data?.members || []).map(member => [member.id, member]));
    for (const team of data?.teams || []) {
      const member = members.get(team?.owners?.[0]);
      const raw = member?.displayName || [member?.firstName, member?.lastName].filter(Boolean).join(' ') || '';
      if (!raw) continue;
      const key = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!owners.has(key)) owners.set(key, { raw, seasons: [], teams: [] });
      const item = owners.get(key);
      if (!item.seasons.includes(season)) item.seasons.push(season);
      const name = teamName(team);
      if (!item.teams.includes(name)) item.teams.push(name);
    }
  }

  return NextResponse.json({ owners: [...owners.values()].sort((a, b) => a.raw.localeCompare(b.raw)) });
}
