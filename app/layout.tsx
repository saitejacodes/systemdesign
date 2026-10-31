import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ variable: "--f-archivo", subsets: ["latin"] });
const instrument = Instrument_Serif({ variable: "--f-instrument", subsets: ["latin"], weight: "400", style: "italic" });
const plexMono = IBM_Plex_Mono({ variable: "--f-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: { default: "SysDesign Lab", template: "%s · SysDesign Lab" },
  description: "Learn, simulate and practise system design in one place: lessons, simulators, a design studio and timed mock interviews.",
};

// Sets data-theme before first paint so Blueprint users never see a Paper flash.
const themeScript = `try{var t=localStorage.getItem("sdl-theme")||"system";if(t==="system")t=matchMedia("(prefers-color-scheme: dark)").matches?"blueprint":"paper";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="paper"}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="paper" suppressHydrationWarning className={`${archivo.variable} ${instrument.variable} ${plexMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
