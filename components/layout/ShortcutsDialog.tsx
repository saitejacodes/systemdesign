"use client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useUi } from "@/lib/ui-store";

export const SHORTCUTS: [string, string][] = [
  ["⌘K / Ctrl+K", "Search"],
  ["[", "Toggle sidebar"],
  ["]", "Toggle right panel"],
  ["?", "Show this list"],
  ["Esc", "Close dialogs and drawers"],
];

export function ShortcutsDialog() {
  const { shortcutsOpen, set } = useUi();
  return (
    <Dialog open={shortcutsOpen} onOpenChange={(o) => set({ shortcutsOpen: o })}>
      <DialogContent>
        <DialogTitle className="fm-h4">Keyboard shortcuts</DialogTitle>
        <DialogDescription className="sr-only">All keyboard shortcuts in SysDesign Lab.</DialogDescription>
        <table className="fm-parts">
          <tbody>
            {SHORTCUTS.map(([k, v]) => (
              <tr key={k}><td style={{ width: 130 }}><kbd>{k}</kbd></td><td>{v}</td></tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
