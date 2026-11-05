import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "About" };

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="fm-card" aria-label={title}>
      <h2 className="fm-card__head">{title}</h2>
      <div className="fm-card__body grid gap-3 text-[17px] leading-relaxed">{children}</div>
    </section>
  );
}

export default function Page() {
  return (
    <>
      <PageHeader title="Why this exists" lede="SysDesign Lab is a single place to learn, practise and test system design, built to run entirely in your browser." />
      <div className="grid max-w-2xl gap-6 px-4 py-8 sm:px-8">
        <Part title="What it is">
          <p>A 16-week course for backend engineers with up to about four years of experience. It covers 7 phases, from networking basics to interview practice. Every topic is learned by doing: simulators you can break, SQL and code sandboxes, quizzes, spaced-repetition flashcards, a design studio and timed interview practice.</p>
          <p>Start with <Link className="fm-link" href="/today">Today</Link> or the <Link className="fm-link" href="/plan">16-week plan</Link>.</p>
        </Part>
        <Part title="Your data stays in this browser">
          <p>There are no accounts and no server database. Your progress, quiz history, flashcard schedule, notes, designs and interview attempts are saved in this browser&apos;s storage (IndexedDB). Nothing about you is sent anywhere, and the site sets no tracking cookies.</p>
          <p>Because the data lives here, clearing site data or switching browsers starts you from zero, unless you have a backup.</p>
        </Part>
        <Part title="Back up and restore">
          <p>In <Link className="fm-link" href="/settings">Settings → Your data</Link>, <strong>Export all data</strong> downloads a JSON file. On another machine or after a reset, use <strong>Import data</strong>. You can see what the file holds before you import it, then merge it with your current data or replace it.</p>
        </Part>
        <Part title="AI features use your own key">
          <p>The AI tutor, interviewer and feedback are optional. They work only after you add an API key from Anthropic, Google Gemini, Groq, OpenRouter, OpenAI or your own OpenAI-compatible endpoint in <Link className="fm-link" href="/settings">Settings → AI</Link>.</p>
          <p>Your browser sends requests straight to that provider. The key stays in this browser and is never put into exports. You pay the provider directly, and Settings shows an estimate of this month&apos;s use.</p>
        </Part>
        <Part title="Works offline">
          <p>After a page has been visited once, it opens without a connection, and so do lessons, simulators and reviews. The Python and SQL sandboxes download their runtimes on first use and keep them for later.</p>
        </Part>
      </div>
    </>
  );
}
