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
