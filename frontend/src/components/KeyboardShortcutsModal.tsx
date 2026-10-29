import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  const shortcuts = [
    { key: 'Cmd / Ctrl + K', description: 'Open command palette' },
    { key: 'g d', description: 'Go to Dashboard' },
    { key: 'g m', description: 'Go to Meetings' },
    { key: 'g a', description: 'Go to Action Items' },
    { key: 'n', description: 'Start new recording upload' },
    { key: '/', description: 'Focus search / commands' },
    { key: '?', description: 'Open this keyboard shortcuts dialog' },
    { key: 'Esc', description: 'Close dialogs and modals' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Quick navigation and actions from anywhere in MeetScribe.
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-border pt-2">
          {shortcuts.map((s, idx) => (
            <div key={idx} className="flex items-center justify-between py-2 text-sm">
              <span className="text-muted-foreground">{s.description}</span>
              <kbd className="inline-flex items-center gap-1 rounded border bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-foreground shadow-sm">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
