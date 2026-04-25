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
  const brandClass = hideMenu
    ? "text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl"
    : "text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl";

  const logoContent = (
    <>
      <span className="text-slate-900 dark:text-white">Kaji</span>
      <span className="text-blue-600">Share</span>
    </>
  );

  return (
    <div className="flex flex-wrap items-center gap-3 sm:gap-6">
      {disableLogoLink ? (
        <div className={brandClass} aria-label="KajiShare">
          {logoContent}
        </div>
      ) : (
        <CustomLink href="/" className={brandClass}>
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
                  " ml-0 text-sm font-bold sm:ml-2 sm:text-base md:text-lg"
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
                  " text-sm font-bold sm:text-base md:text-lg"
                }
              >
                担当のタスク
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink
                href="/evaluations"
                className={
                  navigationMenuTriggerStyle() +
                  " text-sm font-bold sm:text-base md:text-lg"
                }
              >
                評価
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
