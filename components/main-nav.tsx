"use client";
import Link from "next/link";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "./ui/navigation-menu";

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
        <Link href="/" className={brandClass}>
          {logoContent}
        </Link>
      )}
      {!hideMenu && (
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink
                asChild
                className={
                  navigationMenuTriggerStyle() +
                  " ml-0 text-sm font-bold sm:ml-2 sm:text-base md:text-lg"
                }
              >
                <Link href="/tasks">タスク一覧</Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink
                asChild
                className={
                  navigationMenuTriggerStyle() +
                  " text-sm font-bold sm:text-base md:text-lg"
                }
              >
                <Link href="/records">担当のタスク</Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink
                asChild
                className={
                  navigationMenuTriggerStyle() +
                  " text-sm font-bold sm:text-base md:text-lg"
                }
              >
                <Link href="/evaluations">評価</Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      )}
    </div>
  );
}
