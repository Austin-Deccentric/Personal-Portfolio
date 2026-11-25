// Single source for the stack lists on the home and stack pages.
export interface StackGroup {
  name: string;
  desc: string;
  items: string[];
}

export const stackGroups: StackGroup[] = [
  {
    name: 'Backend',
    desc: 'APIs, data modelling and business logic',
    items: ['Python', 'FastAPI', 'SQLModel', 'SQLAlchemy 2', 'Pydantic', 'PostgreSQL', 'Redis', 'Alembic', 'SlowAPI', 'APScheduler'],
  },
  {
    name: 'Frontend',
    desc: 'Interfaces, client state and the browser',
    items: ['TypeScript', 'React 19', 'Next.js', 'Tailwind CSS', 'shadcn/ui', 'Astro'],
  },
  {
    name: 'Infra',
    desc: 'Deployment, containers and tooling',
    items: ['Docker', 'Docker Compose', 'Linux', 'Bash', 'Git', 'Render', 'Vercel', 'Netlify', 'Neon', 'uv', 'Bun'],
  },
  {
    name: 'Testing',
    desc: 'Catching bugs before users do',
    items: ['pytest', 'Playwright', 'axe-core', 'Ruff', 'basedpyright', 'ESLint'],
  },
  {
    name: 'AI',
    desc: 'Shipped in VoiceDesk',
    items: ['LLM integration (OpenAI-compatible)', 'Speech-to-text (ElevenLabs Scribe v2)', 'Provider-agnostic adapters', 'Knowledge-base-grounded drafting', 'Human approval gate'],
  },
  {
    name: 'Learning',
    desc: "Where I'm growing next",
    items: ['Data pipelines', 'Cloud infra', 'Agentic AI'],
  },
];
