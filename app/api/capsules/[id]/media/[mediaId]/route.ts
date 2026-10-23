import { NextResponse,type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic";
export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string;mediaId:string}>}){const {id,mediaId}=await params;const client=await createClient();if(!client)return NextResponse.json({error:"Storage is not configured."},{status:503,headers:{"Cache-Control":"no-store"}});
 const {data:{user}}=await client.auth.getUser();if(!user)return NextResponse.json({error:"Sign in required."},{status:401,headers:{"Cache-Control":"no-store"}});
 const {data:cap,error:capError}=await client.from("capsules").select("id,unlock_at").eq("id",id).maybeSingle();if(capError||!cap)return NextResponse.json({error:"Capsule not found."},{status:404,headers:{"Cache-Control":"no-store"}});
 if(new Date(cap.unlock_at).getTime()>Date.now())return NextResponse.json({error:"This capsule is still sealed."},{status:403,headers:{"Cache-Control":"no-store"}});
 const {data:media,error}=await client.from("capsule_media").select("storage_key").eq("id",mediaId).eq("capsule_id",id).maybeSingle();if(error||!media)return NextResponse.json({error:"Media not found."},{status:404,headers:{"Cache-Control":"no-store"}});
 const {data:signed,error:signedError}=await client.storage.from("capsule-media").createSignedUrl(media.storage_key,60);if(signedError||!signed)return NextResponse.json({error:"Could not open this private file."},{status:403,headers:{"Cache-Control":"no-store"}});
 return NextResponse.redirect(signed.signedUrl,{headers:{"Cache-Control":"no-store, private","Referrer-Policy":"no-referrer"}});
}
