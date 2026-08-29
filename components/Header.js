import Link from "next/link";

const links = [
  ["/", "Home"],
  ["/teams", "Teams"],
  ["/matchups", "Matchups"],
  ["/standings", "Standings"],
  ["/power-rankings", "Power Rankings"],
  ["/history", "History"],
  ["/records", "Records"],
  ["/news", "News"],
  ["/rules", "Rules"],
];

export default function Header() {
  return (
    <header className="siteHeader">
      <Link href="/" className="brand" aria-label="Dirty Dozens FFL home">
        <span className="brandShield">DD</span>
        <span><strong>DIRTY DOZENS</strong><em>FFL</em></span>
      </Link>
      <nav>{links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav>
    </header>
  );
}
