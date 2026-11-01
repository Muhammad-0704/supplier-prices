/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // В проекте уже есть CLAUDE.md для контекста агентам; свой AGENTS.md не нужен.
  agentRules: false,
};

export default nextConfig;
