import JarvisWorkspace from "./jarvis-workspace";

// The active workspace comes from the query string so each AI Workforce
// sidebar entry is a real destination. Resolving it here rather than with
// useSearchParams keeps the client tree free of a render-blocking bailout.
export default async function JarvisPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const tab = (await searchParams).tab;
  const requested = typeof tab === "string" ? tab : null;
  return <JarvisWorkspace initialTab={requested === "core" || requested === "subagent" || requested === "skills" || requested === "presentations" ? requested : "jarvis"} />;
}
