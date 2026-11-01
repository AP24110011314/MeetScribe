import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { getFolders, createFolder, updateFolder, deleteFolder } from '@/api/meetings';
import { FolderData } from '@/types/meeting';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

interface FoldersSidebarSectionProps {
  isCollapsed?: boolean;
}

const PRESET_COLORS = [
  '#6366f1', // Indigo
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#ec4899', // Pink
];

export const FoldersSidebarSection: React.FC<FoldersSidebarSectionProps> = ({ isCollapsed }) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderData | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const { data } = useQuery({
    queryKey: ['folders'],
    queryFn: getFolders,
  });

  const createMutation = useMutation({
    mutationFn: createFolder,
    onSuccess: (newFolder) => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      setModalOpen(false);
      setName('');
      toast({
        title: 'Folder created',
        description: `Created folder "${newFolder.name}"`,
        type: 'success',
      });
    },
    onError: () => {
      toast({ title: 'Failed to create folder', type: 'error' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; color?: string } }) =>
      updateFolder(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      setEditingFolder(null);
      setModalOpen(false);
      toast({ title: 'Folder updated', type: 'success' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFolder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      toast({ title: 'Folder deleted', description: 'Meetings were unfiled.', type: 'success' });
    },
  });

  const openCreateModal = () => {
    setEditingFolder(null);
    setName('');
    setColor(PRESET_COLORS[0]);
    setModalOpen(true);
  };

  const openEditModal = (folder: FolderData, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingFolder(folder);
    setName(folder.name);
    setColor(folder.color);
    setModalOpen(true);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Delete this folder? Meetings inside will be unfiled.')) {
      deleteMutation.mutate(id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingFolder) {
      updateMutation.mutate({ id: editingFolder.id, data: { name: name.trim(), color } });
    } else {
      createMutation.mutate({ name: name.trim(), color });
    }
  };

  const folders = data?.items || [];

  return (
    <div className="pt-3 border-t border-white/10">
      <div className="flex items-center justify-between px-3 mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {!isCollapsed && <span>Folders</span>}
        <button
          type="button"
          onClick={openCreateModal}
          className="p-1 rounded-md hover:bg-white/10 hover:text-foreground transition-colors ml-auto"
          title="Create New Folder"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-0.5">
        {folders.map((folder) => (
          <NavLink
            key={folder.id}
            to={`/meetings?folder=${folder.id}`}
            data-testid="folder-item"
            className={({ isActive }) =>
              cn(
                'group flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium transition-colors',
                isActive
                  ? 'bg-primary/15 text-primary font-semibold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              )
            }
          >
            <div className="flex items-center gap-2 truncate">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: folder.color }}
              />
              {!isCollapsed && <span className="truncate">{folder.name}</span>}
            </div>

            {!isCollapsed && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[10px] font-mono tabular-nums text-muted-foreground mr-1">
                  {folder.meeting_count}
                </span>
                <button
                  type="button"
                  onClick={(e) => openEditModal(folder, e)}
                  className="p-1 rounded hover:bg-white/15 text-muted-foreground hover:text-foreground"
                  title="Rename"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDelete(folder.id, e)}
                  className="p-1 rounded hover:bg-white/15 text-muted-foreground hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </NavLink>
        ))}
      </div>

      {/* Create / Edit Folder Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm glass-card border border-white/20">
          <DialogHeader>
            <DialogTitle>{editingFolder ? 'Edit Folder' : 'New Folder'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Folder Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sprint Reviews"
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Color</label>
              <div className="flex items-center gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setColor(c)}
                    className={cn(
                      'w-6 h-6 rounded-full transition-transform active:scale-90',
                      color === c ? 'ring-2 ring-primary ring-offset-2 scale-110' : 'opacity-80 hover:opacity-100'
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!name.trim() || createMutation.isPending || updateMutation.isPending}
              >
                {editingFolder ? 'Save' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
