import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function teamDisplayName(team) {
  if (!team) return 'Unknown Team';
  if (team.name) return team.name;
  return [team.location, team.nickname].filter(Boolean).join(' ').trim() || team.abbrev || `ESPN Team ${team.id}`;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const leagueId = searchParams.get('leagueId')?.trim();
  const season = Number(searchParams.get('season') || 2026);
  const week = Number(searchParams.get('week') || 1);

  if (!leagueId || !/^\d+$/.test(leagueId)) {
    return NextResponse.json({ error: 'Enter a valid numeric ESPN league ID.' }, { status: 400 });
  }
  if (!Number.isInteger(season) || season < 2000 || season > 2100) {
    return NextResponse.json({ error: 'Enter a valid season.' }, { status: 400 });
  }
  if (!Number.isInteger(week) || week < 1 || week > 18) {
    return NextResponse.json({ error: 'Enter a valid fantasy week.' }, { status: 400 });
  }

  const url = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}`);
  url.searchParams.append('view', 'mTeam');
  url.searchParams.append('view', 'mMatchupScore');
  url.searchParams.set('scoringPeriodId', String(week));

  const headers = {
    accept: 'application/json, text/plain, */*',
    'user-agent': 'DirtyDozensFFL/1.0',
  };

  const espnS2 = process.env.ESPN_S2;
  const swid = process.env.ESPN_SWID;
  if (espnS2 && swid) headers.cookie = `espn_s2=${espnS2}; SWID=${swid}`;

  try {
    const response = await fetch(url, { headers, cache: 'no-store' });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }

    if (!response.ok) {
      const message = data?.messages?.[0] || data?.message || `ESPN returned ${response.status}.`;
      const unauthorized = response.status === 401 || response.status === 403 || /not authorized/i.test(message);
      return NextResponse.json({
        error: unauthorized ? 'This ESPN league is private and needs server-side ESPN authentication before imports can run.' : message,
        needsAuth: unauthorized,
      }, { status: response.status });
    }

    const teams = Array.isArray(data?.teams) ? data.teams : [];
    const teamById = new Map(teams.map(team => [Number(team.id), team]));
    const schedule = Array.isArray(data?.schedule) ? data.schedule : [];
    const weekGames = schedule.filter(game => Number(game.matchupPeriodId) === week && game.home && game.away);

    const matchups = weekGames.map(game => {
      const homeId = Number(game.home.teamId);
      const awayId = Number(game.away.teamId);
      return {
        espnMatchupId: game.id,
        home: {
          espnTeamId: homeId,
          name: teamDisplayName(teamById.get(homeId)),
          abbrev: teamById.get(homeId)?.abbrev || '',
          score: game.home.totalPoints == null ? null : Number(game.home.totalPoints),
        },
        away: {
          espnTeamId: awayId,
          name: teamDisplayName(teamById.get(awayId)),
          abbrev: teamById.get(awayId)?.abbrev || '',
          score: game.away.totalPoints == null ? null : Number(game.away.totalPoints),
        },
      };
    });

    return NextResponse.json({
      leagueId,
      season,
      week,
      currentMatchupPeriod: data?.status?.currentMatchupPeriod ?? null,
      teams: teams.map(team => ({ espnTeamId: Number(team.id), name: teamDisplayName(team), abbrev: team.abbrev || '' })),
      matchups,
      authenticated: Boolean(espnS2 && swid),
    });
  } catch (error) {
    return NextResponse.json({ error: `Could not reach ESPN: ${error.message}` }, { status: 502 });
  }
}
