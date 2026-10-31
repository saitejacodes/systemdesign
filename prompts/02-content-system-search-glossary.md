Read CLAUDE.md. Task: build the content pipeline that every lesson will use.

1. Zod schemas for every content type in CLAUDE.md §4 in /lib/content/schemas.ts.
2. Loaders in /lib/content:
   - getAllSections(), getSection(phase, slug), getSectionsByPhase(phase)
   - getCaseStudies(), getCaseStudy(id), getGlossary(), getResources(), getPlan()
   - Validate every file at build time; a malformed file must FAIL the build with a
     clear message naming the file and field.
3. The sidebar curriculum tree now reads from real content (meta.json files),
   ordered by phase and order. Remove the temporary nav config. Phases with no
   sections yet show as "Coming soon".
4. MDX rendering with these custom components (build all of them now, styled per §5):
   - <DepthStamp depth="deep|tradeoffs|awareness" /> (from /components/brand)
   - <Figure caption="..."> wrapping diagrams with a FigureCaption
   - <Callout type="info|warning|tip|example">
   - <TradeoffBox> with props: items {gain, cost}[]
   - <NotWhenBox> with a list of situations
   - <Misconception wrong="..." right="..." />
   - <InterviewAngle> with questions list
   - <Diagram> that renders Mermaid client-side (lazy-loaded) with theme support
   - <Term slug="..."> that shows the glossary definition on hover/focus and links
     to /glossary#slug
   - <Simulator id="..." />: placeholder card for now saying the simulator name
     and linking to /simulators/[id] (it will embed real simulators later)
   - <CheckpointList />, <QuizPlayer />, <FlashcardDeck />, <ResourceList />:
     render static content for now (interactivity comes in Prompt 03)
   - Code blocks with syntax highlighting (shiki) and a copy button
5. Section page layout (match the /design lesson screen): title, phase/week badge,
   estimated time, topic list with depth stamps, table of contents (sticky on desktop),
   lesson, prev/next section navigation, HudBar with section number and reading time.
   No drafting grid behind lesson text.
6. Search: build a FlexSearch/MiniSearch index at build time over lessons (by heading),
   glossary, flashcards, case studies, resources. Wire it to the ⌘K palette and /search
   page with grouped results and keyboard navigation.
7. /glossary page: alphabetical, A–Z jump bar, filter box, each term links to its section.
8. Create ONE complete sample section to prove the pipeline: phase-1 "client-server",
   following the Content Standard §7 fully (real content, full quiz, flashcards etc.).

Definition of Done: CLAUDE.md §8, plus a unit test proving a malformed quiz.json fails validation.
