// Single source for the stack lists on the home and stack pages.
export interface StackGroup {
  name: string;
  desc: string;
  items: string[];
}

export const stackGroups: StackGroup[] = [
  {
    name: 'backend',
    desc: 'APIs, data modelling and business logic',
    items: ['python', 'fastapi', 'sqlmodel', 'sqlalchemy 2', 'pydantic', 'postgresql', 'redis', 'alembic', 'slowapi', 'apscheduler'],
  },
  {
    name: 'frontend',
    desc: 'Interfaces, client state and the browser',
    items: ['typescript', 'react 19', 'next.js', 'tailwind css', 'shadcn/ui', 'astro'],
  },
  {
    name: 'infra',
    desc: 'Deployment, containers and tooling',
    items: ['docker', 'docker compose', 'linux', 'bash', 'git', 'render', 'vercel', 'netlify', 'neon', 'uv', 'bun'],
  },
  {
    name: 'testing',
    desc: 'Catching bugs before users do',
    items: ['pytest', 'playwright', 'axe-core', 'ruff', 'basedpyright', 'eslint'],
  },
  {
    name: 'learning',
    desc: "Where I'm growing next",
    items: ['data pipelines', 'cloud infra', 'agentic ai', 'llms'],
  },
];
