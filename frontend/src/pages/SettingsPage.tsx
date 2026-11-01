import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import {
  Sparkles,
  Sliders,
  Keyboard,
  Webhook as WebhookIcon,
  Plus,
  Play,
  Trash2,
  Copy,
  CheckCircle2,
  AlertCircle,
  History,
  ShieldCheck,
  Archive,
  AlertTriangle,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  listWebhooks,
  createWebhook,
  deleteWebhook,
  testWebhook,
  listWebhookDeliveries,
  exportAccountData,
  deleteAccount,
} from '@/api/meetings';
import { WebhookData, WebhookDeliveryData } from '@/types/meeting';

export function SettingsPage() {
  const { toast } = useToast();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'preferences' | 'webhooks' | 'account'>('preferences');

  // Account & Data state
  const [isExportingAccount, setIsExportingAccount] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const handleExportAccount = async () => {
    setIsExportingAccount(true);
    try {
      await exportAccountData();
      toast({
        type: 'success',
        title: 'Export Ready',
        description: 'Downloaded your complete data archive (.zip)',
      });
    } catch {
      toast({ type: 'error', title: 'Export failed', description: 'Could not generate data archive' });
    } finally {
      setIsExportingAccount(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      await deleteAccount();
      toast({
        type: 'info',
        title: 'Account deleted',
        description: 'Your account and data were permanently removed',
      });
      logout();
      navigate('/login');
    } catch {
      toast({ type: 'error', title: 'Error', description: 'Failed to delete account' });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // Preferences state
  const [density, setDensityState] = useState<'comfortable' | 'compact'>(() => {
    return (localStorage.getItem('meetscribe_density') as 'comfortable' | 'compact') || 'comfortable';
  });

  const [defaultView, setDefaultViewState] = useState<'grid' | 'table'>(() => {
    return (localStorage.getItem('meetscribe_default_view') as 'grid' | 'table') || 'grid';
  });

  const setDensity = (val: 'comfortable' | 'compact') => {
    localStorage.setItem('meetscribe_density', val);
    setDensityState(val);
    toast({ type: 'info', title: 'Density Updated', description: `Set to ${val}` });
  };

  const setDefaultView = (val: 'grid' | 'table') => {
    localStorage.setItem('meetscribe_default_view', val);
    setDefaultViewState(val);
    toast({ type: 'info', title: 'Default View Updated', description: `Meetings list will open in ${val} view` });
  };

  // Webhooks state
  const [webhooks, setWebhooks] = useState<WebhookData[]>([]);
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newEvents, setNewEvents] = useState<string[]>([
    'meeting.completed',
    'meeting.failed',
    'action_item.created',
  ]);
  const [isSubmittingWebhook, setIsSubmittingWebhook] = useState(false);

  // Deliveries history modal state
  const [historyWebhook, setHistoryWebhook] = useState<WebhookData | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryData[]>([]);
  const [isLoadingDeliveries, setIsLoadingDeliveries] = useState(false);

  useEffect(() => {
    if (activeTab === 'webhooks') {
      loadWebhooks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadWebhooks = async () => {
    setIsLoadingWebhooks(true);
    try {
      const data = await listWebhooks();
      setWebhooks(data);
    } catch {
      toast({ type: 'error', title: 'Error', description: 'Failed to load webhooks' });
    } finally {
      setIsLoadingWebhooks(false);
    }
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return;

    setIsSubmittingWebhook(true);
    try {
      const created = await createWebhook({
        url: newUrl.trim(),
        events: newEvents,
      });
      setWebhooks((prev) => [created, ...prev]);
      setIsAddModalOpen(false);
      setNewUrl('');
      toast({ type: 'success', title: 'Webhook registered', description: 'Endpoint is now active' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid webhook URL (SSRF rejection)';
      toast({ type: 'error', title: 'Failed to add webhook', description: msg });
    } finally {
      setIsSubmittingWebhook(false);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    try {
      await deleteWebhook(id);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      toast({ type: 'success', title: 'Deleted', description: 'Webhook endpoint removed' });
    } catch {
      toast({ type: 'error', title: 'Error', description: 'Failed to delete webhook' });
    }
  };

  const handleTestWebhook = async (wh: WebhookData) => {
    try {
      const delivery = await testWebhook(wh.id);
      if (delivery.success) {
        toast({
          type: 'success',
          title: 'Ping successful',
          description: `HTTP ${delivery.status_code || 200} received`,
        });
      } else {
        toast({
          type: 'error',
          title: 'Ping failed',
          description: delivery.response_body || `HTTP ${delivery.status_code}`,
        });
      }
    } catch {
      toast({ type: 'error', title: 'Error', description: 'Webhook test ping failed' });
    }
  };

  const handleViewDeliveries = async (wh: WebhookData) => {
    setHistoryWebhook(wh);
    setIsLoadingDeliveries(true);
    try {
      const list = await listWebhookDeliveries(wh.id);
      setDeliveries(list);
    } catch {
      toast({ type: 'error', title: 'Error', description: 'Could not load delivery history' });
    } finally {
      setIsLoadingDeliveries(false);
    }
  };

  const toggleEvent = (event: string) => {
    setNewEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const shortcuts = [
    { key: 'Cmd / Ctrl + K', description: 'Open Command Palette' },
    { key: 'g d', description: 'Navigate to Dashboard' },
    { key: 'g m', description: 'Navigate to Meetings List' },
    { key: 'g a', description: 'Navigate to Action Items' },
    { key: 'n', description: 'Upload New Recording' },
    { key: '/', description: 'Focus Search' },
    { key: '?', description: 'Open Keyboard Shortcuts Dialog' },
  ];

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold glass-card-subtle text-primary border border-primary/20 mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>System & Workspace Preferences</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Customize your appearance palette, display density, and outbound webhooks.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'preferences' | 'webhooks' | 'account')}>
        <TabsList className="glass-card border border-white/10 p-1 rounded-2xl mb-6">
          <TabsTrigger value="preferences" className="rounded-xl px-5 text-xs font-medium">
            Preferences & Theme
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="rounded-xl px-5 text-xs font-medium flex items-center gap-1.5">
            <WebhookIcon className="h-3.5 w-3.5" />
            <span>Webhooks</span>
          </TabsTrigger>
          <TabsTrigger value="account" className="rounded-xl px-5 text-xs font-medium flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            <span>Account & Data</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: PREFERENCES */}
        <TabsContent value="preferences" className="space-y-6">
          {/* Theme & Palette Setting Card */}
          <Card className="rounded-3xl border border-white/15 shadow-xl overflow-hidden">
            <CardHeader>
              <CardTitle className="text-xl">macOS Glass Themes</CardTitle>
              <CardDescription>Select your appearance mode and accent color palette</CardDescription>
            </CardHeader>
            <CardContent>
              <ThemeSwitcher variant="full" />
            </CardContent>
          </Card>

          {/* Display & Density Preferences */}
          <Card className="rounded-3xl border border-white/15 shadow-xl overflow-hidden">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Sliders className="w-5 h-5 text-primary" />
                <span>Display & Density</span>
              </CardTitle>
              <CardDescription>Adjust how information is laid out in lists and tables</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Density */}
              <div className="space-y-2.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Row Density
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDensity('comfortable')}
                    className={cn(
                      'p-4 rounded-2xl border text-left text-sm transition-all min-h-[56px]',
                      density === 'comfortable'
                        ? 'glass-card border-primary ring-2 ring-primary/40 bg-primary/10 font-semibold'
                        : 'glass-card-subtle border-white/10 hover:border-white/20'
                    )}
                  >
                    <p className="font-semibold text-foreground">Comfortable</p>
                    <p className="text-xs text-muted-foreground font-normal mt-0.5">Spacious paddings and line height</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDensity('compact')}
                    className={cn(
                      'p-4 rounded-2xl border text-left text-sm transition-all min-h-[56px]',
                      density === 'compact'
                        ? 'glass-card border-primary ring-2 ring-primary/40 bg-primary/10 font-semibold'
                        : 'glass-card-subtle border-white/10 hover:border-white/20'
                    )}
                  >
                    <p className="font-semibold text-foreground">Compact</p>
                    <p className="text-xs text-muted-foreground font-normal mt-0.5">High information density</p>
                  </button>
                </div>
              </div>

              {/* Default View */}
              <div className="space-y-2.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Default Meetings View
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDefaultView('grid')}
                    className={cn(
                      'p-4 rounded-2xl border text-left text-sm transition-all min-h-[56px]',
                      defaultView === 'grid'
                        ? 'glass-card border-primary ring-2 ring-primary/40 bg-primary/10 font-semibold'
                        : 'glass-card-subtle border-white/10 hover:border-white/20'
                    )}
                  >
                    <p className="font-semibold text-foreground">Grid Card View</p>
                    <p className="text-xs text-muted-foreground font-normal mt-0.5">Visual cards with key metadata</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDefaultView('table')}
                    className={cn(
                      'p-4 rounded-2xl border text-left text-sm transition-all min-h-[56px]',
                      defaultView === 'table'
                        ? 'glass-card border-primary ring-2 ring-primary/40 bg-primary/10 font-semibold'
                        : 'glass-card-subtle border-white/10 hover:border-white/20'
                    )}
                  >
                    <p className="font-semibold text-foreground">Table Row View</p>
                    <p className="text-xs text-muted-foreground font-normal mt-0.5">Tabular layout with quick actions</p>
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Shortcuts Reference */}
          <Card className="rounded-3xl border border-white/15 shadow-xl overflow-hidden">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-primary" />
                <span>Keyboard Shortcuts</span>
              </CardTitle>
              <CardDescription>Global hotkeys to navigate at lightning speed</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-white/10">
                {shortcuts.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between py-3">
                    <span className="text-sm text-foreground">{s.description}</span>
                    <kbd className="px-2.5 py-1 rounded-lg border border-white/15 bg-background/60 backdrop-blur-sm text-xs font-mono font-semibold text-muted-foreground">
                      {s.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: WEBHOOKS */}
        <TabsContent value="webhooks" className="space-y-6">
          <Card className="rounded-3xl border border-white/15 shadow-xl overflow-hidden p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <WebhookIcon className="w-5 h-5 text-primary" />
                  <span>Outbound Webhooks</span>
                </CardTitle>
                <CardDescription className="mt-1">
                  Deliver HMAC-signed event notifications to external automation tools and services.
                </CardDescription>
              </div>
              <Button onClick={() => setIsAddModalOpen(true)} className="gap-2 shrink-0">
                <Plus className="h-4 w-4" />
                <span>Add Webhook</span>
              </Button>
            </div>

            {/* SSRF Security Note */}
            <div className="flex items-start gap-2.5 p-3 rounded-2xl glass-card-subtle border border-emerald-500/20 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                All destination endpoints are strictly validated against SSRF attacks. Localhost, link-local, and private cloud address spaces are disallowed.
              </span>
            </div>

            {/* Webhooks List */}
            {isLoadingWebhooks ? (
              <div className="p-12 text-center text-xs text-muted-foreground">Loading registered webhooks...</div>
            ) : webhooks.length === 0 ? (
              <div className="p-12 text-center text-xs text-muted-foreground border border-dashed border-white/10 rounded-2xl">
                No webhooks registered yet. Click &quot;Add Webhook&quot; to configure your first destination.
              </div>
            ) : (
              <div className="space-y-3">
                {webhooks.map((wh) => (
                  <div
                    key={wh.id}
                    className="p-4 rounded-2xl glass-card border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold truncate text-foreground">
                          {wh.url}
                        </span>
                        <Badge variant={wh.is_active ? 'default' : 'secondary'} className="text-[10px]">
                          {wh.is_active ? 'Active' : 'Disabled'}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {wh.events.map((ev) => (
                          <span
                            key={ev}
                            className="px-2 py-0.5 rounded-full text-[10px] font-mono glass-card border border-white/10 text-muted-foreground"
                          >
                            {ev}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono pt-1">
                        <span>Secret: {wh.secret.slice(0, 10)}...</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(wh.secret);
                            toast({ type: 'success', title: 'Secret copied' });
                          }}
                          className="hover:text-foreground"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        data-testid="webhook-test-btn"
                        size="sm"
                        variant="glass"
                        onClick={() => handleTestWebhook(wh)}
                        className="gap-1.5 text-xs"
                      >
                        <Play className="h-3 w-3 text-emerald-400" />
                        <span>Test Ping</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="glass"
                        onClick={() => handleViewDeliveries(wh)}
                        className="gap-1.5 text-xs"
                      >
                        <History className="h-3 w-3" />
                        <span>Logs</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteWebhook(wh.id)}
                        className="p-2"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* TAB 3: ACCOUNT & DATA */}
        <TabsContent value="account" className="space-y-6">
          {/* Data Export Card */}
          <Card className="rounded-3xl border border-white/15 shadow-xl overflow-hidden p-6 space-y-4">
            <CardHeader className="p-0">
              <CardTitle className="text-xl flex items-center gap-2">
                <Archive className="w-5 h-5 text-primary" />
                <span>Export All Personal Data</span>
              </CardTitle>
              <CardDescription className="mt-1">
                Download a complete ZIP archive with all your meetings (JSON, Markdown), summaries, and action items (CSV, iCalendar).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-xs text-muted-foreground space-y-1">
                <div>• All transcript files, timestamps, and metadata</div>
                <div>• All generated summaries, key points, and decisions</div>
                <div>• Action items spreadsheet and calendar feed</div>
              </div>
              <Button
                data-testid="account-export-btn"
                onClick={handleExportAccount}
                disabled={isExportingAccount}
                className="gap-2 shrink-0"
              >
                <Archive className="h-4 w-4" />
                <span>{isExportingAccount ? 'Packaging Archive...' : 'Download Archive (.zip)'}</span>
              </Button>
            </CardContent>
          </Card>

          {/* Danger Zone: Delete Account */}
          <Card className="rounded-3xl border border-destructive/30 shadow-xl overflow-hidden p-6 space-y-4 bg-destructive/5">
            <CardHeader className="p-0">
              <CardTitle className="text-xl text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                <span>Danger Zone: Delete Account</span>
              </CardTitle>
              <CardDescription className="mt-1 text-destructive/80">
                Permanently deletes your account, all meetings, summaries, action items, and clears all audio recordings from storage. This cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 pt-2 flex justify-end">
              <Button
                data-testid="account-delete-btn"
                variant="destructive"
                onClick={() => setIsDeleteDialogOpen(true)}
                className="gap-2 shrink-0"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete Account Permanently</span>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Webhook Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-md glass-card border border-white/20 p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <WebhookIcon className="h-5 w-5 text-primary" />
              <span>Register Outbound Webhook</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateWebhook} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Payload URL (HTTPS)</label>
              <Input
                placeholder="https://your-api.com/webhook"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                required
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground block">Subscribe to Events</label>
              <div className="space-y-2 text-xs">
                {[
                  { id: 'meeting.completed', label: 'meeting.completed (processing done)' },
                  { id: 'meeting.failed', label: 'meeting.failed (processing error)' },
                  { id: 'action_item.created', label: 'action_item.created (new task)' },
                ].map((ev) => (
                  <label key={ev.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newEvents.includes(ev.id)}
                      onChange={() => toggleEvent(ev.id)}
                      className="rounded border-white/20 bg-transparent text-primary"
                    />
                    <span>{ev.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <Button type="submit" disabled={isSubmittingWebhook || !newUrl.trim()} className="w-full h-9">
              {isSubmittingWebhook ? 'Validating & Saving...' : 'Save Webhook'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delivery Logs Modal */}
      <Dialog open={Boolean(historyWebhook)} onOpenChange={(open) => !open && setHistoryWebhook(null)}>
        <DialogContent className="max-w-xl glass-card border border-white/20 p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <History className="h-5 w-5 text-primary" />
              <span>Delivery Logs: {historyWebhook?.url}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-80 overflow-y-auto space-y-2 pt-2">
            {isLoadingDeliveries ? (
              <div className="p-8 text-center text-xs text-muted-foreground">Loading deliveries...</div>
            ) : deliveries.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">No recent delivery attempts.</div>
            ) : (
              deliveries.map((deliv) => (
                <div
                  key={deliv.id}
                  className="p-3 rounded-xl glass-card border border-white/10 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                      {deliv.success ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                      )}
                      <span>{deliv.event}</span>
                    </span>
                    <Badge variant={deliv.success ? 'default' : 'destructive'} className="text-[10px]">
                      {deliv.status_code ? `HTTP ${deliv.status_code}` : 'Failed'}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(deliv.created_at).toLocaleString()}
                  </div>
                  {deliv.response_body && (
                    <div className="p-2 rounded-lg bg-black/30 font-mono text-[10px] text-muted-foreground truncate">
                      {deliv.response_body}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
      {/* Delete Account Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-md glass-card border border-destructive/40 p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-destructive">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <span>Confirm Account Deletion</span>
            </DialogTitle>
          </DialogHeader>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Are you absolutely sure? All your meeting recordings in S3/MinIO will be permanently erased immediately, and your notes, transcript history, tags, and action items will be purged from the database.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="glass"
              size="sm"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeletingAccount}
            >
              Cancel
            </Button>
            <Button
              data-testid="account-delete-confirm-btn"
              variant="destructive"
              size="sm"
              onClick={handleDeleteAccount}
              disabled={isDeletingAccount}
              className="gap-1.5"
            >
              <Trash2 className="h-4 w-4" />
              <span>{isDeletingAccount ? 'Deleting...' : 'Yes, Delete Everything'}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
