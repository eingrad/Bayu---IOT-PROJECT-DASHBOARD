import React from "react";
import GridShape from "../../components/common/GridShape";
import { Link } from "react-router";
import ThemeTogglerTwo from "../../components/common/ThemeTogglerTwo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="z-1 relative bg-white dark:bg-gray-900 p-6 sm:p-0">
      <div className="relative flex lg:flex-row flex-col justify-center dark:bg-gray-900 sm:p-0 w-full h-screen">
        {children}
        <div className="hidden items-center lg:grid bg-brand-950 dark:bg-white/5 w-full lg:w-1/2 h-full">
          <div className="z-1 relative flex justify-center items-center">
            {/* <!-- ===== Common Grid Shape Start ===== --> */}
            <GridShape />
            <div className="flex flex-col items-center max-w-xs">
              <Link to="/" className="block mb-4">
                <img
                  className="auth-logo"
                  width={250}
                  height={65}
                  src="/images/logo/BAYU-full.svg"
                  alt="Logo"
                />
              </Link>
              <p className="text-gray-400 dark:text-white/60 text-center"></p>
            </div>
          </div>
        </div>
        <div className="hidden sm:block right-6 bottom-6 z-50 fixed">
          <ThemeTogglerTwo />
        </div>
      </div>
    </div>
  );
}
