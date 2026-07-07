import type { Metadata } from "next";
import { Schibsted_Grotesk, Hanken_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";

// Schibsted Grotesk: a refined, low-contrast display grotesk — elegant and
// modern at large sizes, a deliberate step up from the playful brand face.
const schibsted = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// Hanken Grotesk: a clean, quietly warm humanist body face that reads elegantly.
const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Proposal Console · Tech Tech Technology",
  description:
    "Turn a school's course inquiry email into a fully costed course proposal. Several AI agents deliberate in parallel, then the best ideas are merged into one.",
};

// Runs before first paint. Two jobs, both flash-free:
// 1. Stamp the chosen theme (explicit user choice wins, else OS preference).
// 2. If the intro splash has already played this session, mark the root so CSS
//    hides it instantly instead of replaying the 1.65s animation.
const bootScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;if(sessionStorage.getItem('splash-seen')==='1'){document.documentElement.classList.add('splash-seen');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${hanken.variable} ${geistMono.variable} ${schibsted.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
