"use client";

import { MainNav } from "./main-nav";
import UserButton from "./settings";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();
  const isSimpleHeader =
    pathname === "/auth/signin" ||
    pathname === "/auth/timeout" ||
    pathname === "/groups/empty";
  const disableLogoLink = pathname === "/groups/empty";

  return (
    <header className="sticky border-b">
      <div className="flex items-center justify-between w-full pl-4 pr-64 pt-6 pb-6 sm:pl-6 sm:pr-80">
        <MainNav hideMenu={isSimpleHeader} disableLogoLink={disableLogoLink} />
        {!isSimpleHeader && <UserButton />}
      </div>
    </header>
  );
}
