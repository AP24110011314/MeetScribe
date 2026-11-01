import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, RotateCcw, AlertTriangle, Clock } from 'lucide-react';
import { getTrash, restoreMeeting, deleteMeetingForever, emptyTrash } from '@/api/meetings';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { WindowChrome } from '@/components/ui/WindowChrome';
import { useToast } from '@/components/ui/Toast';

export const TrashPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [confirmEmptyOpen, setConfirmEmptyOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['trash'],
    queryFn: getTrash,
  });

  const restoreMutation = useMutation({
    mutationFn: restoreMeeting,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      toast({
        title: 'Meeting restored',
        description: 'Meeting has been moved back to your active notes',
        type: 'success',
      });
    },
    onError: () => {
      toast({
        title: 'Restore failed',
        description: 'Could not restore this meeting. Please try again.',
        type: 'error',
      });
    },
  });

  const deleteForeverMutation = useMutation({
    mutationFn: deleteMeetingForever,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      setSelectedMeetingId(null);
      toast({
        title: 'Permanently deleted',
        description: 'Audio and notes have been completely purged from storage',
        type: 'success',
      });
    },
    onError: () => {
      toast({
        title: 'Deletion failed',
        description: 'Could not permanently delete this meeting.',
        type: 'error',
      });
    },
  });

  const emptyTrashMutation = useMutation({
    mutationFn: emptyTrash,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      setConfirmEmptyOpen(false);
      toast({
        title: 'Trash emptied',
        description: `Permanently removed ${res.deleted_count} items from storage`,
        type: 'success',
      });
    },
    onError: () => {
      toast({
        title: 'Failed to empty trash',
        description: 'Could not complete operation.',
        type: 'error',
      });
    },
  });

  const items = data?.items || [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-24">
      {/* Header Banner */}
      <div className="glass-card rounded-3xl border border-white/20 p-6 sm:p-8 shadow-xl backdrop-blur-2xl">
        <WindowChrome
          title="Trash Bin"
          subtitle="Auto-purge after 30 days"
          actions={
            items.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                data-testid="empty-trash-btn"
                onClick={() => setConfirmEmptyOpen(true)}
                className="gap-1.5 shadow-md"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Empty Trash</span>
              </Button>
            )
          }
        />
        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
              <span>Trash</span>
              <Badge variant="secondary" className="text-xs">
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Deleted meetings stay here for 30 days before being automatically and permanently purged along with their audio files.
            </p>
          </div>
        </div>
      </div>

      {/* Main List */}
      {isLoading ? (
        <div className="flex items-center justify-center p-16">
          <Spinner size="lg" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Trash2}
          title="Trash is empty"
          description="Deleted meetings will appear here for 30 days before being purged forever."
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card
              key={item.id}
              data-testid="trash-row"
              className="p-4 sm:p-5 rounded-2xl border border-white/15 glass-card shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all hover:border-white/30"
            >
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-base font-bold text-foreground truncate">{item.title}</h3>
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                    title="Auto purge countdown"
                  >
                    <Clock className="w-3 h-3" />
                    <span>{item.days_until_purge}d left</span>
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>Deleted {new Date(item.deleted_at).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>
                    Duration: {item.duration_sec ? `${Math.round(item.duration_sec / 60)}m` : 'Unknown'}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="restore-meeting-btn"
                  disabled={restoreMutation.isPending}
                  onClick={() => restoreMutation.mutate(item.id)}
                  className="gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore</span>
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  data-testid="delete-forever-btn"
                  onClick={() => setSelectedMeetingId(item.id)}
                  className="gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Forever</span>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Single Delete Confirmation Dialog */}
      <Dialog
        open={selectedMeetingId !== null}
        onOpenChange={(open) => !open && setSelectedMeetingId(null)}
      >
        <DialogContent className="max-w-md glass-card border border-white/20">
          <DialogHeader>
            <DialogTitle>Permanently delete this meeting?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p>
                This action cannot be undone. The meeting transcript, AI notes, action items, and stored audio will be permanently wiped.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setSelectedMeetingId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                data-testid="confirm-delete-forever-btn"
                disabled={deleteForeverMutation.isPending}
                onClick={() => {
                  if (selectedMeetingId) deleteForeverMutation.mutate(selectedMeetingId);
                }}
              >
                {deleteForeverMutation.isPending ? 'Deleting...' : 'Delete Forever'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Empty Trash Confirmation Dialog */}
      <Dialog open={confirmEmptyOpen} onOpenChange={setConfirmEmptyOpen}>
        <DialogContent className="max-w-md glass-card border border-white/20">
          <DialogHeader>
            <DialogTitle>Empty Entire Trash Bin?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p>
                Are you sure you want to permanently delete all {items.length} items in the trash? All stored audio and AI data will be purged immediately.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setConfirmEmptyOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                data-testid="confirm-empty-trash-btn"
                disabled={emptyTrashMutation.isPending}
                onClick={() => emptyTrashMutation.mutate()}
              >
                {emptyTrashMutation.isPending ? 'Emptying...' : 'Yes, Empty Trash'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
