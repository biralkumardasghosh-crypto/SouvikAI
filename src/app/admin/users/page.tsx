'use client';

import { UsersTable } from '@/components/admin';
import { useAdmin } from '@/hooks/useAdmin';

export default function AdminUsersPage() {
    const { users, isEditMode, deleteUser, suspendUser, kickUser, unkickUser } = useAdmin();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">All Users</h1>
                <p className="text-muted-foreground">Manage user accounts and permissions</p>
            </div>

            <UsersTable
                users={users}
                isEditMode={isEditMode}
                onDelete={deleteUser}
                onSuspend={suspendUser}
                onKick={kickUser}
                onUnkick={unkickUser}
            />

            {!isEditMode && (
                <p className="text-sm text-muted-foreground text-center py-4">
                    Enable Edit Mode to manage users
                </p>
            )}
        </div>
    );
}
