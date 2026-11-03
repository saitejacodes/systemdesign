"use client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export interface ConfirmRequest { title: string; body: string; confirm: string; danger?: boolean; onConfirm: () => void }

/** A small yes/no dialog; `req` null means closed. */
export function ConfirmDialog({ req, onClose }: { req: ConfirmRequest | null; onClose: () => void }) {
  return (
    <Dialog open={!!req} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent showCloseButton={false}>
        <DialogTitle className="fm-h4">{req?.title}</DialogTitle>
        <DialogDescription>{req?.body}</DialogDescription>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="fm-btn fm-btn--tool !h-9" onClick={onClose}>Cancel</button>
          <button type="button" className={`fm-btn fm-btn--tool !h-9 ${req?.danger ? "fm-btn--danger" : "is-on"}`} onClick={() => { req?.onConfirm(); onClose(); }}>{req?.confirm}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
