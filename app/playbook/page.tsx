import PlaybookWorkspace from "@/components/playbook-workspace";

// Team SOPs. The training and message tabs that used to live behind a tab bar
// here are now their own pages under Team, and the Script tab is gone.
export default function PlaybookPage() {
  return <PlaybookWorkspace view="sops" />;
}
