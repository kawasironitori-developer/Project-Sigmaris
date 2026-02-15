import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabaseClient";
import {
  AssistantIf,
  useThreadListItem,
  useThreadListItemRuntime,
  ThreadListItemMorePrimitive,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
} from "@assistant-ui/react";
import {
  CogIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UserIcon,
} from "lucide-react";
import Link from "next/link";
import type { FC } from "react";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useTouhouUi } from "@/components/assistant-ui/touhou-ui-context";

export const ThreadList: FC = () => {
  return (
    <ThreadListPrimitive.Root className="aui-root aui-thread-list-root flex flex-col gap-1">
      <ThreadListNew />
      <UserBlock />
      <AssistantIf condition={({ threads }) => threads.isLoading}>
        <ThreadListSkeleton />
      </AssistantIf>
      <AssistantIf condition={({ threads }) => !threads.isLoading}>
        <ThreadListPrimitive.Items components={{ ThreadListItem }} />
      </AssistantIf>
    </ThreadListPrimitive.Root>
  );
};

const UserBlock: FC = () => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user ?? null);
    };

    fetchUser();
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      fetchUser();
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const avatarUrl = useMemo(() => {
    const u = user;
    if (!u) return null;
    const md = u.user_metadata as Record<string, unknown> | null;
    const v = md && typeof md.avatar_url === "string" ? md.avatar_url : null;
    return v;
  }, [user]);

  const displayName = useMemo(() => {
    const u = user;
    if (!u) return "";
    const md = u.user_metadata as Record<string, unknown> | null;
    const v =
      md && typeof md.full_name === "string" ? md.full_name : u.email ?? "";
    return String(v ?? "");
  }, [user]);

  const email = user?.email ?? "";

  return (
    <div className="my-2 rounded-xl border bg-background/60 px-3 py-3 text-foreground">
      <div className="flex items-center gap-3">
        <Avatar className="size-9">
          <AvatarImage src={avatarUrl ?? undefined} alt="User avatar" />
          <AvatarFallback>
            <UserIcon className="size-4" />
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-sm">
            {displayName || "User"}
          </div>
          <div className="truncate text-muted-foreground text-xs">{email}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">ログイン中のアカウント</div>
        <Button asChild variant="outline" size="sm">
          <Link href="/settings">
            <CogIcon className="mr-2 size-4" />
            設定
          </Link>
        </Button>
      </div>
    </div>
  );
};

const ThreadListNew: FC = () => {
  return (
    <ThreadListPrimitive.New asChild>
      <Button
        variant="outline"
        className="aui-thread-list-new h-9 justify-start gap-2 rounded-lg px-3 text-sm hover:bg-muted data-active:bg-muted"
      >
        <PlusIcon className="size-4" />
        New Thread
      </Button>
    </ThreadListPrimitive.New>
  );
};

const ThreadListSkeleton: FC = () => {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          role="status"
          aria-label="Loading threads"
          className="aui-thread-list-skeleton-wrapper flex h-9 items-center px-3"
        >
          <Skeleton className="aui-thread-list-skeleton h-4 w-full" />
        </div>
      ))}
    </div>
  );
};

const ThreadListItem: FC = () => {
  const { activeSessionId, sessions, characters } = useTouhouUi();
  const threadId = useThreadListItem((s: { id: string }) => s.id);

  const accent = useMemo(() => {
    const session = sessions.find((s) => s.id === threadId);
    if (!session) return null;
    const ch = characters[session.characterId];
    return ch?.color?.accent ?? null;
  }, [sessions, characters, threadId]);

  const avatar = useMemo(() => {
    const session = sessions.find((s) => s.id === threadId);
    if (!session) return null;
    const ch = characters[session.characterId];
    return ch?.ui?.avatar ?? null;
  }, [sessions, characters, threadId]);

  const isActive = threadId === activeSessionId;

  return (
    <ThreadListItemPrimitive.Root
      className={cn(
        "aui-thread-list-item group relative flex h-9 items-center gap-2 rounded-lg transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
        isActive && accent
          ? `bg-gradient-to-r ${accent} text-white`
          : "data-active:bg-muted",
      )}
    >
      <ThreadListItemPrimitive.Trigger className="aui-thread-list-item-trigger flex h-full min-w-0 flex-1 items-center gap-2 truncate px-3 text-start text-sm">
        <Avatar className="size-6 shrink-0">
          <AvatarImage src={avatar ?? undefined} alt="character avatar" />
          <AvatarFallback className="text-[10px]">?</AvatarFallback>
        </Avatar>
        <ThreadListItemPrimitive.Title fallback="New Chat" />
      </ThreadListItemPrimitive.Trigger>
      <ThreadListItemMore />
    </ThreadListItemPrimitive.Root>
  );
};

const ThreadListItemMore: FC = () => {
  const itemRuntime = useThreadListItemRuntime({ optional: true });
  const title = useThreadListItem(
    { optional: true, selector: (s: { title?: string }) => s.title },
  );

  return (
    <ThreadListItemMorePrimitive.Root>
      <ThreadListItemMorePrimitive.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="aui-thread-list-item-more mr-2 size-7 p-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:bg-accent data-[state=open]:opacity-100 group-data-active:opacity-100"
        >
          <MoreHorizontalIcon className="size-4" />
          <span className="sr-only">More options</span>
        </Button>
      </ThreadListItemMorePrimitive.Trigger>
      <ThreadListItemMorePrimitive.Content
        side="bottom"
        align="start"
          className="aui-thread-list-item-more-content z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <ThreadListItemMorePrimitive.Item
          className="aui-thread-list-item-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
          onSelect={() => {
            if (!itemRuntime) return;
            const next = prompt("タイトルを変更", title ?? "");
            if (!next) return;
            itemRuntime.rename(next);
          }}
        >
          <PencilIcon className="size-4" />
          Rename
        </ThreadListItemMorePrimitive.Item>

        <ThreadListItemPrimitive.Delete asChild>
          <ThreadListItemMorePrimitive.Item className="aui-thread-list-item-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive outline-none hover:bg-accent focus:bg-accent">
            <TrashIcon className="size-4" />
            Delete
          </ThreadListItemMorePrimitive.Item>
        </ThreadListItemPrimitive.Delete>
      </ThreadListItemMorePrimitive.Content>
    </ThreadListItemMorePrimitive.Root>
  );
};
