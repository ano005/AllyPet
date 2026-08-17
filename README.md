# AllyPet AI

Static landing page and interactive product flow for AllyPet AI, an AI veterinary medical scribe that reduces friction between pet owners, vet clinics, and insurers.

## Deploying

This is a single self-contained HTML file. No build step, no dependencies.

**GitHub Pages** — push these files to your repo, then enable Pages in Settings and point it at the root of your default branch.

**Vercel** — import the repo and use:
- Framework Preset: Other
- Build Command: (leave empty)
- Output Directory: (leave empty)
- Root Directory: ./

`vercel.json` is included and sets the output directory explicitly.

## Voice agent

The page embeds an ElevenLabs conversational agent. For it to connect, add your deployed domain to the agent's allowed origins in the ElevenLabs dashboard.
