"use client";

import * as React from "react";
import Link from "next/link";
import { Map as MapIcon, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { ThreadList, UserBlock } from "@/components/assistant-ui/thread-list";

type Character = {
  id: string;
  name: string;
  title: string;
  ui?: {
    avatar?: string;
  };
};

type Props = React.ComponentProps<typeof Sidebar> & {
  visibleCharacters: Character[];
  activeCharacterId: string | null;
  onSelectCharacter: (id: string) => void;
};

export function TouhouSidebar({
  visibleCharacters,
  activeCharacterId,
  onSelectCharacter,
  className,
  ...props
}: Props) {
  const { setOpen, setOpenMobile, isMobile } = useSidebar();

  const handleClose = () => {
    if (isMobile) setOpenMobile(false);
    else setOpen(false);
  };

  return (
    <Sidebar className={cn(className)} {...props}>
      <SidebarHeader className="border-b px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/map/session/gensokyo"
            onClick={handleClose}
            className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-sidebar-foreground/80 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <MapIcon className="size-4" />
            マップに戻る
          </Link>

          {isMobile && (
            <button
              type="button"
              onClick={handleClose}
              className="flex size-8 items-center justify-center rounded-md transition hover:bg-sidebar-accent"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="px-1">
          <h1 className="font-gensou text-lg tracking-wide text-sidebar-foreground">
            Touhou Talk
          </h1>
          <p className="mt-1 text-xs text-sidebar-foreground/60">
            キャラ選択と会話セッション
          </p>
        </div>

        <div className="mt-4 px-1">
          <div className="mb-2 text-xs text-sidebar-foreground/60">キャラ選択</div>
          <div className="flex max-h-40 flex-col gap-2 overflow-auto pr-1">
            {visibleCharacters.length === 0 && (
              <div className="text-xs text-sidebar-foreground/50">
                マップで場所を選ぶとキャラが表示されます
              </div>
            )}

            {visibleCharacters.map((ch) => {
              const active = ch.id === activeCharacterId;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => onSelectCharacter(ch.id)}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition",
                    active
                      ? "border-sidebar-ring bg-sidebar-accent"
                      : "border-sidebar-border hover:bg-sidebar-accent/60",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-gensou text-sm text-sidebar-foreground">
                      {ch.name}
                    </div>
                    <div className="truncate text-xs text-sidebar-foreground/60">
                      {ch.title}
                    </div>
                  </div>

                  <Avatar className="size-9 shrink-0">
                    <AvatarImage src={ch.ui?.avatar} alt={ch.name} />
                    <AvatarFallback className="text-xs">
                      {String(ch.name ?? "?").slice(0, 1)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              );
            })}
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-3">
        <ThreadList />
      </SidebarContent>

      <SidebarRail />

      <SidebarFooter className="border-t p-3">
        <UserBlock className="bg-background/80" />
      </SidebarFooter>
    </Sidebar>
  );
}
