import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { CapsuleDashboard } from "@/components/capsule-dashboard";
import { ConfigNotice } from "@/components/config-notice";
import { createClient } from "@/lib/supabase/server";
import type { Capsule } from "@/lib/types";
export default async function DashboardPage({searchParams}:{searchParams:Promise<{saved?:string}>}){
 const supabase=await createClient();if(!supabase)return <main className="app-page"><AppHeader/><div className="shell app-main"><ConfigNotice/></div></main>;
 const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/auth");
 const result=await supabase.from("capsules").select("id,user_id,title,description,unlock_at,time_zone,visibility,recipient_name,created_at,updated_at").order("created_at",{ascending:false});
 const params=await searchParams;const saved=params.saved==="created"||params.saved==="updated"?params.saved:undefined;const capsules=(result.data||[]) as Capsule[];const name=typeof user.user_metadata?.display_name==="string"?user.user_metadata.display_name.split(" ")[0]:"";
 return <div className="app-page"><AppHeader/><CapsuleDashboard capsules={capsules} displayName={name} userId={user.id} success={saved} error={result.error?"Capsule data could not be loaded. Check that the Supabase migration has been applied. "+result.error.message:undefined}/></div>;
}

