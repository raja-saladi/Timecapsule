"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";
export function AppHeader(){const [busy,setBusy]=useState(false);const router=useRouter();async function signOut(){const client=createClient();if(!client)return;setBusy(true);await client.auth.signOut();router.push("/");router.refresh();}
return <header className="shell app-topbar"><Brand/><div className="nav-actions"><Link href="/dashboard" className="btn btn-text">My capsules</Link><button onClick={signOut} disabled={busy} className="btn btn-quiet" type="button"><LogOut size={14}/>{busy?"Signing out":"Sign out"}</button></div></header>;}
