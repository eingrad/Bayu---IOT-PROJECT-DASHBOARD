import { API_BASE } from "../../config/api";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { jwtDecode } from "jwt-decode";
import { EyeCloseIcon, EyeIcon } from "../../icons";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Checkbox from "../form/input/Checkbox";
import Button from "../ui/button/Button";

type JWTPayload = {
  userId: string;
  role: "admin" | "user";
  exp: number;
};

export default function SignInForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isChecked) {
      setError("You must agree to Terms & Conditions before signing in.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: email, password }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.msg || "Login failed");
      }

      const { token } = await res.json(); // { token: "..." }
      localStorage.setItem("token", token); // store it if need

      const { role } = jwtDecode<JWTPayload>(token);

      if (role === "admin") {
        navigate("/basic-tables");
      } else {
        navigate("/user");
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <div className="mx-auto pt-10 w-full max-w-md"></div>
      <div className="flex flex-col flex-1 justify-center mx-auto w-full max-w-md">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm sm:text-title-md dark:text-white/90">
              Welcome back!
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Enter your email and password to sign in!
            </p>
            {error && <p className="mt-2 text-red-500 text-sm">{error}</p>}
          </div>
          <form onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div>
                <Label>
                  Email <span className="text-error-500">*</span>
                </Label>
                <Input
                  placeholder="user@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>
                  Password <span className="text-error-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <span
                    onClick={() => setShowPassword((s) => !s)}
                    className="top-1/2 right-4 z-30 absolute -translate-y-1/2 cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeIcon className="fill-gray-500 dark:fill-gray-400 size-5" />
                    ) : (
                      <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400 size-5" />
                    )}
                  </span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Checkbox checked={isChecked} onChange={setIsChecked} />
                  <span className="block font-normal text-gray-700 text-theme-sm dark:text-gray-400">
                    I agree with <b>Terms & Conditions</b>
                  </span>
                </div>
                <Link
                  to="/reset-password"
                  className="text-brand-500 hover:text-brand-600 dark:text-brand-400 text-sm"
                >
                  Forgot password?
                </Link>
              </div>
              <div>
                <Button className="w-full" size="sm">
                  Sign in
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
