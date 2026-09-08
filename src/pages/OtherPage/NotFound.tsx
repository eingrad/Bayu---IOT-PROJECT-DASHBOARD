import GridShape from "../../components/common/GridShape";
import { useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";

export default function NotFound() {
  const navigate = useNavigate();

  const getRoleFromToken = (): string | null => {
    const token = localStorage.getItem("token");
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.role;
    } catch {
      return null;
    }
  };

  const handleRedirect = () => {
    const role = getRoleFromToken();
    if (role === "admin") {
      navigate("/basic-tables");
    } else if (role === "user") {
      navigate("/user");
    } else {
      navigate("/signin");
    }
  };

  return (
    <>
      <PageMeta title="Error 404" description="" />
      <div className="z-1 relative flex flex-col justify-center items-center p-6 min-h-screen overflow-hidden">
        <GridShape />
        <div className="mx-auto w-full max-w-[242px] sm:max-w-[472px] text-center">
          <h1 className="mb-8 font-bold text-gray-800 text-title-md xl:text-title-2xl dark:text-white/90">
            ERROR
          </h1>

          <img src="/images/error/404.svg" alt="404" className="dark:hidden" />
          <img
            src="/images/error/404-dark.svg"
            alt="404"
            className="hidden dark:block"
          />

          <p className="mt-10 mb-6 text-gray-700 dark:text-gray-400 text-base sm:text-lg">
            We can’t seem to find the page you are looking for!
          </p>

          <button
            onClick={handleRedirect}
            className="inline-flex justify-center items-center bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-white/[0.03] shadow-theme-xs px-5 py-3.5 border border-gray-300 dark:border-gray-700 rounded-lg font-medium text-gray-700 hover:text-gray-800 dark:hover:text-gray-200 dark:text-gray-400 text-sm"
          >
            Back to Home Page
          </button>
        </div>
        <p className="bottom-6 left-1/2 absolute text-gray-500 dark:text-gray-400 text-sm text-center -translate-x-1/2">
          &copy; {new Date().getFullYear()} - Bayu Sense
        </p>
      </div>
    </>
  );
}
