"use client";

import { useEffect, useMemo, useState } from "react";
import PageShell from "../../components/PageShell";
import { getSupabase } from "../../lib/supabase";
import styles from "./page.module.css";

const supabase = getSupabase();
const SEASON = 2026;

const WEEK_SLOTS = [
  { week: 1, slot: "QB1", position: "QB", label: "Starting Quarterback", group: "Backfield" },
  { week: 2, slot: "RB1", position: "RB", label: "Lead Running Back", group: "Backfield" },
  { week: 3, slot: "WR1", position: "WR", label: "No. 1 Wide Receiver", group: "Receivers" },
  { week: 4, slot: "TE1", position: "TE", label: "Starting Tight End", group: "Receivers" },
  { week: 5, slot: "LT", position: "OT", label: "Left Tackle", group: "Offensive Line" },
  { week: 6, slot: "LG", position: "IOL", label: "Left Guard", group: "Offensive Line" },
  { week: 7, slot: "C", position: "C", label: "Center", group: "Offensive Line" },
  { week: 8, slot: "RG", position: "IOL", label: "Right Guard", group: "Offensive Line" },
  { week: 9, slot: "RT", position: "OT", label: "Right Tackle", group: "Offensive Line" },
  { week: 10, slot: "RB2", position: "RB", label: "Second Running Back", group: "Backfield" },
  { week: 11, slot: "WR2", position: "WR", label: "No. 2 Wide Receiver", group: "Receivers" },
  { week: 12, slot: "WR3", position: "WR", label: "Slot / No. 3 Receiver", group: "Receivers" },
  { week: 13, slot: "FLEX", position: "FLEX", label: "Offensive Weapon", group: "Depth" },
  { week: 14, slot: "FB", position: "FB", label: "Fullback / H-Back", group: "Depth" },
  { week: 15, slot: "TE2", position: "TE", label: "Second Tight End", group: "Depth" },
  { week: 16, slot: "QB2", position: "QB", label: "Backup Quarterback", group: "Depth" },
];

const TRAITS = {
  QB: [["processing","Processing"],["accuracy","Accuracy / Touch"],["arm","Arm Talent"],["legs","Mobility"],["vision","Vision"],["leadership","Leadership"],["playmaking","Playmaking"],["build","Build / Toughness"],["clutch","Clutch"]],
  RB: [["vision","Vision"],["burst","Burst"],["speed","Speed"],["power","Power"],["agility","Agility"],["hands","Hands"],["passpro","Pass Protection"],["toughness","Toughness"],["clutch","Clutch"]],
  WR: [["release","Release"],["routes","Route Running"],["hands","Hands"],["speed","Speed"],["yac","YAC"],["contested","Contested Catch"],["iq","Football IQ"],["toughness","Toughness"],["clutch","Clutch"]],
  TE: [["routes","Route Running"],["hands","Hands"],["blocking","Blocking"],["athleticism","Athleticism"],["yac","YAC"],["contested","Contested Catch"],["iq","Football IQ"],["toughness","Toughness"],["clutch","Clutch"]],
  OT: [["passblock","Pass Block"],["runblock","Run Block"],["strength","Strength"],["feet","Footwork"],["anchor","Anchor"],["iq","Football IQ"],["durability","Durability"],["discipline","Discipline"],["clutch","Clutch"]],
  IOL: [["passblock","Pass Block"],["runblock","Run Block"],["strength","Strength"],["anchor","Anchor"],["movement","Movement"],["iq","Football IQ"],["durability","Durability"],["discipline","Discipline"],["clutch","Clutch"]],
  C: [["passblock","Pass Block"],["runblock","Run Block"],["strength","Strength"],["anchor","Anchor"],["movement","Movement"],["iq","Protection Calls"],["durability","Durability"],["discipline","Discipline"],["clutch","Clutch"]],
  FLEX: [["explosive","Explosiveness"],["hands","Hands"],["routes","Route Running"],["power","Power"],["yac","YAC"],["iq","Football IQ"],["versatility","Versatility"],["toughness","Toughness"],["clutch","Clutch"]],
  FB: [["blocking","Blocking"],["power","Power"],["hands","Hands"],["routes","Routes"],["shortyardage","Short Yardage"],["iq","Football IQ"],["toughness","Toughness"],["versatility","Versatility"],["clutch","Clutch"]],
};

const QB_POOL = [
  ["Patrick Mahomes",{processing:98,accuracy:96,arm:99,legs:91,vision:98,leadership:97,playmaking:100,build:91,clutch:100}],
  ["Josh Allen",{processing:94,accuracy:94,arm:100,legs:98,vision:94,leadership:96,playmaking:98,build:99,clutch:96}],
  ["Lamar Jackson",{processing:94,accuracy:93,arm:94,legs:100,vision:95,leadership:95,playmaking:100,build:90,clutch:94}],
  ["Joe Burrow",{processing:99,accuracy:99,arm:93,legs:85,vision:99,leadership:98,playmaking:95,build:88,clutch:99}],
  ["Justin Herbert",{processing:94,accuracy:96,arm:99,legs:91,vision:94,leadership:93,playmaking:95,build:96,clutch:94}],
  ["Jalen Hurts",{processing:91,accuracy:92,arm:93,legs:97,vision:91,leadership:98,playmaking:96,build:98,clutch:96}],
  ["Brock Purdy",{processing:97,accuracy:96,arm:88,legs:89,vision:97,leadership:94,playmaking:94,build:87,clutch:95}],
  ["Kirk Cousins",{processing:88,accuracy:89,arm:85,legs:62,vision:88,leadership:89,playmaking:77,build:82,clutch:78}],
  ["Geno Smith",{processing:85,accuracy:86,arm:88,legs:76,vision:84,leadership:86,playmaking:83,build:84,clutch:80}],
  ["Gardner Minshew",{processing:78,accuracy:79,arm:74,legs:78,vision:77,leadership:84,playmaking:80,build:78,clutch:80}],
  ["Mac Jones",{processing:76,accuracy:79,arm:72,legs:65,vision:75,leadership:74,playmaking:68,build:73,clutch:69}],
  ["Kenny Pickett",{processing:73,accuracy:75,arm:76,legs:78,vision:72,leadership:78,playmaking:74,build:79,clutch:73}],
  ["Daniel Jones",{processing:74,accuracy:76,arm:83,legs:88,vision:72,leadership:79,playmaking:79,build:84,clutch:69}],
  ["Desmond Ridder",{processing:68,accuracy:70,arm:78,legs:84,vision:66,leadership:73,playmaking:72,build:82,clutch:64}],
  ["Zach Wilson",{processing:64,accuracy:69,arm:91,legs:84,vision:63,leadership:68,playmaking:76,build:78,clutch:61}],
  ["Bailey Zappe",{processing:66,accuracy:70,arm:69,legs:64,vision:65,leadership:70,playmaking:64,build:72,clutch:65}],
  ["Nathan Peterman",{processing:58,accuracy:61,arm:67,legs:62,vision:55,leadership:66,playmaking:58,build:68,clutch:48}],
  ["Tim Boyle",{processing:57,accuracy:60,arm:74,legs:55,vision:56,leadership:65,playmaking:55,build:69,clutch:52}],
];

const RB_POOL = [
  ["Bijan Robinson",{vision:97,burst:98,speed:95,power:91,agility:99,hands:95,passpro:88,toughness:93,clutch:95}],
  ["Saquon Barkley",{vision:96,burst:98,speed:97,power:95,agility:97,hands:94,passpro:90,toughness:96,clutch:97}],
  ["Jahmyr Gibbs",{vision:94,burst:99,speed:99,power:84,agility:99,hands:96,passpro:84,toughness:88,clutch:95}],
  ["Derrick Henry",{vision:94,burst:89,speed:91,power:100,agility:84,hands:78,passpro:87,toughness:100,clutch:98}],
  ["Josh Jacobs",{vision:92,burst:91,speed:88,power:96,agility:91,hands:88,passpro:91,toughness:97,clutch:94}],
  ["James Cook",{vision:90,burst:95,speed:96,power:82,agility:94,hands:91,passpro:80,toughness:86,clutch:91}],
  ["Najee Harris",{vision:84,burst:82,speed:80,power:94,agility:82,hands:86,passpro:87,toughness:95,clutch:84}],
  ["Alexander Mattison",{vision:76,burst:77,speed:78,power:84,agility:75,hands:78,passpro:80,toughness:85,clutch:75}],
  ["Samaje Perine",{vision:75,burst:73,speed:72,power:86,agility:72,hands:84,passpro:90,toughness:88,clutch:78}],
  ["Cam Akers",{vision:72,burst:80,speed:83,power:78,agility:80,hands:73,passpro:71,toughness:82,clutch:70}],
  ["Royce Freeman",{vision:68,burst:67,speed:69,power:82,agility:66,hands:70,passpro:73,toughness:81,clutch:66}],
  ["Trayveon Williams",{vision:64,burst:69,speed:73,power:68,agility:71,hands:68,passpro:66,toughness:72,clutch:63}],
];

const WR_POOL = [
  ["Justin Jefferson",{release:98,routes:100,hands:98,speed:95,yac:95,contested:99,iq:99,toughness:93,clutch:99}],
  ["Ja'Marr Chase",{release:97,routes:98,hands:97,speed:98,yac:98,contested:97,iq:96,toughness:95,clutch:99}],
  ["CeeDee Lamb",{release:96,routes:98,hands:97,speed:94,yac:98,contested:94,iq:97,toughness:94,clutch:96}],
  ["Amon-Ra St. Brown",{release:95,routes:99,hands:97,speed:90,yac:95,contested:91,iq:99,toughness:97,clutch:97}],
  ["Tyreek Hill",{release:96,routes:96,hands:94,speed:100,yac:100,contested:83,iq:94,toughness:88,clutch:95}],
  ["Mike Evans",{release:94,routes:93,hands:96,speed:88,yac:86,contested:100,iq:96,toughness:96,clutch:98}],
  ["Darnell Mooney",{release:82,routes:84,hands:82,speed:92,yac:83,contested:75,iq:82,toughness:80,clutch:79}],
  ["K.J. Osborn",{release:76,routes:79,hands:78,speed:82,yac:76,contested:76,iq:80,toughness:81,clutch:75}],
  ["Marquez Valdes-Scantling",{release:72,routes:72,hands:67,speed:94,yac:74,contested:70,iq:74,toughness:79,clutch:72}],
  ["Nelson Agholor",{release:74,routes:76,hands:70,speed:86,yac:73,contested:68,iq:78,toughness:77,clutch:68}],
  ["Quez Watkins",{release:65,routes:66,hands:64,speed:91,yac:69,contested:60,iq:65,toughness:70,clutch:61}],
  ["Laquon Treadwell",{release:62,routes:65,hands:68,speed:61,yac:60,contested:71,iq:67,toughness:74,clutch:60}],
];

const TE_POOL = [
  ["Travis Kelce",{routes:99,hands:98,blocking:82,athleticism:91,yac:97,contested:96,iq:100,toughness:96,clutch:100}],
  ["George Kittle",{routes:95,hands:96,blocking:99,athleticism:96,yac:99,contested:96,iq:97,toughness:100,clutch:97}],
  ["Sam LaPorta",{routes:94,hands:95,blocking:87,athleticism:94,yac:96,contested:92,iq:95,toughness:93,clutch:94}],
  ["Mark Andrews",{routes:96,hands:96,blocking:86,athleticism:90,yac:92,contested:95,iq:97,toughness:94,clutch:95}],
  ["T.J. Hockenson",{routes:93,hands:94,blocking:83,athleticism:89,yac:91,contested:93,iq:94,toughness:91,clutch:91}],
  ["Dallas Goedert",{routes:88,hands:91,blocking:89,athleticism:88,yac:92,contested:88,iq:91,toughness:92,clutch:88}],
  ["Noah Fant",{routes:79,hands:81,blocking:73,athleticism:91,yac:84,contested:78,iq:80,toughness:79,clutch:76}],
  ["Mike Gesicki",{routes:82,hands:85,blocking:61,athleticism:88,yac:78,contested:84,iq:80,toughness:75,clutch:78}],
  ["Irv Smith Jr.",{routes:72,hands:75,blocking:68,athleticism:83,yac:74,contested:71,iq:73,toughness:70,clutch:68}],
  ["Tommy Sweeney",{routes:61,hands:66,blocking:72,athleticism:63,yac:59,contested:65,iq:69,toughness:76,clutch:60}],
];

const OT_POOL = [
  ["Trent Williams",{passblock:99,runblock:100,strength:100,feet:98,anchor:99,iq:99,durability:89,discipline:96,clutch:100}],
  ["Penei Sewell",{passblock:97,runblock:100,strength:99,feet:96,anchor:98,iq:96,durability:98,discipline:94,clutch:98}],
  ["Tristan Wirfs",{passblock:99,runblock:96,strength:97,feet:99,anchor:98,iq:97,durability:96,discipline:96,clutch:98}],
  ["Lane Johnson",{passblock:98,runblock:96,strength:96,feet:98,anchor:97,iq:99,durability:90,discipline:96,clutch:99}],
  ["Laremy Tunsil",{passblock:97,runblock:88,strength:91,feet:99,anchor:95,iq:94,durability:90,discipline:82,clutch:94}],
  ["Taylor Decker",{passblock:88,runblock:90,strength:91,feet:86,anchor:89,iq:92,durability:91,discipline:90,clutch:89}],
  ["George Fant",{passblock:76,runblock:75,strength:79,feet:78,anchor:75,iq:79,durability:76,discipline:75,clutch:73}],
  ["Andre Dillard",{passblock:69,runblock:67,strength:72,feet:74,anchor:67,iq:70,durability:72,discipline:68,clutch:65}],
  ["Storm Norton",{passblock:65,runblock:69,strength:73,feet:63,anchor:66,iq:68,durability:80,discipline:64,clutch:61}],
  ["Le'Raven Clark",{passblock:60,runblock:64,strength:70,feet:61,anchor:62,iq:65,durability:68,discipline:62,clutch:58}],
];

const IOL_POOL = [
  ["Quenton Nelson",{passblock:97,runblock:100,strength:100,anchor:99,movement:96,iq:97,durability:96,discipline:94,clutch:99}],
  ["Chris Lindstrom",{passblock:96,runblock:99,strength:97,anchor:96,movement:98,iq:96,durability:98,discipline:96,clutch:97}],
  ["Joe Thuney",{passblock:99,runblock:95,strength:93,anchor:97,movement:95,iq:100,durability:98,discipline:98,clutch:100}],
  ["Zack Martin",{passblock:98,runblock:98,strength:97,anchor:99,movement:94,iq:100,durability:91,discipline:98,clutch:99}],
  ["Robert Hunt",{passblock:88,runblock:94,strength:96,anchor:92,movement:89,iq:88,durability:91,discipline:86,clutch:89}],
  ["Kevin Zeitler",{passblock:90,runblock:89,strength:91,anchor:92,movement:84,iq:95,durability:92,discipline:94,clutch:91}],
  ["Will Hernandez",{passblock:76,runblock:81,strength:89,anchor:80,movement:74,iq:78,durability:86,discipline:71,clutch:75}],
  ["Cody Ford",{passblock:69,runblock:75,strength:84,anchor:73,movement:69,iq:72,durability:79,discipline:67,clutch:68}],
  ["Sua Opeta",{passblock:65,runblock:70,strength:79,anchor:68,movement:66,iq:69,durability:76,discipline:68,clutch:64}],
  ["Michael Jordan",{passblock:61,runblock:66,strength:77,anchor:64,movement:62,iq:65,durability:72,discipline:61,clutch:59}],
];

const C_POOL = [
  ["Creed Humphrey",{passblock:98,runblock:99,strength:97,anchor:99,movement:98,iq:100,durability:99,discipline:97,clutch:100}],
  ["Tyler Linderbaum",{passblock:95,runblock:98,strength:92,anchor:94,movement:100,iq:98,durability:96,discipline:96,clutch:97}],
  ["Frank Ragnow",{passblock:97,runblock:99,strength:99,anchor:100,movement:95,iq:99,durability:90,discipline:98,clutch:99}],
  ["Erik McCoy",{passblock:91,runblock:93,strength:92,anchor:92,movement:93,iq:95,durability:88,discipline:93,clutch:91}],
  ["Ryan Kelly",{passblock:88,runblock:87,strength:88,anchor:90,movement:83,iq:96,durability:84,discipline:94,clutch:89}],
  ["Austin Corbett",{passblock:78,runblock:80,strength:82,anchor:79,movement:79,iq:84,durability:77,discipline:81,clutch:78}],
  ["Billy Price",{passblock:67,runblock:69,strength:77,anchor:68,movement:66,iq:72,durability:75,discipline:68,clutch:64}],
  ["Pat Elflein",{passblock:63,runblock:68,strength:73,anchor:65,movement:67,iq:70,durability:69,discipline:66,clutch:61}],
];

const FLEX_POOL = [
  ["Christian McCaffrey",{explosive:98,hands:99,routes:98,power:88,yac:99,iq:99,versatility:100,toughness:95,clutch:99}],
  ["Deebo Samuel",{explosive:97,hands:91,routes:88,power:97,yac:100,iq:93,versatility:100,toughness:97,clutch:95}],
  ["Alvin Kamara",{explosive:94,hands:98,routes:96,power:86,yac:98,iq:96,versatility:99,toughness:91,clutch:94}],
  ["Taysom Hill",{explosive:91,hands:82,routes:76,power:96,yac:91,iq:94,versatility:100,toughness:100,clutch:92}],
  ["Cordarrelle Patterson",{explosive:87,hands:82,routes:75,power:88,yac:89,iq:86,versatility:98,toughness:88,clutch:83}],
  ["Laviska Shenault",{explosive:78,hands:75,routes:70,power:86,yac:82,iq:73,versatility:88,toughness:83,clutch:70}],
  ["Ty Montgomery",{explosive:70,hands:74,routes:69,power:72,yac:72,iq:80,versatility:90,toughness:76,clutch:68}],
  ["Travis Homer",{explosive:67,hands:69,routes:63,power:70,yac:66,iq:74,versatility:78,toughness:77,clutch:62}],
];

const FB_POOL = [
  ["Kyle Juszczyk",{blocking:98,power:91,hands:94,routes:92,shortyardage:91,iq:100,toughness:98,versatility:100,clutch:98}],
  ["Patrick Ricard",{blocking:100,power:100,hands:79,routes:67,shortyardage:96,iq:96,toughness:100,versatility:88,clutch:94}],
  ["C.J. Ham",{blocking:94,power:93,hands:87,routes:80,shortyardage:91,iq:95,toughness:97,versatility:91,clutch:90}],
  ["Alec Ingold",{blocking:93,power:91,hands:86,routes:82,shortyardage:90,iq:94,toughness:96,versatility:92,clutch:89}],
  ["Khari Blasingame",{blocking:85,power:87,hands:75,routes:69,shortyardage:83,iq:85,toughness:90,versatility:80,clutch:78}],
  ["Jakob Johnson",{blocking:86,power:89,hands:68,routes:62,shortyardage:84,iq:84,toughness:92,versatility:76,clutch:75}],
  ["Nick Bawden",{blocking:76,power:82,hands:65,routes:58,shortyardage:78,iq:77,toughness:86,versatility:69,clutch:68}],
  ["Ben Mason",{blocking:68,power:79,hands:58,routes:54,shortyardage:72,iq:69,toughness:82,versatility:63,clutch:60}],
];

const POOLS = { QB: QB_POOL, RB: RB_POOL, WR: WR_POOL, TE: TE_POOL, OT: OT_POOL, IOL: IOL_POOL, C: C_POOL, FLEX: FLEX_POOL, FB: FB_POOL };

function playerPool(position) {
  return (POOLS[position] || []).map(([name, ratings]) => ({ name, ratings }));
}

function archetype(overall, position) {
  if (overall >= 96) return "Generational Talent";
  if (overall >= 92) return "All-Pro Caliber";
  if (overall >= 88) return "Pro Bowl Caliber";
  if (overall >= 84) return "High-End Starter";
  if (overall >= 80) return "Quality Starter";
  if (overall >= 75) return "Average Starter";
  if (overall >= 70) return "Replacement Level";
  if (overall >= 65) return position === "QB" ? "Backup Quarterback" : "Reserve Player";
  if (overall >= 60) return "Roster Bubble";
  return "Historic Bust";
}

function letterGrade(value) {
  if (value >= 94) return "A+";
  if (value >= 90) return "A";
  if (value >= 87) return "A-";
  if (value >= 84) return "B+";
  if (value >= 81) return "B";
  if (value >= 78) return "B-";
  if (value >= 75) return "C+";
  if (value >= 72) return "C";
  if (value >= 69) return "C-";
  if (value >= 66) return "D+";
  if (value >= 63) return "D";
  return "F";
}

function initials(name) {
  return String(name || "DD").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function traitCount(entry) {
  return Object.keys(entry?.traits || {}).length;
}

function avg(values) {
  const nums = values.map(Number).filter(Number.isFinite).filter((n) => n > 0);
  return nums.length ? Math.round(nums.reduce((a,b) => a+b, 0) / nums.length) : 0;
}

export default function BuildAStarPage() {
  const [session, setSession] = useState(null);
  const [managerTeam, setManagerTeam] = useState(null);
  const [teams, setTeams] = useState([]);
  const [week, setWeek] = useState(1);
  const [results, setResults] = useState({});
  const [allEntries, setAllEntries] = useState([]);
  const [spinning, setSpinning] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const activeWeek = Math.min(Math.max(Number(week || 1), 1), 16);
  const activeSlot = WEEK_SLOTS[activeWeek - 1];
  const activeTraits = TRAITS[activeSlot.position] || [];
  const activePool = playerPool(activeSlot.position);

  async function loadPublic(targetWeek = activeWeek) {
    if (!supabase) return;
    const [teamsRes, entriesRes] = await Promise.all([
      supabase.from("teams").select("id,name,manager").order("id"),
      supabase.from("build_a_star_entries").select("*").eq("season", SEASON).order("week", { ascending: true }),
    ]);
    const nextTeams = teamsRes.data || [];
    const byId = Object.fromEntries(nextTeams.map((team) => [Number(team.id), team]));
    setTeams(nextTeams);
    setAllEntries((entriesRes.data || []).map((entry) => ({ ...entry, team: byId[Number(entry.manager_team_id)] })));
  }

  useEffect(() => {
    let alive = true;
    async function boot() {
      if (!supabase) { setLoading(false); return; }
      let currentWeek = 1;
      try {
        const schedule = await fetch("/api/pick-em", { cache: "no-store" }).then((r) => r.json());
        currentWeek = Math.min(Math.max(Number(schedule?.currentWeek || 1), 1), 16);
      } catch {}
      if (!alive) return;
      setWeek(currentWeek);
      await loadPublic(currentWeek);
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setSession(data.session || null);
      setLoading(false);
    }
    boot();
    const { data: listener } = supabase?.auth.onAuthStateChange((_event, next) => setSession(next || null)) || { data: null };
    return () => { alive = false; listener?.subscription?.unsubscribe(); };
  }, []);

  useEffect(() => {
    async function resolveManager() {
      if (!supabase || !session?.user) { setManagerTeam(null); return; }
      const { data } = await supabase.from("manager_teams").select("team_id,is_commissioner").eq("user_id", session.user.id).maybeSingle();
      const team = teams.find((row) => Number(row.id) === Number(data?.team_id));
      setManagerTeam(data ? { ...data, team } : null);
    }
    resolveManager();
  }, [session, teams]);

  const weekEntries = useMemo(() => allEntries.filter((entry) => Number(entry.week) === activeWeek && entry.position === activeSlot.position), [allEntries, activeWeek, activeSlot.position]);
  const existing = managerTeam ? weekEntries.find((entry) => Number(entry.manager_team_id) === Number(managerTeam.team_id)) : null;
  const leaderboard = weekEntries.filter((entry) => traitCount(entry) === activeTraits.length).sort((a,b) => Number(b.overall)-Number(a.overall));

  const mySeasonEntries = useMemo(() => managerTeam ? allEntries.filter((entry) => Number(entry.manager_team_id) === Number(managerTeam.team_id)) : [], [allEntries, managerTeam]);
  const roster = useMemo(() => WEEK_SLOTS.map((slot) => ({ ...slot, entry: mySeasonEntries.find((entry) => Number(entry.week) === slot.week) || null })), [mySeasonEntries]);
  const completedRoster = roster.filter((row) => row.entry && traitCount(row.entry) === (TRAITS[row.position]?.length || 9));
  const rosterOverall = avg(completedRoster.map((row) => row.entry.overall));
  const unitGrades = useMemo(() => ["Backfield","Receivers","Offensive Line","Depth"].map((group) => {
    const rows = roster.filter((row) => row.group === group && row.entry && traitCount(row.entry) === (TRAITS[row.position]?.length || 9));
    const value = avg(rows.map((row) => row.entry.overall));
    const total = WEEK_SLOTS.filter((row) => row.group === group).length;
    return { group, value, grade: value ? letterGrade(value) : "—", complete: rows.length, total };
  }), [roster]);

  useEffect(() => {
    if (existing?.traits) {
      setResults(existing.traits);
      if (traitCount(existing) >= activeTraits.length) setMessage(`Your Week ${activeWeek} ${activeSlot.slot} is permanently locked.`);
      else if (traitCount(existing) > 0) setMessage(`Week ${activeWeek} build restored. Previous spins are locked.`);
    } else {
      setResults({});
      setMessage("");
    }
  }, [existing?.id, existing?.updated_at, activeWeek, activeSlot.slot, activeTraits.length]);

  const completed = activeTraits.every(([key]) => results[key]);
  const locked = Boolean(existing && traitCount(existing) >= activeTraits.length);
  const overall = useMemo(() => avg(activeTraits.map(([key]) => results[key]?.rating)), [results, activeTraits]);
  const title = archetype(overall, activeSlot.position);

  async function persistSpin(key, result) {
    if (!supabase || !session?.user || !managerTeam) throw new Error("Sign in with your manager account before spinning.");
    const nextTraits = { ...results, [key]: result };
    const nextCount = Object.keys(nextTraits).length;
    const nextOverall = nextCount === activeTraits.length ? avg(activeTraits.map(([traitKey]) => nextTraits[traitKey]?.rating)) : 0;
    const nextArchetype = nextCount === activeTraits.length ? archetype(nextOverall, activeSlot.position) : "IN PROGRESS";
    const now = new Date().toISOString();
    let response;
    if (existing?.id) {
      response = await supabase.from("build_a_star_entries").update({ traits: nextTraits, overall: nextOverall, archetype: nextArchetype, updated_at: now }).eq("id", existing.id);
    } else {
      response = await supabase.from("build_a_star_entries").insert({ season: SEASON, week: activeWeek, manager_team_id: Number(managerTeam.team_id), user_id: session.user.id, position: activeSlot.position, traits: nextTraits, overall: nextOverall, archetype: nextArchetype, created_at: now, updated_at: now });
    }
    if (response.error) throw response.error;
    setResults(nextTraits);
    await loadPublic(activeWeek);
    if (nextCount === activeTraits.length) setMessage(`Week ${activeWeek} ${activeSlot.slot} complete and permanently locked.`);
  }

  function spin(key) {
    if (spinning || locked || results[key]) return;
    if (!session?.user || !managerTeam) {
      setMessage("Sign in with your manager account before spinning. Every spin is permanent.");
      return;
    }
    setMessage("");
    setSpinning(key);
    window.setTimeout(async () => {
      const source = activePool[Math.floor(Math.random() * activePool.length)];
      const result = { player: source.name, rating: source.ratings[key] };
      try { await persistSpin(key, result); }
      catch (error) { setMessage(error?.message || "That spin could not be saved. Try again."); }
      finally { setSpinning(""); }
    }, 520);
  }

  function spinNext() {
    if (locked) return;
    const next = activeTraits.find(([key]) => !results[key]);
    if (next) spin(next[0]);
  }

  return (
    <PageShell title="BUILD-A-STAR" kicker="16 WEEKS · 16 PLAYERS · BUILD YOUR OFFENSE">
      <div className={styles.layout}>
        <section className={`panel ${styles.game}`}>
          <div className={styles.topline}><span>WEEK {activeWeek} · {activeSlot.slot} · {activeSlot.label.toUpperCase()}</span><span>{Object.keys(results).length}/9 TRAITS</span></div>
          <div className={styles.stage}>
            <div className={styles.leftTraits}>{activeTraits.slice(0,4).map(([key,label]) => <TraitCard key={key} label={label} result={results[key]} spinning={spinning===key} onSpin={() => spin(key)} />)}</div>
            <div className={styles.playerWrap}>
              <div className={styles.player}><div className={styles.helmet}>DD</div><div className={styles.jersey}>{activeSlot.slot.replace(/\D/g,"") || activeWeek}</div></div>
              <div className={styles.rating}><span>OVR</span><strong>{overall || "--"}</strong></div>
              <h2>{completed ? title : `Build Your ${activeSlot.label}`}</h2>
            </div>
            <div className={styles.rightTraits}>{activeTraits.slice(4).map(([key,label]) => <TraitCard key={key} label={label} result={results[key]} spinning={spinning===key} onSpin={() => spin(key)} />)}</div>
          </div>
          <div className={styles.actions}><button className="primaryButton" onClick={spinNext} disabled={completed || Boolean(spinning) || locked}>{spinning ? "SPINNING..." : locked ? "WEEKLY BUILD LOCKED" : completed ? "BUILD COMPLETE" : "SPIN NEXT TRAIT"}</button></div>
          {completed && <div className={styles.finalCard}><span>WEEK {activeWeek} FINAL BUILD</span><strong>{overall} OVR</strong><b>{activeSlot.slot} · {title}</b><p>This player is permanently added to your 16-week Dirty Dozens offense.</p></div>}
          <div className={styles.submitRow}>{!session ? <p>Sign in through Manager HQ or Weekly Pick 'Em before spinning.</p> : !managerTeam ? <p>Your login is not linked to a franchise yet.</p> : <p>Every trait saves immediately. There are no rerolls or resets.</p>}{message ? <span>{message}</span> : null}</div>
        </section>

        <aside className={`panel ${styles.board}`}>
          <div className="panelTitle"><h3>WEEK {activeWeek} LEADERBOARD</h3><span>{activeSlot.slot} OVR</span></div>
          {loading ? <p>Loading league builds...</p> : leaderboard.length ? leaderboard.map((entry,index) => <div className={styles.boardRow} key={entry.id}><b>#{index+1}</b><span className={styles.avatar}>{initials(entry.team?.manager || entry.team?.name)}</span><div><strong>{entry.team?.name || "Franchise"}</strong><small>{entry.team?.manager || "Manager"} · {entry.archetype}</small></div><em>{entry.overall}</em></div>) : <p className={styles.empty}>No completed Week {activeWeek} builds yet. Set the bar.</p>}
          <div className={styles.rules}><strong>SEASON FORMAT</strong><p>One permanent player every week through Week 16. Your completed weekly players form a full offense, then receive unit grades and a final team OVR.</p></div>
        </aside>
      </div>

      <section className={`panel ${styles.rosterPanel}`}>
        <div className={styles.rosterHead}><div><span>YOUR 2026 OFFENSE</span><h2>{managerTeam?.team?.name || "Manager roster"}</h2></div><div className={styles.offenseScore}><small>{completedRoster.length}/16 BUILT</small><strong>{completedRoster.length ? rosterOverall : "--"}</strong><b>{completedRoster.length === 16 ? letterGrade(rosterOverall) : "IN PROGRESS"}</b></div></div>
        <div className={styles.unitGrid}>{unitGrades.map((unit) => <div className={styles.unitCard} key={unit.group}><span>{unit.group}</span><strong>{unit.value || "--"}</strong><b>{unit.grade}</b><small>{unit.complete}/{unit.total} players</small></div>)}</div>
        <div className={styles.rosterGrid}>{roster.map((row) => <article className={`${styles.rosterSlot} ${row.entry && traitCount(row.entry) === (TRAITS[row.position]?.length || 9) ? styles.rosterDone : ""}`} key={row.week}><span>W{row.week}</span><div><b>{row.slot}</b><small>{row.label}</small></div><strong>{row.entry && Number(row.entry.overall) > 0 ? row.entry.overall : row.week === activeWeek && Object.keys(results).length ? `${Object.keys(results).length}/9` : "—"}</strong></article>)}</div>
        {completedRoster.length === 16 ? <div className={styles.seasonFinal}><span>FINAL OFFENSE GRADE</span><strong>{letterGrade(rosterOverall)}</strong><b>{rosterOverall} OVR</b><p>All 16 one-shot builds are complete. This is your final Dirty Dozens offense for the season.</p></div> : <p className={styles.rosterNote}>Final team grading unlocks after the Week 16 build is completed.</p>}
      </section>
    </PageShell>
  );
}

function TraitCard({ label, result, spinning, onSpin }) {
  return <button className={`${styles.trait} ${result ? styles.filled : ""}`} onClick={onSpin} disabled={Boolean(result) || spinning}><span>{label}</span>{spinning ? <strong>...</strong> : result ? <><strong>{result.rating}</strong><small>{result.player}</small></> : <><strong>SPIN</strong><small>One shot only</small></>}</button>;
}
