"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const format = (value) => Number(value || 0).toFixed(1);

export default function HomeRecapTeaser() {
  const [recap, setRecap] = useState(null);

  useEffect(() => {
    let active = true;
    fetch("/api/recap", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (active) setRecap(data);
      })
      .catch(() => {
        if (active) setRecap({ ready: false });
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="panel span2 recapLead homeRecapTeaser">
      <div className="panelTitle">
        <h3>WEEKLY RECAP</h3>
        <Link href="/recap">FULL RECAP</Link>
      </div>
      {!recap ? (
        <p className="recapCopy">Loading the latest week in review…</p>
      ) : recap.ready ? (
        <>
          <span className="eyebrow">WEEK {recap.week} · ESPN AUTO</span>
          <h2>{recap.high.team.name} owned Week {recap.week}</h2>
          <p>
            League-high <strong>{format(recap.high.score)}</strong> points · league average <strong>{format(recap.average)}</strong> · biggest win <strong>{recap.biggest.winner.name} +{format(recap.biggest.margin)}</strong>.
          </p>
          <div className="recapGrid" style={{ marginTop: 14 }}>
            <article className="recapStat">
              <span>HIGH SCORE</span>
              <h3>{recap.high.team.name}</h3>
              <strong>{format(recap.high.score)}</strong>
            </article>
            <article className="recapStat">
              <span>CLOSEST GAME</span>
              <h3>{recap.closest.winner.name}</h3>
              <strong>+{format(recap.closest.margin)}</strong>
            </article>
          </div>
        </>
      ) : (
        <>
          <span className="eyebrow">WEEK IN REVIEW</span>
          <h2>Weekly recap coming soon</h2>
          <p>
            Once ESPN posts final results, the latest high score, biggest blowout, closest game and more will appear here automatically.
          </p>
        </>
      )}
    </section>
  );
}
