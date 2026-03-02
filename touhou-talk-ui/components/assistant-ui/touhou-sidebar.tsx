"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Home, Users, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
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
  charactersCollapsed: boolean;
  onCharactersCollapsedChange: (next: boolean) => void;
};

export function TouhouSidebar({
  visibleCharacters,
  activeCharacterId,
  onSelectCharacter,
  charactersCollapsed,
  onCharactersCollapsedChange,
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
        <div className="flex items-center justify-end gap-2">
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
            キャラ選択 / セッション
          </p>
          <div className="mt-3">
            <Link
              href="/"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-xs font-medium text-sidebar-foreground/90 transition hover:bg-sidebar-accent"
            >
              <Home className="size-4" />
              サイトトップへ
            </Link>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="p-0">
        <div className="flex h-full min-h-0">
          {/* Characters (left / collapsible) */}
          <div
            className={cn(
              "flex min-h-0 flex-col border-r border-sidebar-border transition-[width] duration-200",
              charactersCollapsed ? "w-12" : "w-1/2",
            )}
          >
            <div className="flex items-center justify-between gap-2 px-2 py-2">
              {!charactersCollapsed ? (
                <div className="flex items-center gap-2 text-xs text-sidebar-foreground/60">
                  <Users className="size-4" />
                  キャラクター
                </div>
              ) : (
                <div className="flex w-full justify-center text-sidebar-foreground/70">
                  <Users className="size-4" />
                </div>
              )}

              <button
                type="button"
                onClick={() => onCharactersCollapsedChange(!charactersCollapsed)}
                className={cn(
                  "flex size-8 items-center justify-center rounded-md transition hover:bg-sidebar-accent",
                  charactersCollapsed && "mx-auto",
                )}
                aria-label={charactersCollapsed ? "Expand characters" : "Collapse characters"}
              >
                {charactersCollapsed ? (
                  <ChevronRight className="size-4" />
                ) : (
                  <ChevronLeft className="size-4" />
                )}
              </button>
            </div>

            {!charactersCollapsed && (
              <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
                <div className="flex flex-col gap-2 pr-1">
                  {visibleCharacters.length === 0 && (
                    <div className="text-xs text-sidebar-foreground/50">
                      表示できるキャラクターがありません
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
            )}
          </div>

          {/* Threads (right) */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-sidebar-border px-3 py-2 text-xs text-sidebar-foreground/60">
              セッション
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
              <ThreadList />
            </div>

            <div className="border-t border-sidebar-border p-3">
              <div className="ml-auto w-full max-w-md">
                <UserBlock />
              </div>
            </div>
          </div>
        </div>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
