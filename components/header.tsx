import { MainNav } from "./main-nav";
import UserButton from "./user-button";

export default function Header() {
  return (
    <header className="sticky border-b">
      <div className="flex items-center justify-between w-full pl-4 pr-64 pt-6 pb-6 sm:pl-6 sm:pr-80">
        <MainNav />
        <UserButton />
      </div>
    </header>
  );
}
