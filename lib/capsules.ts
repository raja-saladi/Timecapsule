import { z } from "zod";
export const capsuleSchema=z.object({title:z.string().trim().min(2,"Add a title with at least 2 characters.").max(80,"Keep the title under 80 characters."),description:z.string().trim().max(300,"Keep the description under 300 characters.").optional().default(""),letter:z.string().max(20000,"Keep your letter under 20,000 characters.").optional().default(""),unlockAt:z.string().min(1,"Choose an unlock date and time."),timeZone:z.string().min(1,"Choose a time zone."),visibility:z.enum(["private","recipient"]),recipientName:z.string().trim().max(80).optional().default(""),recipientEmail:z.union([z.literal(""),z.string().email("Enter a valid recipient email.")]).optional().default("")});
export type CapsuleFormValues=z.infer<typeof capsuleSchema>;
export function localTimeToIso(local:string,timeZone:string):string|null{
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);if(!match)return null;
 const n=match.slice(1).map(Number);const wanted=[n[0],n[1],n[2],n[3],n[4]];
 try{const initial=Date.UTC(wanted[0],wanted[1]-1,wanted[2],wanted[3],wanted[4]);const fmt=new Intl.DateTimeFormat("en-GB",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
 const parts=(date:Date)=>{const values=Object.fromEntries(fmt.formatToParts(date).map(p=>[p.type,p.value]));return [Number(values.year),Number(values.month),Number(values.day),Number(values.hour),Number(values.minute)];};
 let best:Date|null=null;for(let offset=-14*60;offset<=14*60;offset+=15){const candidate=new Date(initial-offset*60000);if(parts(candidate).every((part,index)=>part===wanted[index])&&(!best||candidate<best))best=candidate;}return best?.toISOString()??null;
 }catch{return null;}
}
export function currentTime(){return Date.now();}
export function isUnlocked(unlockAt:string,now=currentTime()){return new Date(unlockAt).getTime()<=now;}
export function formatDate(date:string,timeZone?:string){return new Intl.DateTimeFormat("en",{dateStyle:"medium",timeStyle:"short",...(timeZone?{timeZone}:{})}).format(new Date(date));}
export function countdown(unlockAt:string,now=currentTime()){const diff=new Date(unlockAt).getTime()-now;if(diff<=0)return "Ready to open";const m=Math.floor(diff/60000),d=Math.floor(m/1440),h=Math.floor((m%1440)/60),min=m%60;if(m<1)return "Less than 1m remaining";if(d>0)return d+"d "+h+"h remaining";if(h>0)return h+"h "+min+"m remaining";return min+"m remaining";}
export function validateMedia(files:File[]){const usable=files.filter(file=>file.size>0);if(usable.length>8)return "Choose up to 8 photos or videos.";if(usable.some(file=>!["image/jpeg","image/png","image/webp","image/avif","video/mp4","video/webm","video/quicktime"].includes(file.type)))return "Use JPG, PNG, WebP, AVIF, MP4, WebM, or MOV files.";if(usable.some(file=>file.size>30*1024*1024))return "Each photo or video must be under 30 MB.";if(usable.reduce((sum,file)=>sum+file.size,0)>50*1024*1024)return "Keep the total upload under 50 MB.";return null;}
