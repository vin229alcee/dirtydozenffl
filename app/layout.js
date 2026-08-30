import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import "./mobile.css";
import "./mascots.css";
import "./desktop-home.css";
import "./playoff-race.css";
import "./awards.css";
import "./nav-cleanup.css";
import "./trash-talk.css";
import "./matchup-projections.css";
import "./team-profile.css";

export const metadata = {
  title: "Dirty Dozens FFL",
  description: "The official home of Dirty Dozens Fantasy Football League",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics mode="production" />
      </body>
    </html>
  );
}
