import { UsersList } from "@/components/UsersList";

/** Admin user management — rendered inside the dashboard shell (`App.tsx`). */
export default function UsersView() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <UsersList />
    </div>
  );
}
