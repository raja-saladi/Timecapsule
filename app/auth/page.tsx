import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthForm } from "@/components/auth-form";
export default async function AuthPage({searchParams}:{searchParams:Promise<{mode?:string}>}) {
  const supabase=await createClient();
  if(supabase){const {data}=await supabase.auth.getUser();if(data.user)redirect("/dashboard");}
  const params=await searchParams;
  return <AuthForm initialMode={params.mode==="signup"?"signup":"signin"}/>;
}
