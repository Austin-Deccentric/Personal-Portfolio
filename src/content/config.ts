import { defineCollection, z } from 'astro:content';

const projects = defineCollection({
  type: 'data',
  schema: z.object({
    title: z.string(),
    tagline: z.string(),
    description: z.string(),
    role: z.string(),
    year: z.string(),
    status: z.enum(['shipped', 'in-progress', 'coursework']),
    featured: z.boolean().default(false),
    repo: z.string().url().optional(),
    live: z.string().url().optional(),
    docs: z.string().url().optional(),
    stack: z.array(z.string()),
    highlights: z.array(z.string()).default([]),
    problem: z.string().optional(),
    constraints: z.array(z.string()).default([]),
    architecture: z.array(z.string()).default([]),
    decisions: z.array(z.string()).default([]),
    next: z.array(z.string()).default([]),
    order: z.number().default(99),
  }),
});

export const collections = { projects };
