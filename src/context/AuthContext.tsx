import React, { createContext, useContext, ReactNode } from "react";
// src/utils/auth.ts
import { jwtDecode } from "jwt-decode";

// Define only logout in context
interface AuthContextType {
  logout: () => void;
}

// Create Context with default no-op
const AuthContext = createContext<AuthContextType>({
  logout: () => {},
});

// Provider component
export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const logout = () => {
    // Remove token from localStorage
    localStorage.removeItem("token");
    // Redirect to sign-in (or any public route)
  };

  return (
    <AuthContext.Provider value={{ logout }}>{children}</AuthContext.Provider>
  );
};

export type JWTPayload = {
  userId: string;
  role: "admin" | "user";
  company_id: string;
  exp: number;
};

export function getCompanyId(): string {
  const token = localStorage.getItem("token") || "";
  try {
    return jwtDecode<JWTPayload>(token).company_id;
  } catch {
    return "";
  }
}

export const useAuth = () => useContext(AuthContext);
