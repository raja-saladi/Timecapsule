import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { CapsuleForm } from "@/components/capsule-form";
import { ConfigNotice } from "@/components/config-notice";
import { createClient } from "@/lib/supabase/server";
export default async function NewCapsulePage(){const supabase=await createClient();if(!supabase)return <div className="app-page"><AppHeader/><div className="shell app-main"><ConfigNotice/></div></div>;const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/auth");return <div className="app-page"><AppHeader/><main className="shell app-main"><div className="form-shell"><Link href="/dashboard" className="btn btn-text" style={{paddingLeft:0}}><ArrowLeft size={14}/> Back to your capsules</Link><div className="page-heading" style={{marginTop:15}}><div><div className="eyebrow">Make a memory for later</div><h1>Create a capsule</h1><p>Choose what to save and the date you want it to return.</p></div></div></div><CapsuleForm/></main></div>;}
