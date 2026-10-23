"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { capsuleSchema, localTimeToIso, validateMedia } from "@/lib/capsules";
import type { Capsule } from "@/lib/types";
type Result={ok:boolean;message:string;id?:string};
const BUCKET="capsule-media";
function field(form:FormData,key:string){const value=form.get(key);return typeof value==="string"?value:"";}
function inputFiles(form:FormData){return form.getAll("media").filter((value):value is File=>typeof value!=="string"&&value.size>0);}
function safeName(name:string){return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g,"-").slice(-100)||"upload";}
async function cleanupStorage(userClient:NonNullable<Awaited<ReturnType<typeof createClient>>>,userId:string,capsuleId:string,paths:string[]){
  if(!paths.length)return;
  const admin=createAdminClient();
  if(admin){await admin.storage.from(BUCKET).remove(paths);return;}
  await userClient.storage.from(BUCKET).remove(paths);
}
async function uploadMedia(userClient:NonNullable<Awaited<ReturnType<typeof createClient>>>,userId:string,capsuleId:string,files:File[]){
  const uploaded:string[]=[];const rows:{capsule_id:string;owner_id:string;storage_key:string;file_name:string;mime_type:string;size_bytes:number}[]=[];
  for(const file of files){const key=userId+"/"+capsuleId+"/"+crypto.randomUUID()+"-"+safeName(file.name);const {error}=await userClient.storage.from(BUCKET).upload(key,file,{contentType:file.type,upsert:false});
    if(error)return {error:"Could not upload "+file.name+": "+error.message,uploaded,rows};
    uploaded.push(key);rows.push({capsule_id:capsuleId,owner_id:userId,storage_key:key,file_name:file.name,mime_type:file.type,size_bytes:file.size});
  }
  return {error:null,uploaded,rows};
}
function metadata(form:FormData,unlockAt:string){return {title:field(form,"title").trim(),description:field(form,"description").trim()||null,unlock_at:unlockAt,time_zone:field(form,"timeZone"),visibility:field(form,"visibility"),recipient_name:field(form,"recipientName").trim()||null};}
async function resetRecipients(client:NonNullable<Awaited<ReturnType<typeof createClient>>>,capsuleId:string,visibility:string,email:string){
  const removed=await client.from("capsule_recipients").delete().eq("capsule_id",capsuleId);if(removed.error)return removed.error.message;
  if(visibility==="recipient"&&email){const added=await client.from("capsule_recipients").insert({capsule_id:capsuleId,recipient_email:email.toLowerCase()});if(added.error)return added.error.message;}
  return null;
}
async function restoreCapsule(client:NonNullable<Awaited<ReturnType<typeof createClient>>>,id:string,capsule:Capsule,letter:string|null,recipients:{recipient_email:string}[]){
  await client.from("capsules").update({title:capsule.title,description:capsule.description,unlock_at:capsule.unlock_at,time_zone:capsule.time_zone,visibility:capsule.visibility,recipient_name:capsule.recipient_name}).eq("id",id);
  await client.from("capsule_contents").upsert({capsule_id:id,letter});
  await client.from("capsule_recipients").delete().eq("capsule_id",id);
  if(recipients.length)await client.from("capsule_recipients").insert(recipients.map(item=>({capsule_id:id,recipient_email:item.recipient_email})));
}
export async function saveCapsule(form:FormData):Promise<Result>{
  const client=await createClient();if(!client)return {ok:false,message:"Supabase is not configured. Add the project URL and publishable key to .env.local."};
  const {data:{user}}=await client.auth.getUser();if(!user)return {ok:false,message:"Please sign in before saving a capsule."};
  const raw={title:field(form,"title"),description:field(form,"description"),letter:field(form,"letter"),unlockAt:field(form,"unlockAt"),timeZone:field(form,"timeZone"),visibility:field(form,"visibility"),recipientName:field(form,"recipientName"),recipientEmail:field(form,"recipientEmail")};
  const parsed=capsuleSchema.safeParse(raw);if(!parsed.success)return {ok:false,message:parsed.error.issues[0]?.message||"Check the capsule details and try again."};
  const values=parsed.data;if(values.visibility==="recipient"&&!values.recipientEmail)return {ok:false,message:"Add the recipient’s email address to share this capsule."};
  const unlockAt=localTimeToIso(values.unlockAt,values.timeZone);if(!unlockAt)return {ok:false,message:"That local time is invalid or falls inside a daylight-saving time change. Choose another time."};
  if(new Date(unlockAt).getTime()<=Date.now()+30000)return {ok:false,message:"Choose an unlock time at least 30 seconds in the future."};
  const files=inputFiles(form);const mediaError=validateMedia(files);if(mediaError)return {ok:false,message:mediaError};
  const details=metadata(form,unlockAt);const id=field(form,"id");const removing=form.getAll("removeMedia").filter((value):value is string=>typeof value==="string");
  let capsuleId=id;let oldCapsule:Capsule|undefined;let oldLetter:string|null=null;let oldRecipients:{recipient_email:string}[]=[];let created=false;
  if(id){
    const found=await client.from("capsules").select("*").eq("id",id).eq("user_id",user.id).maybeSingle();
    if(found.error||!found.data)return {ok:false,message:"This capsule is unavailable or no longer eligible for editing."};
    oldCapsule=found.data as Capsule;if(new Date(oldCapsule.unlock_at).getTime()<=Date.now())return {ok:false,message:"This capsule has already opened and can no longer be edited."};
    const oldContent=await client.from("capsule_contents").select("letter").eq("capsule_id",id).maybeSingle();if(oldContent.error)return {ok:false,message:"Could not load the current letter: "+oldContent.error.message};oldLetter=oldContent.data?.letter??null;const currentRecipients=await client.from("capsule_recipients").select("recipient_email").eq("capsule_id",id);if(currentRecipients.error)return {ok:false,message:"Could not load the current recipient: "+currentRecipients.error.message};oldRecipients=currentRecipients.data||[];
  }else{
    const createdResult=await client.from("capsules").insert({...details,user_id:user.id}).select("id").single();
    if(createdResult.error||!createdResult.data)return {ok:false,message:"Capsule not saved: "+(createdResult.error?.message||"database insert failed. Apply the Supabase migration first.")};
    capsuleId=createdResult.data.id;created=true;
  }
  if(!capsuleId)return {ok:false,message:"Could not identify the capsule."};
  const uploaded=await uploadMedia(client,user.id,capsuleId,files);
  if(uploaded.error){await cleanupStorage(client,user.id,capsuleId,uploaded.uploaded);if(created)await client.from("capsules").delete().eq("id",capsuleId);return {ok:false,message:uploaded.error+" Your capsule was not saved."};}

  const priorMedia=removing.length?await client.from("capsule_media").select("id,storage_key").eq("capsule_id",capsuleId).in("id",removing):{data:[],error:null};
  if(priorMedia.error){await cleanupStorage(client,user.id,capsuleId,uploaded.uploaded);if(created)await client.from("capsules").delete().eq("id",capsuleId);return {ok:false,message:"Could not verify the selected media. Your capsule was not saved."};}
  if(!created){
    const changed=await client.from("capsules").update(details).eq("id",capsuleId).eq("user_id",user.id);
    if(changed.error){await cleanupStorage(client,user.id,capsuleId,uploaded.uploaded);return {ok:false,message:"Capsule not saved: "+changed.error.message};}
  }
  const content=await client.from("capsule_contents").upsert({capsule_id:capsuleId,letter:values.letter.trim()||null});
  if(content.error){await cleanupStorage(client,user.id,capsuleId,uploaded.uploaded);if(created)await client.from("capsules").delete().eq("id",capsuleId);else if(oldCapsule)await restoreCapsule(client,capsuleId,oldCapsule,oldLetter,oldRecipients);return {ok:false,message:"Capsule content was not saved: "+content.error.message};}
  const recipientError=await resetRecipients(client,capsuleId,values.visibility,values.recipientEmail);
  if(recipientError){await cleanupStorage(client,user.id,capsuleId,uploaded.uploaded);if(created)await client.from("capsules").delete().eq("id",capsuleId);else if(oldCapsule)await restoreCapsule(client,capsuleId,oldCapsule,oldLetter,oldRecipients);return {ok:false,message:"Capsule not saved because recipient access could not be updated: "+recipientError};}
  if(uploaded.rows.length){const savedMedia=await client.from("capsule_media").insert(uploaded.rows);if(savedMedia.error){await cleanupStorage(client,user.id,capsuleId,uploaded.uploaded);if(created)await client.from("capsules").delete().eq("id",capsuleId);else if(oldCapsule)await restoreCapsule(client,capsuleId,oldCapsule,oldLetter,oldRecipients);return {ok:false,message:"Capsule not saved because media metadata could not be stored: "+savedMedia.error.message};}}
  let removalNotice="";
  if(priorMedia.data?.length){const keys=priorMedia.data.map(row=>row.storage_key);const removed=await client.storage.from(BUCKET).remove(keys);if(removed.error){removalNotice="Capsule saved, but one or more selected files could not be removed. Try removing them again from edit.";}else{await client.from("capsule_media").delete().in("id",priorMedia.data.map(row=>row.id));}}
  revalidatePath("/dashboard");revalidatePath("/capsules/"+capsuleId);
  return {ok:true,id:capsuleId,message:removalNotice||(created?"Capsule sealed and saved.":"Changes saved.")};
}
export async function deleteCapsule(id:string):Promise<Result>{
  const client=await createClient();if(!client)return {ok:false,message:"Supabase is not configured."};
  const {data:{user}}=await client.auth.getUser();if(!user)return {ok:false,message:"Please sign in again."};
  const capsule=await client.from("capsules").select("id,unlock_at").eq("id",id).eq("user_id",user.id).maybeSingle();
  if(capsule.error||!capsule.data)return {ok:false,message:"Capsule not found."};
  if(new Date(capsule.data.unlock_at).getTime()<=Date.now())return {ok:false,message:"Opened capsules can no longer be deleted."};
  const media=await client.from("capsule_media").select("storage_key").eq("capsule_id",id);
  if(media.error)return {ok:false,message:"Could not check capsule files: "+media.error.message};
  const keys=(media.data||[]).map(item=>item.storage_key);
  if(keys.length){const removed=await client.storage.from(BUCKET).remove(keys);if(removed.error)return {ok:false,message:"Capsule was not deleted because its private files could not be removed: "+removed.error.message};}
  const result=await client.from("capsules").delete().eq("id",id).eq("user_id",user.id);
  if(result.error)return {ok:false,message:"Could not delete the capsule: "+result.error.message};
  revalidatePath("/dashboard");return {ok:true,message:"Capsule deleted."};
}
