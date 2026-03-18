"use client";

import { cn } from "@/lib/utils";
import CustomLink from "./custom-link";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "./ui/navigation-menu";
import React from "react";

export function MainNav({
  hideMenu = false,
  disableLogoLink = false,
}: {
  hideMenu?: boolean;
  disableLogoLink?: boolean;
}) {
  const logoContent = (
    <>
      <span className="text-slate-900 dark:text-white">Kaji</span>
      <span className="text-blue-600">Share</span>
    </>
  );

  return (
    <div className="flex items-center gap-6 flex-wrap">
      {disableLogoLink ? (
        <div
          className="text-7xl font-extrabold tracking-tight"
          aria-label="KajiShare"
        >
          {logoContent}
        </div>
      ) : (
        <CustomLink href="/" className="text-7xl font-extrabold tracking-tight">
          {logoContent}
        </CustomLink>
      )}
      {!hideMenu && (
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink
                href="/tasks"
                className={
                  navigationMenuTriggerStyle() +
                  " text-base md:text-lg font-bold ml-4"
                }
              >
                タスク一覧
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink
                href="/records"
                className={
                  navigationMenuTriggerStyle() +
                  " text-base md:text-lg font-bold"
                }
              >
                担当のタスク
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      )}
    </div>
  );
}

const ListItem = React.forwardRef<
  React.ElementRef<"a">,
  React.ComponentPropsWithoutRef<"a">
>(({ className, title, children, ...props }, ref) => {
  return (
    <li>
      <NavigationMenuLink asChild>
        <a
          ref={ref}
          className={cn(
            "block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
            className,
          )}
          {...props}
        >
          <div className="text-sm font-medium leading-none">{title}</div>
          <p className="text-sm leading-snug line-clamp-2 text-muted-foreground">
            {children}
          </p>
        </a>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = "ListItem";
