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
      <div
        className={`flex w-full items-start justify-between px-3 sm:items-center sm:px-6 ${
          isSimpleHeader ? "py-3 sm:py-4" : "py-4 sm:py-5"
        }`}
      >
        <MainNav hideMenu={isSimpleHeader} disableLogoLink={disableLogoLink} />
        {!isSimpleHeader && <UserButton />}
      </div>
    </header>
  );
}
