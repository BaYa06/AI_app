# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

One design language for every surface: the iOS app (App Store), the same React Native app on the web/PWA (app.flashlycards.app) and Android (planned for January 2027). Native details appear only in narrow places (for example Liquid Glass on iOS navigation, plan/new/liquid_glass.md). The web teacher cabinet for laptops is a planned web-only surface.

## Users

- **Primary: the learner.** School and university students who learn foreign words with flashcards and spaced repetition, on a phone, in short daily sessions, often inside a course their teacher created. When teacher and learner needs conflict, the learner wins.
- **Paying segment (B2B): teachers and language centers.** A teacher builds a course for a group, assigns sets and homework with deadlines, runs live tests and graded exams in class, and checks who studied. A center hands its students access to its books by code (plan/new/center_books.md).
- **Market:** Central Asia (Kyrgyzstan, Kazakhstan, Uzbekistan and neighbors), Russian-speaking. The interface is in Russian; most learners study English, and German, Turkish and others also occur.

## Product Purpose

Flashly helps a learner remember words for the long term (spaced repetition with steps of 1, 3, 7, 14, 30 and 60 days) and helps a teacher see exactly what each student knows. Success: learners come back daily and hold on to words; teachers trust the data enough to replace paper quizzes and third-party tools (Kahoot, Edcafe) with Flashly.

## Positioning

Flashly knows every student's repetition history word by word (`review_log`, `card_progress`), so its class tools need no preparation from the teacher and give back real knowledge: a teacher picks a unit from a ready book and starts a test; exams pick words by how well this group actually knows them; mistakes from a test go straight back into each student's repetition queue. Quiz tools and AI material generators know nothing about the students; Flashly does.

## Operating Context

- Learner: phone, short sessions, Study / Test / Build word / Word in context / Audio modes, daily goal, streak, push reminders.
- Teacher, in class: phone today, laptop and projector next (web teacher cabinet). Students join live tests and exams from the app's «Тест» tab with a 4-digit code; a teacher can pause, add time, and allow a student back after exit control.
- Teacher, between classes: courses (groups) with a lesson schedule, sets and official book units, homework with deadlines and reminders, hard words, students who fall behind, parent report by link or PDF.
- Content: official books (book → units → sets, e.g. «Academic words», B2, 42 units × 12 words), the teacher's own sets, AI import from photo/PDF/text (Gemini).

## Capabilities and Constraints

- Stack: React Native 0.73 (iOS) + react-native-web via webpack (web); Vercel functions in `api/`; Neon Postgres; Supabase only for sign-in and Realtime; Firebase for push, analytics and Crashlytics; Gemini (free AI Studio tier) with Groq fallback.
- Graded exam («Живой экзамен», engine 2): five formats (choice, written answer, build the word, match pairs, fill the gap), 100-point scale, the server owns the deadline. The exam engine itself uses no AI; AI may only prepare draft content that the teacher reviews and edits.
- Team of two, no budget beyond existing subscriptions; free tiers matter (Supabase Free, Gemini free quota). Vercel Pro since 16.11.2026; part of the API may move to a VPS.
- Paid plan launches 01.09.2027; what is paid is still undecided.
- Old app versions stay in use: server changes must stay compatible (plan/new/release_safety.md).
- Terminology follows the brandbook dictionary (plan/done/brandbook.md, 9.1): «курс» (not «класс», «группа»), «набор», «карточка», «тест», «серия», «учитель / ученик». The web cabinet mockup still says «группа» and must be aligned.
- Open: web teacher cabinet (mockup at https://claude.ai/artifact/7evuFGKLMztxoJAfDSAa9R), in-class game, AI materials and printable sheets, AI «smart options» in exams.

## Brand Commitments

- Name: **Flashly**, always in Latin script with a capital F, never translated. Tagline: «Учись умнее. Запоминай надолго.»
- Voice: friendly, calm, supportive; praise progress, never scold for mistakes; address the user as «ты».
- App icon: white «F» on stacked cards over a violet field (`public/icons/icon-*.png`, `assets/brand/app-icon-1024.png`). The user treats it as the real logo. The brandbook still names the lightning bolt (lucide `Zap`) as the mark; this conflict is unresolved.
- Visual rules live in plan/done/brandbook.md (tokens in `src/constants/`); every new screen follows it.

## Evidence on Hand

- Live product: iOS app (App Store id 6808731151), web app, landing site flashlycards.app with a teachers page (`public/site/p/teachers.html`).
- Real content: official books imported from Excel (`books/`, `scripts/import-book.ts`), the community library.
- One teacher actively uses Flashly and asked for graded exams (17.11.2026); the same teacher also uses Edcafe and Kahoot.
- No testimonials, customer logos, usage numbers or pricing exist for publication. Do not invent them. Names and figures in mockups are fictional.

## Product Principles

1. The learner's long-term memory comes first; every teacher feature should feed back into each student's repetition.
2. Zero preparation for the teacher: start from ready books and units and existing data, not from blank forms.
3. Trustworthy numbers: scores and «who studied» must be explainable. Code decides grades; AI only drafts what a person reviews.
4. Honest over impressive: say what we know («objective picture plus preparation data»), never promise what we can't guarantee.
5. Lean: what a two-person team can ship and run on free tiers beats a bigger feature that needs paid infrastructure.
