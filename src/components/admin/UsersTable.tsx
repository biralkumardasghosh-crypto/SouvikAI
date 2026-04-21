'use client';

import { useState } from 'react';
import {
    Button,
    Label,
    Textarea,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui';
import { User } from '@/types/auth';
import { getUserStatusLabel, getUserStatusColor } from '@/utils/auth-helpers';
import { formatDate } from '@/lib/utils';
import { Trash2, Clock, LogOut, LogIn } from 'lucide-react';

interface UsersTableProps {
    users: User[];
    isEditMode: boolean;
    onDelete: (userId: string, reason: string) => Promise<{ success: boolean }>;
    onSuspend: (userId: string, reason: string, hours: number) => Promise<{ success: boolean }>;
    onKick: (userId: string) => Promise<{ success: boolean }>;
    onUnkick: (userId: string) => Promise<{ success: boolean }>;
}

export function UsersTable({ users, isEditMode, onDelete, onSuspend, onKick, onUnkick }: UsersTableProps) {
    const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; user: User | null }>({
        open: false,
        user: null,
    });
    const [suspendDialog, setSuspendDialog] = useState<{ open: boolean; user: User | null }>({
        open: false,
        user: null,
    });
    const [deleteReason, setDeleteReason] = useState('');
    const [suspendReason, setSuspendReason] = useState('');
    const [suspendDuration, setSuspendDuration] = useState('24');
    const [isLoading, setIsLoading] = useState(false);

    const handleDelete = async () => {
        if (!deleteDialog.user || !deleteReason.trim()) return;
        setIsLoading(true);
        await onDelete(deleteDialog.user.id, deleteReason);
        setIsLoading(false);
        setDeleteDialog({ open: false, user: null });
        setDeleteReason('');
    };

    const handleSuspend = async () => {
        if (!suspendDialog.user || !suspendReason.trim()) return;
        setIsLoading(true);
        await onSuspend(suspendDialog.user.id, suspendReason, parseInt(suspendDuration));
        setIsLoading(false);
        setSuspendDialog({ open: false, user: null });
        setSuspendReason('');
    };

    const handleKick = async (user: User) => {
        setIsLoading(true);
        await onKick(user.id);
        setIsLoading(false);
    };

    const handleUnkick = async (user: User) => {
        setIsLoading(true);
        await onUnkick(user.id);
        setIsLoading(false);
    };

    return (
        <>
            <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="text-left p-3 text-sm font-medium">Email</th>
                            <th className="text-left p-3 text-sm font-medium">Status</th>
                            <th className="text-left p-3 text-sm font-medium">Created</th>
                            <th className="text-right p-3 text-sm font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user) => (
                            <tr key={user.id} className="border-t border-border hover:bg-muted/30">
                                <td className="p-3 text-sm">{user.email}</td>
                                <td className="p-3">
                                    <span className={`text-sm font-medium ${getUserStatusColor(user)}`}>
                                        {getUserStatusLabel(user)}
                                    </span>
                                </td>
                                <td className="p-3 text-sm text-muted-foreground">
                                    {formatDate(user.createdAt)}
                                </td>
                                <td className="p-3">
                                    <div className="flex items-center justify-end gap-2">
                                        {user.isKicked ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={!isEditMode}
                                                onClick={() => handleUnkick(user)}
                                                title="Unkick user"
                                            >
                                                <LogIn className="h-4 w-4 text-green-500" />
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={!isEditMode}
                                                onClick={() => handleKick(user)}
                                                title="Kick user"
                                            >
                                                <LogOut className="h-4 w-4" />
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={!isEditMode}
                                            onClick={() => setSuspendDialog({ open: true, user })}
                                            title="Suspend user"
                                        >
                                            <Clock className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={!isEditMode || user.isDeleted}
                                            onClick={() => setDeleteDialog({ open: true, user })}
                                            className="text-destructive hover:text-destructive"
                                            title="Delete user"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {users.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground">
                        No users found
                    </div>
                )}
            </div>

            {/* Delete Dialog */}
            <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, user: deleteDialog.user })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete User</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete {deleteDialog.user?.email}? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="delete-reason">Reason for deletion (required)</Label>
                            <Textarea
                                id="delete-reason"
                                value={deleteReason}
                                onChange={(e) => setDeleteReason(e.target.value)}
                                placeholder="Enter reason for deleting this user..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteDialog({ open: false, user: null })}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={!deleteReason.trim() || isLoading}
                        >
                            Delete User
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Suspend Dialog */}
            <Dialog open={suspendDialog.open} onOpenChange={(open) => setSuspendDialog({ open, user: suspendDialog.user })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Suspend User</DialogTitle>
                        <DialogDescription>
                            Suspend {suspendDialog.user?.email} from using the AI.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="suspend-duration">Suspension Duration</Label>
                            <Select value={suspendDuration} onValueChange={setSuspendDuration}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">1 hour</SelectItem>
                                    <SelectItem value="6">6 hours</SelectItem>
                                    <SelectItem value="24">24 hours</SelectItem>
                                    <SelectItem value="72">3 days</SelectItem>
                                    <SelectItem value="168">7 days</SelectItem>
                                    <SelectItem value="720">30 days</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="suspend-reason">Reason for suspension (required)</Label>
                            <Textarea
                                id="suspend-reason"
                                value={suspendReason}
                                onChange={(e) => setSuspendReason(e.target.value)}
                                placeholder="Enter reason for suspending this user..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSuspendDialog({ open: false, user: null })}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSuspend}
                            disabled={!suspendReason.trim() || isLoading}
                        >
                            Suspend User
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
