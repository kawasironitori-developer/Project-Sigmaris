import * as React from "react";
import { Github, X } from "lucide-react";
import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { ThreadList } from "@/components/assistant-ui/thread-list";

export function ThreadListSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { setOpen, setOpenMobile, isMobile } = useSidebar();

  const handleClose = () => {
    if (isMobile) {
      setOpenMobile(false);
    } else {
      setOpen(false);
    }
  };

  return (
    <Sidebar {...props}>
      {/* ===== Header ===== */}
      <SidebarHeader className="mb-2 border-b px-2 py-2">
        {isMobile && (
          <div className="flex justify-end">
            <button
              onClick={handleClose}
              className="flex size-8 items-center justify-center rounded-md hover:bg-sidebar-accent transition"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
      </SidebarHeader>

      {/* ===== Content ===== */}
      <SidebarContent className="px-2">
        <ThreadList />
      </SidebarContent>

      <SidebarRail />

      {/* ===== Footer ===== */}
      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link
                href="https://github.com/assistant-ui/assistant-ui"
                target="_blank"
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Github className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">GitHub</span>
                  <span>View Source</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
