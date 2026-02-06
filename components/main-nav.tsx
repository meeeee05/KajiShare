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

export function MainNav() {
  return (
    <div className="flex items-center gap-6">
      <CustomLink
        href="/"
        className="group inline-flex items-center gap-3 leading-tight"
      >
        <span className="relative flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-400/70 via-sky-300/70 to-white shadow-sm ring-1 ring-sky-200/80">
          <span className="absolute -left-1 -top-1 h-3 w-3 rounded-full bg-white/80 shadow" />
          <span className="absolute -right-1 -bottom-1 h-4 w-4 rounded-full bg-blue-200/80" />
          <span className="relative flex h-6 w-6 items-center justify-center rounded-xl bg-white/80">
            <span className="relative flex h-5 w-5 flex-col justify-between">
              <span className="h-[2px] w-5 rounded-full bg-blue-400/80" />
              <span className="flex items-center justify-between">
                <span className="h-2 w-2 rounded-full bg-blue-300" />
                <span className="h-2 w-2 rounded-full bg-sky-400" />
              </span>
              <span className="h-[2px] w-4 rounded-full bg-slate-300" />
            </span>
          </span>
        </span>
        <span className="text-2xl font-extrabold tracking-tight">
          <span className="text-slate-900">Kaji</span>
          <span className="text-blue-600">Share</span>
        </span>
      </CustomLink>
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuLink
              href="/server-example"
              className={navigationMenuTriggerStyle()}
            >
              Server Side
            </NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink
              href="/client-example"
              className={navigationMenuTriggerStyle()}
            >
              Client Side
            </NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
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
