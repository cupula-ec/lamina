"use client";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button className="btn btn-sm" onClick={async () => { await authClient.signOut(); router.replace("/login"); router.refresh(); }}>Salir</button>
  );
}
