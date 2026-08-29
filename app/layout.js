import "./globals.css";

export const metadata = {
  title: "Dirty Dozens FFL",
  description: "The official home of Dirty Dozens Fantasy Football League",
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
